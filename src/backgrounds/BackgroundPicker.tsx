import { useState } from 'react';
import { Layers, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { requestUiCustomizerOpen } from '../utils/uiCustomization';
import {
  BackgroundCustomSlots,
  BackgroundPresetGrid,
  BackgroundTuningSliders,
} from './BackgroundControls';
import { requestOnboardingReplay } from './persistence';
import type { BackgroundCustomSlot, BackgroundSettings } from './types';

interface BackgroundPickerProps {
  settings: BackgroundSettings;
  onSelectActive: (id: string) => void;
  onChangeOpacity: (opacity: number) => void;
  onChangeBlurPx: (blurPx: number) => void;
  onAddCustomSlot: (slot: BackgroundCustomSlot) => void;
  onRemoveCustomSlot: (id: string) => void;
}

export function BackgroundPicker({
  settings,
  onSelectActive,
  onChangeOpacity,
  onChangeBlurPx,
  onAddCustomSlot,
  onRemoveCustomSlot,
}: BackgroundPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Existing-neutral corner affordance; never alters or shifts existing UI */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="backgrounds-trigger"
        aria-expanded={open}
        aria-label="Open Backgrounds picker"
        title="Backgrounds"
        className={`fixed bottom-[142px] lg:bottom-3 right-3 z-50 w-8 h-8 lg:w-7 lg:h-7 rounded-lg border flex items-center justify-center transition-colors cursor-pointer backdrop-blur-md ${
          open
            ? 'border-[#34D399]/60 bg-[#0A1613]/92 text-[#6EE7B7]'
            : 'border-white/12 bg-[#07120F]/78 text-emerald-100/55 hover:text-white hover:border-white/25'
        }`}
      >
        <Layers className="w-3.5 h-3.5" />
      </button>

      {open && (
        <aside
          aria-label="Backgrounds"
          data-testid="backgrounds-picker"
          className="fixed bottom-[182px] lg:bottom-12 right-3 z-50 w-[min(336px,calc(100vw-1.5rem))] max-h-[64vh] lg:max-h-[78vh] overflow-y-auto cyber-scroll rounded-2xl bg-[#091512]/94 border border-white/15 backdrop-blur-xl shadow-[0_20px_56px_rgba(0,0,0,0.65)] p-3.5 space-y-3.5 text-[#ECF3F0]"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold tracking-tight text-white">Backgrounds</h2>
              <p className="text-[11px] text-emerald-100/50">Ambient glass presets &amp; custom media</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Backgrounds"
              className="p-1 rounded-md text-emerald-100/55 hover:text-white hover:bg-white/8 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <BackgroundPresetGrid
            activeId={settings.activeId}
            onSelectActive={onSelectActive}
          />

          <div className="pt-1 border-t border-white/8">
            <BackgroundTuningSliders
              opacity={settings.opacity}
              blurPx={settings.blurPx}
              onChangeOpacity={onChangeOpacity}
              onChangeBlurPx={onChangeBlurPx}
            />
          </div>

          <div className="pt-1 border-t border-white/8">
            <BackgroundCustomSlots
              activeId={settings.activeId}
              customSlots={settings.customSlots}
              onSelectActive={onSelectActive}
              onAddCustomSlot={onAddCustomSlot}
              onRemoveCustomSlot={onRemoveCustomSlot}
            />
          </div>

          <div className="pt-2 border-t border-white/8 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                requestUiCustomizerOpen('theme');
              }}
              data-testid="open-full-studio-from-bg"
              className="inline-flex items-center gap-1.5 text-[11px] text-[#6EE7B7] hover:text-white transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Full UI Studio →</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                requestOnboardingReplay();
              }}
              data-testid="replay-onboarding-button"
              className="inline-flex items-center gap-1.5 text-[11px] text-emerald-100/65 hover:text-[#6EE7B7] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Replay intro</span>
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
