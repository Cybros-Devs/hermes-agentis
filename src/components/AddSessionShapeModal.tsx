import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ExpressionMood } from '../types/hermes';
import type { BrailleDotProfile } from '../utils/brailleCanvasRaster';
import {
  BRAILLE_SHAPE_CATALOG,
  BRAILLE_TINT_PALETTE,
  type BrailleShapeKind,
  type BrailleShapeTint,
} from '../utils/brailleShapesEngine';
import {
  AVAILABLE_DOT_SKILLS,
  DOT_STARTER_TEMPLATES,
  formatAutonomyLabel,
  formatSandboxLabel,
  type DotAutonomyMode,
  type DotSandboxEnv,
} from '../utils/canvasSessions';
import { BrailleShapeCanvas } from './BrailleShapeCanvas';
import { ModalShell } from './ui';

export interface CreateDotSessionPayload {
  name: string;
  topic: string;
  persona: string;
  shape: BrailleShapeKind;
  tint: BrailleShapeTint;
  eyeStyle: 'open' | 'sleepy';
  autonomyMode?: DotAutonomyMode;
  scheduleLabel?: string;
  sandboxEnv?: DotSandboxEnv;
  skills?: string[];
}

interface AddSessionShapeModalProps {
  open: boolean;
  dotProfile?: BrailleDotProfile;
  bloom?: number;
  onClose: () => void;
  onCreate: (payload: CreateDotSessionPayload) => void;
}

const TINT_KEYS = Object.keys(BRAILLE_TINT_PALETTE) as BrailleShapeTint[];

const AUDITION_MOODS: ReadonlyArray<{ id: 'idle' | 'speak' | 'think' | 'happy'; label: string; mood: ExpressionMood }> = [
  { id: 'happy', label: 'Happy', mood: 'happy' },
  { id: 'speak', label: 'Speak', mood: 'speaking' },
  { id: 'think', label: 'Think', mood: 'thinking' },
  { id: 'idle', label: 'Calm', mood: 'neutral' },
];

export function AddSessionShapeModal({
  open,
  dotProfile = 'balanced',
  bloom = 0.75,
  onClose,
  onCreate,
}: AddSessionShapeModalProps) {
  const defaultMeta = BRAILLE_SHAPE_CATALOG[2]; // Neko default
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('custom');
  const [selectedShape, setSelectedShape] = useState<BrailleShapeKind>(defaultMeta.kind);
  const [selectedTint, setSelectedTint] = useState<BrailleShapeTint>(defaultMeta.defaultTint);
  const [eyeStyle, setEyeStyle] = useState<'open' | 'sleepy'>(defaultMeta.defaultEyeStyle);
  const [auditionState, setAuditionState] = useState<'idle' | 'speak' | 'think' | 'happy'>('happy');
  const [autonomyMode, setAutonomyMode] = useState<DotAutonomyMode>('manual');
  const [scheduleLabel, setScheduleLabel] = useState('On-demand');
  const [sandboxEnv, setSandboxEnv] = useState<DotSandboxEnv>('cloud-sandbox');
  const [skills, setSkills] = useState<string[]>(['browser', 'files']);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [persona, setPersona] = useState(defaultMeta.defaultAgentPersona);
  const [personaEdited, setPersonaEdited] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const activeMeta =
    BRAILLE_SHAPE_CATALOG.find((s) => s.kind === selectedShape) ?? BRAILLE_SHAPE_CATALOG[0];
  const activePalette = BRAILLE_TINT_PALETTE[selectedTint];

  const handleApplyTemplate = (templateId: string) => {
    const tpl = DOT_STARTER_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    setSelectedTemplateId(tpl.id);
    setSelectedShape(tpl.shape);
    setSelectedTint(tpl.tint);
    setAutonomyMode(tpl.autonomyMode);
    setScheduleLabel(tpl.scheduleLabel);
    setSandboxEnv(tpl.sandboxEnv);
    setSkills([...tpl.skills]);
    if (!personaEdited) {
      setPersona(tpl.persona);
    }
  };

  const handleSelectShape = (kind: BrailleShapeKind) => {
    setSelectedShape(kind);
    const meta = BRAILLE_SHAPE_CATALOG.find((s) => s.kind === kind);
    if (meta) {
      setSelectedTint(meta.defaultTint);
      setEyeStyle(meta.defaultEyeStyle);
      if (!personaEdited) {
        setPersona(meta.defaultAgentPersona);
      }
    }
  };

  const handleToggleSkill = (skillId: string) => {
    setSkills((prev) =>
      prev.includes(skillId) ? prev.filter((s) => s !== skillId) : [...prev, skillId]
    );
  };

  const handleSetAutonomy = (mode: DotAutonomyMode) => {
    setAutonomyMode(mode);
    setScheduleLabel(
      mode === 'manual' ? 'On-demand' : mode === 'watch' ? 'Continuous watch' : 'Every 15m'
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) {
      setError('Enter a session name so hermes-agent can isolate its thread.');
      return;
    }
    onCreate({
      name: cleaned,
      topic: topic.trim() || activeMeta.tagline,
      persona: persona.trim() || activeMeta.defaultAgentPersona,
      shape: selectedShape,
      tint: selectedTint,
      eyeStyle,
      autonomyMode,
      scheduleLabel,
      sandboxEnv,
      skills,
    });
    setName('');
    setTopic('');
    setPersona(activeMeta.defaultAgentPersona);
    setPersonaEdited(false);
    setError('');
    onClose();
  };

  const currentAudition = AUDITION_MOODS.find((a) => a.id === auditionState) ?? AUDITION_MOODS[0];

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      ariaLabelledBy="add-braille-session-title"
      maxWidthClass="w-[min(860px,96vw)]"
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
        <div>
          <h2
            id="add-braille-session-title"
            className="text-base font-semibold text-white"
          >
            Dot &amp; Character Studio
          </h2>
          <p className="text-xs text-emerald-100/60 mt-0.5">
            Design an autonomous hermes-agent Dot with isolated sandbox, trigger cadence, and anime silhouette
          </p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close add session dialog"
          className="ui-tactile w-8 h-8 rounded-lg border border-white/12 bg-white/[0.04] text-emerald-100/70 hover:text-white hover:border-white/25 flex items-center justify-center cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 cyber-scroll">
          <div className="grid grid-cols-1 md:grid-cols-[270px_1fr] gap-5 items-start">
            {/* Left Column: Large Interactive Character Audition Stage + Tint & Eyes */}
            <div className="rounded-xl border border-white/10 bg-[#050E0B]/85 p-4 flex flex-col items-center space-y-3.5">
              <div className="w-full flex items-center justify-between text-[11px]">
                <span className="font-mono font-medium text-white">{activeMeta.label}</span>
                <span className="font-mono text-emerald-100/50">{activeMeta.animeTitle}</span>
              </div>

              <div className="relative py-2 flex items-center justify-center">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-4 rounded-full opacity-75"
                  style={{
                    background: `radial-gradient(circle, ${activePalette.glow} 0%, transparent 70%)`,
                  }}
                />
                <BrailleShapeCanvas
                  variant="creature"
                  shape={selectedShape}
                  tint={selectedTint}
                  mood={currentAudition.mood}
                  eyeStyle={eyeStyle}
                  isSpeaking={auditionState === 'speak'}
                  isThinking={auditionState === 'think'}
                  viseme={auditionState === 'speak' ? 'mid' : 'closed'}
                  energy={auditionState === 'speak' ? 0.55 : auditionState === 'think' ? 0.25 : 0.08}
                  dotProfile={dotProfile}
                  bloom={bloom}
                />
              </div>

              {/* Audition Live Motion States */}
              <div className="w-full space-y-1.5">
                <span className="block text-[11px] font-medium text-emerald-100/70">
                  Audition State
                </span>
                <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-white/[0.04] border border-white/10">
                  {AUDITION_MOODS.map((opt) => {
                    const active = auditionState === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setAuditionState(opt.id)}
                        className={`py-1 rounded-md text-[11px] font-medium cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#34D399] text-[#05140E] font-semibold'
                            : 'text-emerald-100/65 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Phosphor Tint */}
              <div className="w-full space-y-1.5">
                <span className="block text-[11px] font-medium text-emerald-100/70">
                  Phosphor Tint · {activePalette.label}
                </span>
                <div className="flex items-center justify-between gap-1 py-0.5">
                  {TINT_KEYS.map((tintKey) => {
                    const palette = BRAILLE_TINT_PALETTE[tintKey];
                    const active = tintKey === selectedTint;
                    return (
                      <button
                        key={tintKey}
                        type="button"
                        onClick={() => setSelectedTint(tintKey)}
                        aria-label={`Tint ${palette.label}`}
                        aria-pressed={active}
                        title={palette.label}
                        className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer shrink-0 ${
                          active ? 'border-white scale-110' : 'border-white/15 hover:scale-105'
                        }`}
                        style={{ backgroundColor: palette.mid }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Resting Eyes */}
              <div className="w-full space-y-1.5">
                <span className="block text-[11px] font-medium text-emerald-100/70">
                  Resting Eyes
                </span>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.04] border border-white/10">
                  <button
                    type="button"
                    onClick={() => setEyeStyle('open')}
                    className={`flex-1 py-1 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      eyeStyle === 'open'
                        ? 'bg-[#34D399] text-[#05140E] font-semibold'
                        : 'text-emerald-100/70 hover:text-white'
                    }`}
                  >
                    Bright Eyes
                  </button>
                  <button
                    type="button"
                    onClick={() => setEyeStyle('sleepy')}
                    className={`flex-1 py-1 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      eyeStyle === 'sleepy'
                        ? 'bg-[#34D399] text-[#05140E] font-semibold'
                        : 'text-emerald-100/70 hover:text-white'
                    }`}
                  >
                    Calm Sleepy
                  </button>
                </div>
              </div>

              <div className="w-full pt-2 border-t border-white/8 text-[11px] font-mono text-emerald-100/55 space-y-0.5 tabular-nums">
                <div>{formatSandboxLabel(sandboxEnv)}</div>
                <div>
                  {formatAutonomyLabel(autonomyMode, scheduleLabel)} · {skills.length} skills
                </div>
              </div>
            </div>

            {/* Right Column: Starter Template, 3x3 Silhouette Picker, Autonomy & Persona */}
            <div className="space-y-3.5">
              {/* Starter Templates */}
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-emerald-50/85">
                  Dot Starter Template
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {DOT_STARTER_TEMPLATES.map((tpl) => {
                    const active = selectedTemplateId === tpl.id;
                    return (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => handleApplyTemplate(tpl.id)}
                        className={`px-3 py-1.5 rounded-lg border text-left cursor-pointer ${
                          active
                            ? 'border-[#34D399] bg-[#34D399]/14'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/25'
                        }`}
                      >
                        <div className="text-[11.5px] font-semibold text-white whitespace-nowrap">
                          {tpl.label}
                        </div>
                        <div className="text-[10px] text-emerald-100/55 truncate">
                          {tpl.scheduleLabel} · {tpl.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 9 Anime Character Braille Picker */}
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-emerald-50/85">
                  Anime Character Silhouette
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {BRAILLE_SHAPE_CATALOG.map((meta) => {
                    const isSelected = meta.kind === selectedShape;
                    const displayTint = isSelected ? selectedTint : meta.defaultTint;
                    return (
                      <button
                        key={meta.kind}
                        type="button"
                        onClick={() => handleSelectShape(meta.kind)}
                        aria-pressed={isSelected}
                        aria-label={`Select ${meta.label} (${meta.animeTitle})`}
                        className={`flex flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-1.5 cursor-pointer ${
                          isSelected
                            ? 'border-[#34D399] bg-[#34D399]/14'
                            : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                        }`}
                      >
                        <BrailleShapeCanvas
                          variant="preview"
                          shape={meta.kind}
                          tint={displayTint}
                          mood="happy"
                          eyeStyle={isSelected ? eyeStyle : meta.defaultEyeStyle}
                          dotProfile={dotProfile}
                          bloom={bloom}
                          reducedMotionOverride={!isSelected}
                        />
                        <div className="text-center leading-tight">
                          <div className="text-xs font-semibold text-white">{meta.label}</div>
                          <div className="text-[10.5px] text-emerald-100/55 whitespace-nowrap">
                            {meta.tagline}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Session Identity */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="canvas-session-name" className="block text-xs font-medium text-emerald-50/85">
                    Dot Name
                  </label>
                  <input
                    id="canvas-session-name"
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (error) setError('');
                    }}
                    placeholder="e.g. kitsune-lab"
                    autoFocus
                    className="w-full rounded-lg bg-[#060E0C] border border-white/15 focus:border-[#34D399] px-3 py-1.5 text-sm text-white placeholder:text-emerald-100/35 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="canvas-session-topic" className="block text-xs font-medium text-emerald-50/85">
                    Focus or Role (optional)
                  </label>
                  <input
                    id="canvas-session-topic"
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={activeMeta.tagline}
                    className="w-full rounded-lg bg-[#060E0C] border border-white/15 focus:border-[#34D399] px-3 py-1.5 text-sm text-white placeholder:text-emerald-100/35 focus:outline-none"
                  />
                </div>
              </div>

              {/* Autonomy Cadence & Portable Skills */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="block text-xs font-medium text-emerald-50/85">
                    Autonomy &amp; Sandbox
                  </span>
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.04] border border-white/10">
                    {(
                      [
                        { id: 'manual', label: 'Manual' },
                        { id: 'scheduled', label: 'Scheduled' },
                        { id: 'watch', label: 'Watch' },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSetAutonomy(opt.id)}
                        className={`flex-1 py-1 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          autonomyMode === opt.id
                            ? 'bg-[#34D399] text-[#05140E] font-semibold'
                            : 'text-emerald-100/70 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="block text-xs font-medium text-emerald-50/85">
                    Portable Skills
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {AVAILABLE_DOT_SKILLS.map((sk) => {
                      const active = skills.includes(sk.id);
                      return (
                        <button
                          key={sk.id}
                          type="button"
                          onClick={() => handleToggleSkill(sk.id)}
                          aria-pressed={active}
                          className={`px-2 py-1 rounded-md border text-[10.5px] transition-colors cursor-pointer whitespace-nowrap ${
                            active
                              ? 'border-[#34D399]/50 bg-[#34D399]/14 text-[#6EE7B7]'
                              : 'border-white/10 bg-white/[0.03] text-emerald-100/55 hover:text-white'
                          }`}
                        >
                          {sk.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="canvas-session-persona" className="block text-xs font-medium text-emerald-50/85">
                  hermes-agent System Persona
                </label>
                <input
                  id="canvas-session-persona"
                  type="text"
                  value={persona}
                  onChange={(e) => {
                    setPersona(e.target.value);
                    setPersonaEdited(true);
                  }}
                  placeholder={activeMeta.defaultAgentPersona}
                  className="w-full rounded-lg bg-[#060E0C] border border-white/15 focus:border-[#34D399] px-3 py-1.5 text-xs font-mono text-emerald-50/90 placeholder:text-emerald-100/35 focus:outline-none"
                />
              </div>

              {error && (
                <p role="alert" className="text-xs text-rose-300">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-white/10 bg-[#0A1613] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-white/12 bg-white/[0.04] text-xs font-medium text-emerald-100/80 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-[#34D399] hover:bg-[#6EE7B7] text-[#05140E] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Spawn Dot</span>
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
