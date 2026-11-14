import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import {
  BRAILLE_SHAPE_CATALOG,
  BRAILLE_TINT_PALETTE,
  type BrailleShapeKind,
  type BrailleShapeTint,
} from '../utils/brailleShapesEngine';
import { BrailleShapeCanvas } from './BrailleShapeCanvas';

interface AddSessionShapeModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: {
    name: string;
    topic: string;
    shape: BrailleShapeKind;
    tint: BrailleShapeTint;
    eyeStyle: 'open' | 'sleepy';
  }) => void;
}

const TINT_KEYS = Object.keys(BRAILLE_TINT_PALETTE) as BrailleShapeTint[];

export function AddSessionShapeModal({
  open,
  onClose,
  onCreate,
}: AddSessionShapeModalProps) {
  const [selectedShape, setSelectedShape] = useState<BrailleShapeKind>('ghost');
  const [selectedTint, setSelectedTint] = useState<BrailleShapeTint>('lavender');
  const [eyeStyle, setEyeStyle] = useState<'open' | 'sleepy'>('open');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  const activeMeta =
    BRAILLE_SHAPE_CATALOG.find((s) => s.kind === selectedShape) ?? BRAILLE_SHAPE_CATALOG[0];

  const handleSelectShape = (kind: BrailleShapeKind) => {
    setSelectedShape(kind);
    const meta = BRAILLE_SHAPE_CATALOG.find((s) => s.kind === kind);
    if (meta) {
      setSelectedTint(meta.defaultTint);
      setEyeStyle(meta.defaultEyeStyle);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = name.trim();
    if (!cleaned) {
      setError('Enter a session name so Hermes can route messages to it.');
      return;
    }
    onCreate({
      name: cleaned,
      topic: topic.trim() || activeMeta.tagline,
      shape: selectedShape,
      tint: selectedTint,
      eyeStyle,
    });
    setName('');
    setTopic('');
    setError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <dialog
        open
        aria-modal="true"
        aria-labelledby="add-braille-session-title"
        className="relative m-0 w-full max-w-2xl rounded-2xl bg-[#0A1613] border border-[#34D399]/35 text-[#ECF3F0] shadow-[0_24px_80px_rgba(0,0,0,0.75)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2
              id="add-braille-session-title"
              className="text-base font-semibold text-white"
            >
              Add Braille Session
            </h2>
            <p className="text-xs text-emerald-100/60 mt-0.5">
              Choose a character silhouette to spawn onto the canvas
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close add session dialog"
            className="w-8 h-8 rounded-lg border border-white/12 bg-white/[0.04] text-emerald-100/70 hover:text-white hover:border-white/25 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 max-h-[82vh] overflow-y-auto cyber-scroll">
          {/* 9 Dots-inspired Braille Shape Picker */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-emerald-50/85">
              Character Shape
            </span>
            <div className="grid grid-cols-3 gap-2.5">
              {BRAILLE_SHAPE_CATALOG.map((meta) => {
                const isSelected = meta.kind === selectedShape;
                const displayTint = isSelected ? selectedTint : meta.defaultTint;
                return (
                  <button
                    key={meta.kind}
                    type="button"
                    onClick={() => handleSelectShape(meta.kind)}
                    aria-pressed={isSelected}
                    aria-label={`Select ${meta.label} shape`}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#34D399] bg-[#34D399]/12'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                    }`}
                  >
                    <BrailleShapeCanvas
                      variant="preview"
                      shape={meta.kind}
                      tint={displayTint}
                      mood="happy"
                      eyeStyle={isSelected ? eyeStyle : meta.defaultEyeStyle}
                    />
                    <div className="text-center">
                      <div className="text-xs font-semibold text-white">{meta.label}</div>
                      <div className="text-[11px] text-emerald-100/50 truncate max-w-[14ch]">
                        {meta.tagline}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tint + Expression */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="block text-xs font-medium text-emerald-50/85">
                Phosphor Tint
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
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

            <div className="space-y-2">
              <span className="block text-xs font-medium text-emerald-50/85">
                Resting Eyes
              </span>
              <div className="flex items-center gap-1 p-1 rounded-lg bg-white/[0.04] border border-white/10">
                <button
                  type="button"
                  onClick={() => setEyeStyle('open')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
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
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    eyeStyle === 'sleepy'
                      ? 'bg-[#34D399] text-[#05140E] font-semibold'
                      : 'text-emerald-100/70 hover:text-white'
                  }`}
                >
                  Calm Sleepy
                </button>
              </div>
            </div>
          </div>

          {/* Session Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="canvas-session-name" className="block text-xs font-medium text-emerald-50/85">
                Session Name
              </label>
              <input
                id="canvas-session-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. design-critique"
                autoFocus
                className="w-full rounded-lg bg-[#060E0C] border border-white/15 focus:border-[#34D399] px-3 py-2 text-sm text-white placeholder:text-emerald-100/35 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="canvas-session-topic" className="block text-xs font-medium text-emerald-50/85">
                Focus or Role (optional)
              </label>
              <input
                id="canvas-session-topic"
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={activeMeta.tagline}
                className="w-full rounded-lg bg-[#060E0C] border border-white/15 focus:border-[#34D399] px-3 py-2 text-sm text-white placeholder:text-emerald-100/35 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-rose-300">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/8">
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
              <span>Add to Canvas</span>
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
