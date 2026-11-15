import type { OnboardingPersistedState } from './types';

export const ONBOARDING_STORAGE_KEY = 'duet.onboarding.v1';

export function hasOnboardingQueryParam(search: string): boolean {
  if (!search) return false;
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
    return params.get('onboarding') === '1';
  } catch {
    return false;
  }
}

export function parseOnboardingState(raw: string | null): OnboardingPersistedState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingPersistedState>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.completed !== 'boolean') return null;
    return {
      completed: parsed.completed,
      skipped: Boolean(parsed.skipped),
      updatedAt:
        typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : 0,
    };
  } catch {
    return null;
  }
}

export function shouldShowOnboardingOnBoot(
  search: string,
  rawStorage: string | null
): boolean {
  if (hasOnboardingQueryParam(search)) return true;
  if (search) {
    try {
      const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
      if (params.get('autostart') === '1') return false;
    } catch {
      // ignore malformed query string
    }
  }
  const parsed = parseOnboardingState(rawStorage);
  return !parsed?.completed;
}

export function loadOnboardingCompleted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(parseOnboardingState(window.localStorage.getItem(ONBOARDING_STORAGE_KEY))?.completed);
  } catch {
    return false;
  }
}

export function saveOnboardingCompleted(skipped = false): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: OnboardingPersistedState = {
      completed: true,
      skipped,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private browsing errors
  }
}

export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
