import { useRef, useState } from 'react';
import { Check, Plus, Trash2, Upload } from 'lucide-react';
import {
  BLUR_RANGE,
  OPACITY_RANGE,
  inferMediaTypeFromSrc,
  isValidCustomMediaSrc,
} from './persistence';
import { DEFAULT_PRESETS } from './presets';
import type { BackgroundCustomSlot, BackgroundSettings } from './types';

interface BackgroundPresetGridProps {
  activeId: string;
  onSelectActive: (id: string) => void;
  columns?: 2 | 3 | 4;
}

export function BackgroundPresetGrid({
  activeId,
  onSelectActive,
  columns = 2,
}: BackgroundPresetGridProps) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const colCount = columns;

  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const total = DEFAULT_PRESETS.length;
    let nextIndex = -1;

    switch (e.key) {
      case 'ArrowRight':
        nextIndex = (index + 1) % total;
        break;
      case 'ArrowLeft':
        nextIndex = (index - 1 + total) % total;
        break;
      case 'ArrowDown':
        nextIndex = Math.min(total - 1, index + colCount);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(0, index - colCount);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = total - 1;
        break;
      default:
        break;
    }

    if (nextIndex >= 0 && nextIndex !== index) {
      e.preventDefault();
      buttonRefs.current[nextIndex]?.focus();
    }
  };

  const gridColsClass =
    columns === 4
      ? 'grid-cols-2 sm:grid-cols-4'
      : columns === 3
      ? 'grid-cols-2 sm:grid-cols-3'
      : 'grid-cols-2';

  return (
    <div
      role="radiogroup"
      aria-label="Background presets"
      className={`grid ${gridColsClass} gap-2`}
    >
      {DEFAULT_PRESETS.map((preset, index) => {
        const active = activeId === preset.id;
        return (
          <button
            key={preset.id}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelectActive(preset.id)}
            onKeyDown={(e) => handleGridKeyDown(e, index)}
            data-testid={`bg-preset-${preset.id}`}
            className={`group text-left rounded-xl border p-1.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ui-accent)] ${
              active
                ? 'border-[var(--ui-accent)]/75 bg-[rgba(var(--ui-accent-rgb),0.12)]'
                : 'border-white/10 bg-white/[0.025] hover:border-white/25'
            }`}
          >
            <div
              className="relative h-11 w-full rounded-lg overflow-hidden border border-white/10"
              style={{ background: preset.staticBackground }}
            >
              {active && (
                <span className="ui-accent-btn absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5" />
                </span>
              )}
            </div>
            <div className="mt-1.5 px-0.5">
              <div className="text-[11.5px] font-medium text-white truncate">
                {preset.name}
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                {preset.subtitle}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

interface BackgroundTuningSlidersProps {
  opacity: number;
  blurPx: number;
  onChangeOpacity: (opacity: number) => void;
  onChangeBlurPx: (blurPx: number) => void;
}

export function BackgroundTuningSliders({
  opacity,
  blurPx,
  onChangeOpacity,
  onChangeBlurPx,
}: BackgroundTuningSlidersProps) {
  return (
    <div className="space-y-2.5">
      <label className="block space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-200">Background opacity</span>
          <span className="font-mono text-[var(--ui-accent-soft)] tabular-nums">
            {Math.round(opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min={OPACITY_RANGE.min}
          max={OPACITY_RANGE.max}
          step={0.01}
          value={opacity}
          onChange={(e) => onChangeOpacity(Number(e.target.value))}
          data-testid="bg-opacity-slider"
          className="w-full cursor-pointer h-1.5"
        />
      </label>

      <label className="block space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-200">Glass blur strength</span>
          <span className="font-mono text-[var(--ui-accent-soft)] tabular-nums">
            {blurPx}px
          </span>
        </div>
        <input
          type="range"
          min={BLUR_RANGE.min}
          max={BLUR_RANGE.max}
          step={1}
          value={blurPx}
          onChange={(e) => onChangeBlurPx(Number(e.target.value))}
          data-testid="bg-blur-slider"
          className="w-full cursor-pointer h-1.5"
        />
      </label>
    </div>
  );
}

interface BackgroundCustomSlotsProps {
  activeId: string;
  customSlots: BackgroundCustomSlot[];
  onSelectActive: (id: string) => void;
  onAddCustomSlot: (slot: BackgroundCustomSlot) => void;
  onRemoveCustomSlot: (id: string) => void;
}

export function BackgroundCustomSlots({
  activeId,
  customSlots,
  onSelectActive,
  onAddCustomSlot,
  onRemoveCustomSlot,
}: BackgroundCustomSlotsProps) {
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!isValidCustomMediaSrc(trimmed)) {
      setUrlError('Enter a valid http(s)://, /, or data: image/video URL.');
      return;
    }
    setUrlError('');
    const mediaType = inferMediaTypeFromSrc(trimmed);
    const id = `custom-${Date.now().toString(36)}`;
    let label = mediaType === 'video' ? 'Custom Video' : 'Custom Image';
    try {
      const parsed = new URL(trimmed, 'http://localhost');
      const tail = parsed.pathname.split('/').filter(Boolean).pop();
      if (tail) label = tail.slice(0, 28);
    } catch {
      // keep default label
    }
    onAddCustomSlot({
      id,
      label,
      mediaType,
      src: trimmed,
      createdAt: Date.now(),
    });
    setUrlInput('');
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 1_800_000) {
      setUrlError('Local media must be under 1.8 MB for localStorage persistence.');
      return;
    }
    setUrlError('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !isValidCustomMediaSrc(reader.result)) {
        setUrlError('Unsupported media file format.');
        return;
      }
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      onAddCustomSlot({
        id: `custom-${Date.now().toString(36)}`,
        label: file.name.slice(0, 28),
        mediaType,
        src: reader.result,
        createdAt: Date.now(),
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-200">
          Custom media slots
        </span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-1 text-[10.5px] text-[var(--ui-accent-soft)] hover:text-white cursor-pointer"
        >
          <Upload className="w-3 h-3" />
          <span>Upload</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/mp4,video/webm"
          onChange={handleFilePick}
          className="hidden"
        />
      </div>

      <form onSubmit={handleAddUrl} className="flex items-center gap-1.5">
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Image or MP4/WebM URL..."
          aria-label="Custom background media URL"
          className="flex-1 min-w-0 rounded-lg bg-black/35 border border-white/12 px-2.5 py-1 text-[11px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--ui-accent)]"
        />
        <button
          type="submit"
          aria-label="Add custom background URL"
          className="px-2 py-1 rounded-lg bg-white/8 hover:bg-white/16 text-zinc-100 hover:text-white border border-white/12 text-[11px] flex items-center gap-1 transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-3 h-3" />
          <span>Add</span>
        </button>
      </form>

      {urlError && <p className="text-[10.5px] text-rose-300">{urlError}</p>}

      {customSlots.length > 0 && (
        <div className="space-y-1.5">
          {customSlots.map((slot) => {
            const active = activeId === slot.id;
            return (
              <div
                key={slot.id}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 ${
                  active
                    ? 'border-[var(--ui-accent)]/70 bg-[rgba(var(--ui-accent-rgb),0.12)]'
                    : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectActive(slot.id)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <span className="font-mono text-[9.5px] uppercase text-[var(--ui-accent-soft)] shrink-0">
                    {slot.mediaType}
                  </span>
                  <span className="text-[11px] text-white truncate">{slot.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveCustomSlot(slot.id)}
                  aria-label={`Remove ${slot.label}`}
                  className="p-1 text-zinc-400 hover:text-rose-300 cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export type { BackgroundSettings };
