import { DEFAULT_PRESET_ID, getPresetById } from './presets';
import type {
  BackgroundCustomMediaType,
  BackgroundCustomSlot,
  BackgroundSettings,
} from './types';

export const BACKGROUND_STORAGE_KEY = 'duet.glassBackground.v1';

export const OPACITY_RANGE = { min: 0.15, max: 0.85, defaultValue: 0.64 } as const;
export const BLUR_RANGE = { min: 0, max: 28, defaultValue: 12 } as const;

export const DEFAULT_BACKGROUND_SETTINGS: BackgroundSettings = {
  activeId: DEFAULT_PRESET_ID,
  opacity: OPACITY_RANGE.defaultValue,
  blurPx: BLUR_RANGE.defaultValue,
  customSlots: [],
};

export function clampOpacity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return OPACITY_RANGE.defaultValue;
  }
  return Math.max(OPACITY_RANGE.min, Math.min(OPACITY_RANGE.max, Number(value.toFixed(2))));
}

export function clampBlurPx(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return BLUR_RANGE.defaultValue;
  }
  return Math.max(BLUR_RANGE.min, Math.min(BLUR_RANGE.max, Math.round(value)));
}

export function isValidCustomMediaSrc(src: unknown): src is string {
  if (typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (!trimmed || trimmed.length > 2_500_000) return false;
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('data:video/')
  );
}

export function inferMediaTypeFromSrc(src: string): BackgroundCustomMediaType {
  const lower = src.trim().toLowerCase();
  if (
    lower.startsWith('data:video/') ||
    /\.(mp4|webm|ogg|mov)(\?.*)?$/.test(lower)
  ) {
    return 'video';
  }
  return 'image';
}

export function sanitizeCustomSlot(raw: unknown): BackgroundCustomSlot | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<BackgroundCustomSlot>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) return null;
  if (!isValidCustomMediaSrc(candidate.src)) return null;
  const mediaType: BackgroundCustomMediaType =
    candidate.mediaType === 'video' || candidate.mediaType === 'image'
      ? candidate.mediaType
      : inferMediaTypeFromSrc(candidate.src);
  return {
    id: candidate.id.trim().slice(0, 64),
    label:
      typeof candidate.label === 'string' && candidate.label.trim()
        ? candidate.label.trim().slice(0, 36)
        : mediaType === 'video'
        ? 'Custom Video'
        : 'Custom Image',
    mediaType,
    src: candidate.src.trim(),
    createdAt:
      typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
        ? candidate.createdAt
        : Date.now(),
  };
}

export function parseSavedBackgroundSettings(rawJson: string | null): BackgroundSettings {
  if (!rawJson) {
    return { ...DEFAULT_BACKGROUND_SETTINGS, customSlots: [] };
  }

  try {
    const parsed = JSON.parse(rawJson) as Partial<BackgroundSettings>;
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_BACKGROUND_SETTINGS, customSlots: [] };
    }

    const rawSlots = Array.isArray(parsed.customSlots) ? parsed.customSlots : [];
    const customSlots: BackgroundCustomSlot[] = [];
    const seen = new Set<string>();
    for (const item of rawSlots) {
      const slot = sanitizeCustomSlot(item);
      if (slot && !seen.has(slot.id)) {
        seen.add(slot.id);
        customSlots.push(slot);
      }
      if (customSlots.length >= 6) break;
    }

    const candidateActive =
      typeof parsed.activeId === 'string' ? parsed.activeId.trim() : '';
    const isValidActive =
      Boolean(getPresetById(candidateActive)) ||
      customSlots.some((s) => s.id === candidateActive);

    return {
      activeId: isValidActive ? candidateActive : DEFAULT_PRESET_ID,
      opacity: clampOpacity(parsed.opacity),
      blurPx: clampBlurPx(parsed.blurPx),
      customSlots,
    };
  } catch {
    return { ...DEFAULT_BACKGROUND_SETTINGS, customSlots: [] };
  }
}

export function loadBackgroundSettings(): BackgroundSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_BACKGROUND_SETTINGS, customSlots: [] };
  }
  try {
    return parseSavedBackgroundSettings(window.localStorage.getItem(BACKGROUND_STORAGE_KEY));
  } catch {
    return { ...DEFAULT_BACKGROUND_SETTINGS, customSlots: [] };
  }
}

export function saveBackgroundSettings(settings: BackgroundSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(BACKGROUND_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export function applyBackgroundCssVars(settings: Pick<BackgroundSettings, 'opacity' | 'blurPx'>): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--glass-bg-opacity', String(clampOpacity(settings.opacity)));
  root.style.setProperty('--glass-blur', `${clampBlurPx(settings.blurPx)}px`);
  // Keep panel backdrop dark enough to preserve WCAG AA text contrast for every preset & blur setting
  root.style.setProperty('--glass-panel-alpha', '0.76');
}

/** Synchronously apply persisted background variables before React first paint */
export function hydrateBackgroundVarsOnBoot(): BackgroundSettings {
  const settings = loadBackgroundSettings();
  applyBackgroundCssVars(settings);
  return settings;
}

export const BACKGROUND_SETTINGS_EVENT = 'duet:background-settings-changed';
export const ONBOARDING_REPLAY_EVENT = 'duet:replay-onboarding';
export const ONBOARDING_DISMISS_EVENT = 'duet:dismiss-onboarding';

export function publishBackgroundSettings(settings: BackgroundSettings): void {
  applyBackgroundCssVars(settings);
  saveBackgroundSettings(settings);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<BackgroundSettings>(BACKGROUND_SETTINGS_EVENT, { detail: settings })
    );
  }
}

export function subscribeBackgroundSettings(
  listener: (settings: BackgroundSettings) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (ev: Event) => {
    const customEv = ev as CustomEvent<BackgroundSettings>;
    if (customEv.detail) {
      listener(customEv.detail);
    }
  };
  window.addEventListener(BACKGROUND_SETTINGS_EVENT, handler);
  return () => window.removeEventListener(BACKGROUND_SETTINGS_EVENT, handler);
}

export function requestOnboardingReplay(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ONBOARDING_REPLAY_EVENT));
}

export function requestOnboardingDismiss(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ONBOARDING_DISMISS_EVENT));
}

