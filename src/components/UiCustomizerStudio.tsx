import { useEffect, useState } from 'react';
import {
  Check,
  LayoutPanelLeft,
  Palette,
  RotateCcw,
  Settings,
  Sparkles,
  Tv,
  Undo2,
  X,
} from 'lucide-react';
import {
  BackgroundCustomSlots,
  BackgroundPresetGrid,
  BackgroundTuningSliders,
} from '../backgrounds/BackgroundControls';
import {
  loadBackgroundSettings,
  publishBackgroundSettings,
  requestOnboardingReplay,
  subscribeBackgroundSettings,
} from '../backgrounds/persistence';
import type { BackgroundCustomSlot, BackgroundSettings } from '../backgrounds/types';
import type { ExpressionMood } from '../types/hermes';
import type { BrailleDotProfile } from '../utils/brailleCanvasRaster';
import type { BrailleHorizonStyle } from '../utils/brailleFieldEngine';
import {
  ACCENT_SWATCHES,
  CURATED_UI_PRESETS,
  type UiComposerStyle,
  type UiCornerRadius,
  type UiCustomizationConfig,
  type UiCustomizationPatch,
  type UiDensity,
  type UiFontPreset,
} from '../utils/uiCustomization';
import { ModalShell, MorphTabs, type MorphTabItem } from './ui';

export type StudioTab = 'theme' | 'layout' | 'stage' | 'backdrop';

interface UiCustomizerStudioProps {
  open: boolean;
  activeTab: StudioTab;
  onChangeTab: (tab: StudioTab) => void;
  onClose: () => void;
  config: UiCustomizationConfig;
  mood: ExpressionMood;
  showThinking: boolean;
  voiceMuted: boolean;
  canUndo: boolean;
  onApplyPatch: (patch: UiCustomizationPatch, sourceLabel?: string) => void;
  onUndo: () => void;
  onAskAgent: (prompt: string) => void;
}

const AGENT_PROMPT_EXAMPLES = [
  'Amber CRT with monospace font',
  'Move sidebar right & hide horizon wave',
  'Zen stealth focus mode',
];

const MOOD_OPTIONS: ExpressionMood[] = ['happy', 'focused', 'thinking', 'neutral', 'alert'];

function ToggleRow({
  label,
  hint,
  checked,
  onToggle,
  testId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onToggle: (next: boolean) => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => onToggle(!checked)}
      className="w-full flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.025] hover:border-white/20 px-3 py-2 text-left transition-colors cursor-pointer"
    >
      <div className="min-w-0">
        <div className="text-xs font-medium text-white">{label}</div>
        {hint && <div className="text-[10.5px] text-emerald-100/50 truncate">{hint}</div>}
      </div>
      <span
        className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center shrink-0 ${
          checked ? 'bg-[#34D399]' : 'bg-white/15'
        }`}
      >
        <span
          className={`w-4 h-4 rounded-full bg-[#06130F] shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

function SliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  testId,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (val: number) => void;
  testId?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-emerald-50/85">{label}</span>
        <span className="font-mono text-[#6EE7B7] tabular-nums">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#34D399] cursor-pointer h-1.5"
      />
    </label>
  );
}

function SegmentedRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (val: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-emerald-50/80">{label}</div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={active}
              className={`min-h-[34px] rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                active
                  ? 'ui-active-tab'
                  : 'border-white/10 bg-white/[0.025] text-emerald-100/70 hover:text-white hover:border-white/25'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function UiCustomizerStudio({
  open,
  activeTab,
  onChangeTab,
  onClose,
  config,
  mood,
  showThinking,
  voiceMuted,
  canUndo,
  onApplyPatch,
  onUndo,
  onAskAgent,
}: UiCustomizerStudioProps) {
  const [agentPrompt, setAgentPrompt] = useState('');
  const [bgSettings, setBgSettings] = useState<BackgroundSettings>(() => loadBackgroundSettings());

  useEffect(() => {
    setBgSettings(loadBackgroundSettings());
    return subscribeBackgroundSettings((next) => setBgSettings(next));
  }, [open]);

  const tabs: MorphTabItem<StudioTab>[] = [
    { id: 'theme', label: 'Appearance', icon: <Palette className="w-3.5 h-3.5 shrink-0" />, testId: 'studio-tab-theme' },
    { id: 'layout', label: 'Layout', icon: <LayoutPanelLeft className="w-3.5 h-3.5 shrink-0" />, testId: 'studio-tab-layout' },
    { id: 'stage', label: 'Motion & Stage', icon: <Tv className="w-3.5 h-3.5 shrink-0" />, testId: 'studio-tab-stage' },
    { id: 'backdrop', label: 'Backdrop', icon: <Sparkles className="w-3.5 h-3.5 shrink-0" />, testId: 'studio-tab-backdrop' },
  ];

  const handleBgSelect = (id: string) => {
    const next = { ...bgSettings, activeId: id };
    setBgSettings(next);
    publishBackgroundSettings(next);
    onApplyPatch({ backgroundPresetId: id }, 'studio');
  };

  const handleBgOpacity = (opacity: number) => {
    const next = { ...bgSettings, opacity };
    setBgSettings(next);
    publishBackgroundSettings(next);
  };

  const handleBgBlur = (blurPx: number) => {
    const next = { ...bgSettings, blurPx };
    setBgSettings(next);
    publishBackgroundSettings(next);
  };

  const handleAddSlot = (slot: BackgroundCustomSlot) => {
    const next = {
      ...bgSettings,
      activeId: slot.id,
      customSlots: [slot, ...bgSettings.customSlots.filter((s) => s.id !== slot.id)].slice(0, 6),
    };
    setBgSettings(next);
    publishBackgroundSettings(next);
  };

  const handleRemoveSlot = (id: string) => {
    const remaining = bgSettings.customSlots.filter((s) => s.id !== id);
    const next = {
      ...bgSettings,
      customSlots: remaining,
      activeId: bgSettings.activeId === id ? 'aurora-drift' : bgSettings.activeId,
    };
    setBgSettings(next);
    publishBackgroundSettings(next);
  };

  const submitAgentPrompt = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = agentPrompt.trim();
    if (!trimmed) return;
    setAgentPrompt('');
    onAskAgent(trimmed);
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      ariaLabel="Settings"
      testId="ui-studio-drawer"
      maxWidthClass="w-[min(780px,96vw)]"
    >
      {/* Modal Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-white/10 shrink-0">
        <div>
          <h2 className="text-[15px] font-semibold text-white tracking-tight flex items-center gap-2">
            <Settings className="w-4 h-4 text-[#6EE7B7]" />
            <span>Settings</span>
          </h2>
          <p className="text-xs text-emerald-100/55 mt-0.5">
            Workspace appearance, layout, stage motion, and backdrops
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Settings"
          data-testid="ui-studio-close"
          className="ui-tactile w-8 h-8 rounded-lg border border-white/10 bg-white/[0.04] text-emerald-100/70 hover:text-white hover:bg-white/[0.08] flex items-center justify-center cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Natural-Language UI Update Prompt inside Settings */}
      <div className="px-5 py-2.5 border-b border-white/8 bg-white/[0.02] space-y-1.5 shrink-0">
        <form onSubmit={submitAgentPrompt} className="flex items-center gap-2">
          <label htmlFor="ui-studio-agent-prompt" className="sr-only">
            Ask Hermes to update the interface
          </label>
          <input
            id="ui-studio-agent-prompt"
            data-testid="ui-studio-agent-input"
            type="text"
            value={agentPrompt}
            onChange={(e) => setAgentPrompt(e.target.value)}
            placeholder='Describe a UI update: "cyber violet, hide horizon"...'
            className="flex-1 min-w-0 rounded-xl bg-black/40 border border-white/14 px-3 py-2 text-xs text-white placeholder:text-emerald-100/40 focus:outline-none focus:border-[#34D399]"
          />
          <button
            type="submit"
            data-testid="ui-studio-agent-submit"
            className="ui-accent-btn ui-tactile px-3.5 py-2 rounded-xl text-xs font-semibold hover:opacity-90 shrink-0 cursor-pointer"
          >
            Apply
          </button>
        </form>

        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px]">
          <span className="text-emerald-100/40 font-mono">Try:</span>
          {AGENT_PROMPT_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onAskAgent(example)}
              className="ui-tactile text-emerald-100/65 hover:text-[#6EE7B7] underline underline-offset-4 decoration-white/15 hover:decoration-[#34D399]/50 transition-colors cursor-pointer"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Two-Pane Responsive Settings Body */}
      <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
        {/* Gliding Category Rail (2x2 grid on mobile, Left rail on desktop) */}
        <div className="px-3 py-2.5 sm:p-3 sm:w-48 border-b sm:border-b-0 sm:border-r border-white/8 shrink-0">
          <MorphTabs
            items={tabs}
            value={activeTab}
            onChange={onChangeTab}
            ariaLabel="Settings categories"
            variant="rail"
          />
        </div>

        {/* Scrollable Settings Controls */}
        <div key={activeTab} className="ui-card-enter flex-1 min-h-0 overflow-y-auto cyber-scroll p-4 sm:px-5 sm:py-3.5 pb-5 space-y-3.5">
            {activeTab === 'theme' && (
              <>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-emerald-100/65">
                    Curated themes
                  </div>
                <div className="grid grid-cols-2 gap-2">
                  {CURATED_UI_PRESETS.map((preset) => {
                    const presetAccent = preset.config.accentHex ?? '#34D399';
                    const active =
                      config.accentHex === presetAccent &&
                      config.surfaceHex === (preset.config.surfaceHex ?? config.surfaceHex) &&
                      config.cornerRadius === (preset.config.cornerRadius ?? config.cornerRadius);
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        data-testid={`ui-preset-${preset.id}`}
                        onClick={() => onApplyPatch({ presetId: preset.id }, 'studio')}
                        className={`text-left rounded-xl border px-2.5 py-2 transition-colors cursor-pointer ${
                          active
                            ? 'ui-active-card'
                            : 'border-white/10 bg-white/[0.025] hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex h-2 w-10 rounded-sm overflow-hidden border border-white/15 shrink-0">
                            <span className="flex-1" style={{ backgroundColor: presetAccent }} />
                            <span
                              className="flex-1"
                              style={{ backgroundColor: preset.config.surfaceHex ?? '#0A1613' }}
                            />
                          </span>
                          {active && <Check className="w-3.5 h-3.5 text-[#6EE7B7]" />}
                        </div>
                        <div className="mt-1.5 text-xs font-semibold text-white truncate">
                          {preset.name}
                        </div>
                        <div className="text-[10.5px] text-emerald-100/60 leading-snug line-clamp-1 mt-0.5">
                          {preset.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 pt-2.5 border-t border-white/8">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-emerald-100/65">
                    Accent palette
                  </span>
                  <span className="font-mono text-[11px] text-[#6EE7B7]">{config.accentHex}</span>
                </div>
                <div className="flex items-center flex-wrap gap-2">
                  {ACCENT_SWATCHES.map((swatch) => {
                    const active = config.accentHex === swatch.accentHex;
                    return (
                      <button
                        key={swatch.id}
                        type="button"
                        data-testid={`ui-swatch-${swatch.id}`}
                        onClick={() => onApplyPatch({ accentPreset: swatch.id }, 'studio')}
                        aria-label={`Set accent color to ${swatch.label}`}
                        title={swatch.label}
                        className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-transform cursor-pointer ${
                          active ? 'scale-105 border-white' : 'border-white/20 hover:scale-105'
                        }`}
                        style={{ backgroundColor: swatch.accentHex }}
                      >
                        {active && <Check className="w-3.5 h-3.5 text-[#06120D]" />}
                      </button>
                    );
                  })}

                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-white/14 bg-white/[0.04] px-2.5 h-7 text-[11px] text-emerald-100/80 cursor-pointer hover:border-white/30">
                    <span>Custom</span>
                    <input
                      type="color"
                      aria-label="Custom accent hex color"
                      value={config.accentHex}
                      onChange={(e) => onApplyPatch({ accentHex: e.target.value }, 'studio')}
                      className="w-3.5 h-3.5 appearance-none rounded border border-white/25 bg-transparent cursor-pointer p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-[3px]"
                    />
                  </label>
                </div>

                <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] px-3 py-1.5 text-xs cursor-pointer hover:border-white/20 transition-colors">
                  <span>Panel surface tint</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-emerald-100/60">
                      {config.surfaceHex}
                    </span>
                    <input
                      type="color"
                      aria-label="Panel surface tint hex color"
                      value={config.surfaceHex}
                      onChange={(e) => onApplyPatch({ surfaceHex: e.target.value }, 'studio')}
                      className="w-4 h-4 appearance-none rounded border border-white/25 bg-transparent cursor-pointer p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-[3px]"
                    />
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 pt-2.5 border-t border-white/8">
                <SliderRow
                  label="Panel glass opacity"
                  valueLabel={`${Math.round(config.panelAlpha * 100)}%`}
                  min={0.35}
                  max={0.95}
                  step={0.01}
                  value={config.panelAlpha}
                  onChange={(val) => onApplyPatch({ panelAlpha: val }, 'studio')}
                  testId="ui-panel-alpha-slider"
                />
                <SliderRow
                  label="Border accent opacity"
                  valueLabel={`${Math.round(config.borderOpacity * 100)}%`}
                  min={0.08}
                  max={0.9}
                  step={0.02}
                  value={config.borderOpacity}
                  onChange={(val) => onApplyPatch({ borderOpacity: val }, 'studio')}
                />
                <div className="sm:col-span-2">
                  <SliderRow
                    label="Stage glow intensity"
                    valueLabel={`${Math.round(config.glowIntensity * 100)}%`}
                    min={0}
                    max={2}
                    step={0.05}
                    value={config.glowIntensity}
                    onChange={(val) => onApplyPatch({ glowIntensity: val }, 'studio')}
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === 'layout' && (
            <>
              <div className="space-y-2">
                <div className="text-xs font-medium text-emerald-100/65">
                  Workspace layout
                </div>
                <ToggleRow
                  label="Sidebar panel"
                  hint="Tasks, approval gates & channel lanes"
                  checked={config.sidebarVisible}
                  onToggle={(next) => onApplyPatch({ sidebarVisible: next }, 'studio')}
                  testId="ui-toggle-sidebar"
                />
                <ToggleRow
                  label="Sidebar queue list"
                  checked={config.sidebarQueueVisible}
                  onToggle={(next) => onApplyPatch({ sidebarQueueVisible: next }, 'studio')}
                />
                <ToggleRow
                  label="Sidebar channel switcher"
                  checked={config.sidebarChannelsVisible}
                  onToggle={(next) => onApplyPatch({ sidebarChannelsVisible: next }, 'studio')}
                />
                <ToggleRow
                  label="Top workspace tabs bar"
                  hint="Shows compact floating toggle when hidden"
                  checked={config.showTopNav}
                  onToggle={(next) => onApplyPatch({ showTopNav: next }, 'studio')}
                  testId="ui-toggle-topnav"
                />
              </div>

              <div className="space-y-3 pt-2 border-t border-white/8">
                <SegmentedRow
                  label="Sidebar side (desktop)"
                  value={config.sidebarPosition}
                  options={[
                    { id: 'left', label: 'Left' },
                    { id: 'right', label: 'Right' },
                  ]}
                  onChange={(val) =>
                    onApplyPatch({ sidebarPosition: val, sidebarVisible: true }, 'studio')
                  }
                />

                <SliderRow
                  label="Sidebar width"
                  valueLabel={`${config.sidebarWidthPx}px`}
                  min={236}
                  max={420}
                  step={4}
                  value={config.sidebarWidthPx}
                  onChange={(val) => onApplyPatch({ sidebarWidthPx: val }, 'studio')}
                />

                <SegmentedRow<UiCornerRadius>
                  label="Corner geometry"
                  value={config.cornerRadius}
                  options={[
                    { id: 'sharp', label: 'Sharp' },
                    { id: 'rounded', label: 'Rounded' },
                    { id: 'pill', label: 'Soft Pill' },
                  ]}
                  onChange={(val) => onApplyPatch({ cornerRadius: val }, 'studio')}
                />

                <SegmentedRow<UiDensity>
                  label="Layout density"
                  value={config.density}
                  options={[
                    { id: 'compact', label: 'Compact' },
                    { id: 'comfortable', label: 'Balanced' },
                    { id: 'airy', label: 'Airy' },
                  ]}
                  onChange={(val) => onApplyPatch({ density: val }, 'studio')}
                />

                <SegmentedRow<UiComposerStyle>
                  label="Composer dock style"
                  value={config.composerStyle}
                  options={[
                    { id: 'docked', label: 'Docked' },
                    { id: 'floating', label: 'Floating' },
                    { id: 'minimal', label: 'Minimal' },
                  ]}
                  onChange={(val) => onApplyPatch({ composerStyle: val }, 'studio')}
                />
              </div>

              <div className="space-y-3 pt-2 border-t border-white/8">
                <SegmentedRow<UiFontPreset>
                  label="Typography family"
                  value={config.fontPreset}
                  options={[
                    { id: 'jakarta', label: 'Sans' },
                    { id: 'mono', label: 'Mono' },
                    { id: 'display', label: 'Display' },
                    { id: 'system', label: 'System' },
                  ]}
                  onChange={(val) => onApplyPatch({ fontPreset: val }, 'studio')}
                />

                <SliderRow
                  label="Text scale"
                  valueLabel={`${Math.round(config.fontScale * 100)}%`}
                  min={0.85}
                  max={1.25}
                  step={0.02}
                  value={config.fontScale}
                  onChange={(val) => onApplyPatch({ fontScale: val }, 'studio')}
                />

                <label className="block space-y-1">
                  <span className="text-[11px] text-emerald-50/80">Workspace brand title</span>
                  <input
                    type="text"
                    value={config.workspaceTitle}
                    onChange={(e) => onApplyPatch({ workspaceTitle: e.target.value }, 'studio')}
                    maxLength={28}
                    className="w-full rounded-xl bg-black/35 border border-white/12 px-3 py-1.5 font-mono text-xs text-white focus:outline-none focus:border-[#34D399]"
                  />
                </label>
              </div>
            </>
          )}

          {activeTab === 'stage' && (
            <>
              <div className="space-y-2">
                <div className="text-xs font-medium text-emerald-100/65">
                  Character &amp; wave stage
                </div>
                <ToggleRow
                  label="Character portrait"
                  hint="Animated monochrome halftone anime avatar"
                  checked={config.portraitVisible}
                  onToggle={(next) => onApplyPatch({ portraitVisible: next }, 'studio')}
                  testId="ui-toggle-portrait"
                />
                <ToggleRow
                  label="Braille horizon wave"
                  hint="Ambient animated spectrum beneath character"
                  checked={config.horizonVisible}
                  onToggle={(next) => onApplyPatch({ horizonVisible: next }, 'studio')}
                  testId="ui-toggle-horizon"
                />
                <ToggleRow
                  label="Speech readout & status"
                  checked={config.statusReadoutVisible}
                  onToggle={(next) => onApplyPatch({ statusReadoutVisible: next }, 'studio')}
                />
                <ToggleRow
                  label="Calm / reduced motion"
                  checked={config.reducedMotion}
                  onToggle={(next) => onApplyPatch({ reducedMotion: next }, 'studio')}
                />
                <ToggleRow
                  label="Inline activity trace in chat"
                  hint="Tasks sidebar already tracks runs; enable to also list steps inline"
                  checked={showThinking}
                  onToggle={(next) => onApplyPatch({ showThinking: next }, 'studio')}
                />
                <ToggleRow
                  label="Mute Hermes voice synthesis"
                  checked={voiceMuted}
                  onToggle={(next) => onApplyPatch({ voiceMuted: next }, 'studio')}
                />
              </div>

              <div className="space-y-3 pt-2 border-t border-white/8">
                <SliderRow
                  label="Portrait scale"
                  valueLabel={`${Math.round(config.portraitScale * 100)}%`}
                  min={0.6}
                  max={1.45}
                  step={0.05}
                  value={config.portraitScale}
                  onChange={(val) => onApplyPatch({ portraitScale: val }, 'studio')}
                />
                <SliderRow
                  label="Horizon wave intensity"
                  valueLabel={`${Math.round(config.horizonOpacity * 100)}%`}
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={config.horizonOpacity}
                  onChange={(val) => onApplyPatch({ horizonOpacity: val }, 'studio')}
                />
                <SliderRow
                  label="Phosphor dot bloom"
                  valueLabel={`${Math.round(config.brailleBloom * 100)}%`}
                  min={0}
                  max={1.5}
                  step={0.05}
                  value={config.brailleBloom}
                  onChange={(val) => onApplyPatch({ brailleBloom: val }, 'studio')}
                />
                <SliderRow
                  label="Animation speed"
                  valueLabel={`${config.animationSpeed.toFixed(2)}x`}
                  min={0.3}
                  max={1.8}
                  step={0.05}
                  value={config.animationSpeed}
                  onChange={(val) => onApplyPatch({ animationSpeed: val }, 'studio')}
                />
                <SegmentedRow<BrailleDotProfile>
                  label="Braille dot matrix optics"
                  value={config.brailleDotProfile}
                  options={[
                    { id: 'crisp', label: 'Crisp' },
                    { id: 'balanced', label: 'Balanced' },
                    { id: 'phosphor', label: 'Phosphor' },
                  ]}
                  onChange={(val) => onApplyPatch({ brailleDotProfile: val }, 'studio')}
                />
                <SegmentedRow<BrailleHorizonStyle>
                  label="Horizon wave mode"
                  value={config.horizonStyle}
                  options={[
                    { id: 'silk', label: 'Silk' },
                    { id: 'peaks', label: 'Peaks' },
                    { id: 'pulse', label: 'Pulse' },
                  ]}
                  onChange={(val) => onApplyPatch({ horizonStyle: val, horizonVisible: true }, 'studio')}
                />
              </div>

              <div className="space-y-2.5 pt-2 border-t border-white/8">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-emerald-50/80">Portrait halftone tint</span>
                  <button
                    type="button"
                    onClick={() => onApplyPatch({ portraitTintHex: null }, 'studio')}
                    className="text-[10.5px] font-mono text-[#6EE7B7] hover:underline cursor-pointer"
                  >
                    {config.portraitTintHex ? 'Reset Auto' : 'Auto'}
                  </button>
                </div>
                <div className="flex items-center flex-wrap gap-2">
                  {[null, '#FFFFFF', '#6EE7B7', '#D8B4FE', '#FCD34D', '#7DD3FC', '#FDA4AF'].map(
                    (tint) => {
                      const active = config.portraitTintHex === tint;
                      return (
                        <button
                          key={tint ?? 'auto'}
                          type="button"
                          onClick={() => onApplyPatch({ portraitTintHex: tint }, 'studio')}
                          className={`px-2.5 h-7 rounded-lg border text-[10.5px] font-mono cursor-pointer transition-colors ${
                            active
                              ? 'border-white bg-white/15 text-white'
                              : 'border-white/12 bg-white/[0.03] text-emerald-100/75 hover:border-white/25'
                          }`}
                        >
                          {tint ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-sm"
                                style={{ backgroundColor: tint }}
                              />
                              <span>{tint}</span>
                            </span>
                          ) : (
                            'Auto'
                          )}
                        </button>
                      );
                    }
                  )}
                </div>

                <SegmentedRow<ExpressionMood>
                  label="Hermes expression mood"
                  value={mood}
                  options={MOOD_OPTIONS.map((m) => ({ id: m, label: m }))}
                  onChange={(val) => onApplyPatch({ mood: val }, 'studio')}
                />
              </div>
            </>
          )}

          {activeTab === 'backdrop' && (
            <div className="space-y-4">
              <BackgroundPresetGrid activeId={bgSettings.activeId} onSelectActive={handleBgSelect} />

              <div className="pt-2 border-t border-white/8">
                <BackgroundTuningSliders
                  opacity={bgSettings.opacity}
                  blurPx={bgSettings.blurPx}
                  onChangeOpacity={handleBgOpacity}
                  onChangeBlurPx={handleBgBlur}
                />
              </div>

              <div className="pt-2 border-t border-white/8">
                <BackgroundCustomSlots
                  activeId={bgSettings.activeId}
                  customSlots={bgSettings.customSlots}
                  onSelectActive={handleBgSelect}
                  onAddCustomSlot={handleAddSlot}
                  onRemoveCustomSlot={handleRemoveSlot}
                />
              </div>

              <div className="pt-2 border-t border-white/8 flex items-center justify-between">
                <span className="text-xs text-emerald-100/55">Need the guided walkthrough?</span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    requestOnboardingReplay();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-[#6EE7B7] hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Replay onboarding</span>
                </button>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Footer Undo / Reset / Done */}
        <div className="px-5 py-3.5 border-t border-white/10 bg-black/25 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canUndo}
              onClick={onUndo}
              data-testid="ui-studio-undo"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] text-xs text-emerald-50/85 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Undo</span>
            </button>

            <button
              type="button"
              onClick={() => onApplyPatch({ resetAll: true }, 'studio')}
              data-testid="ui-studio-reset"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] hover:border-rose-400/50 hover:text-rose-200 text-xs text-emerald-100/75 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset defaults</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="ui-accent-btn ui-tactile px-4 py-1.5 rounded-lg text-xs font-semibold hover:opacity-90 cursor-pointer"
          >
            Done
          </button>
        </div>
    </ModalShell>
  );
}
