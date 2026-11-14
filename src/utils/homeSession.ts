import type { ChannelId } from '../types/hermes';
import {
  BRAILLE_SHAPE_CATALOG,
  type BrailleShapeKind,
  type BrailleShapeTint,
} from './brailleShapesEngine';
import { createHermesSessionId, slugifySessionName, type CanvasSession } from './canvasSessions';

const FILLER_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'can',
  'could',
  'do',
  'for',
  'help',
  'hermes',
  'hey',
  'hi',
  'how',
  'i',
  'in',
  'is',
  'let',
  'lets',
  'me',
  'my',
  'new',
  'of',
  'on',
  'please',
  'session',
  'start',
  'that',
  'the',
  'this',
  'to',
  'want',
  'with',
  'would',
  'you',
]);

export interface DerivedHomeSession {
  slug: string;
  hermesSessionId: string;
  topic: string;
  persona: string;
}

/**
 * Derives a clean, unique channel slug, hermes-agent session ID, topic, and
 * standing persona instructions from the user's opening prompt on Home.
 */
export function deriveSessionFromPrompt(
  prompt: string,
  existingChannelIds: Iterable<string>
): DerivedHomeSession {
  const cleanedTopic = prompt.replace(/\s+/g, ' ').trim();
  const topic =
    cleanedTopic.length > 120
      ? `${cleanedTopic.slice(0, 117).trimEnd()}...`
      : cleanedTopic || 'New Hermes Agent session';

  const words = cleanedTopic
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const meaningful = words.filter((w) => !FILLER_WORDS.has(w) && w.length > 1);
  const chosen = (meaningful.length > 0 ? meaningful : words).slice(0, 3);
  const rawBase = chosen.join('-') || 'session';
  const candidateBase = rawBase === 'general' ? 'general-session' : rawBase;
  const takenWithGeneral = new Set<string>([...existingChannelIds, 'general']);
  const slug = slugifySessionName(candidateBase, takenWithGeneral);

  return {
    slug,
    hermesSessionId: createHermesSessionId(slug),
    topic,
    persona: `Focused Hermes Agent session started from Home for: ${topic}`,
  };
}

/**
 * Picks a distinct Braille character shape, tint, and eye style for a newly
 * started Home session so parallel sessions remain visually recognizable.
 */
export function pickNextShapeAndTint(
  existingSessions: Array<Pick<CanvasSession, 'shape' | 'tint'>>
): {
  shape: BrailleShapeKind;
  tint: BrailleShapeTint;
  eyeStyle: 'open' | 'sleepy';
} {
  const shapeCounts = new Map<BrailleShapeKind, number>();
  for (const s of existingSessions) {
    shapeCounts.set(s.shape, (shapeCounts.get(s.shape) ?? 0) + 1);
  }

  let best = BRAILLE_SHAPE_CATALOG[existingSessions.length % BRAILLE_SHAPE_CATALOG.length];
  let bestCount = Infinity;
  for (const meta of BRAILLE_SHAPE_CATALOG) {
    const count = shapeCounts.get(meta.kind) ?? 0;
    if (count < bestCount) {
      bestCount = count;
      best = meta;
    }
  }

  return {
    shape: best.kind,
    tint: best.defaultTint,
    eyeStyle: best.defaultEyeStyle,
  };
}

/**
 * Returns true when submitting `rawText` on Home should spawn a brand-new
 * isolated hermes-agent + hermes-duet session before routing the prompt.
 */
export function shouldStartNewHomeSession(params: {
  homeSessionDraft: boolean;
  panelView: string;
  rawText: string;
}): boolean {
  const trimmed = params.rawText.trim();
  if (!trimmed) return false;
  if (!params.homeSessionDraft) return false;
  if (params.panelView !== 'home') return false;
  if (trimmed.startsWith('/')) return false;
  return true;
}

/**
 * Normalizes a Duet server channel id (e.g. "chan-general" or an opaque channel
 * id mapped via `aliases`) into the canonical local slug used by UI lanes.
 */
export function normalizeDuetChannelId(
  rawId?: string | null,
  aliases?: ReadonlyMap<string, string>
): ChannelId {
  const input = (rawId ?? '').trim();
  if (input && aliases) {
    const exact = aliases.get(input) ?? aliases.get(input.toLowerCase());
    if (exact) return exact;
  }
  const stripped = input.replace(/^chan-/i, '').trim().toLowerCase();
  if (stripped && aliases) {
    const viaStripped = aliases.get(stripped);
    if (viaStripped) return viaStripped;
  }
  return stripped || 'general';
}

const TERMINAL_ACTIVITY_STATUSES = new Set([
  'done',
  'completed',
  'complete',
  'error',
  'failed',
  'cancelled',
  'canceled',
  'stopped',
]);

/**
 * Detects whether an incoming Duet SSE/snapshot item marks a turn as settled so
 * channel thinking state never remains stuck at "Working · 0s".
 */
export function isTerminalSettledItem(item: {
  kind?: string;
  streaming?: boolean;
  activity?: { status?: string };
}): boolean {
  if (item.kind === 'assistant' && !item.streaming) {
    return true;
  }
  if (item.kind === 'activity' && item.activity?.status) {
    return TERMINAL_ACTIVITY_STATUSES.has(item.activity.status.toLowerCase());
  }
  return false;
}

/**
 * Guarantees a fresh unique slug that does not collide with any existing local
 * or upstream Duet channel slug.
 */
export function buildUniqueSlugForFreshChannel(
  desiredSlug: string,
  takenSlugs: Iterable<string>
): string {
  return slugifySessionName(desiredSlug, takenSlugs);
}
