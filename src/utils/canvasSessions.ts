import type { Channel, ChannelId, ExpressionMood } from '../types/hermes';
import {
  BRAILLE_SHAPE_CATALOG,
  type BrailleShapeKind,
  type BrailleShapeTint,
} from './brailleShapesEngine';

export interface CanvasSession {
  id: string;
  channelId: ChannelId;
  hermesSessionId: string;
  agentPersona: string;
  name: string;
  topic: string;
  shape: BrailleShapeKind;
  tint: BrailleShapeTint;
  /** Percentage coordinates (0..100) within the interactive canvas stage */
  xPct: number;
  yPct: number;
  mood: ExpressionMood;
  eyeStyle: 'open' | 'sleepy';
  isCore?: boolean;
}

export const CANVAS_BOUNDS = {
  minX: 10,
  maxX: 90,
  minY: 18,
  maxY: 74,
} as const;

const VALID_SHAPES = new Set<BrailleShapeKind>(BRAILLE_SHAPE_CATALOG.map((m) => m.kind));
const VALID_MOODS = new Set<ExpressionMood>([
  'neutral',
  'listening',
  'thinking',
  'speaking',
  'happy',
  'focused',
  'alert',
]);

export function createHermesSessionId(channelId: string): string {
  const clean = channelId
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `hermes-${clean || 'session'}`;
}

export function getShapeMeta(kind: BrailleShapeKind) {
  return BRAILLE_SHAPE_CATALOG.find((s) => s.kind === kind) ?? BRAILLE_SHAPE_CATALOG[0];
}

export function clampCanvasPosition(xPct: number, yPct: number): { xPct: number; yPct: number } {
  return {
    xPct: Math.max(CANVAS_BOUNDS.minX, Math.min(CANVAS_BOUNDS.maxX, Number(xPct.toFixed(2)))),
    yPct: Math.max(CANVAS_BOUNDS.minY, Math.min(CANVAS_BOUNDS.maxY, Number(yPct.toFixed(2)))),
  };
}

export function slugifySessionName(raw: string, existingIds: Iterable<string>): string {
  const base =
    raw
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24)
      .replace(/-+$/g, '') || 'session';

  const taken = new Set(Array.from(existingIds, (id) => id.toLowerCase()));
  if (!taken.has(base)) return base;

  let n = 2;
  while (true) {
    const suffix = `-${n}`;
    const trimmedBase = base.slice(0, Math.max(1, 24 - suffix.length)).replace(/-+$/g, '') || 's';
    const candidate = `${trimmedBase}${suffix}`;
    if (!taken.has(candidate)) return candidate;
    n++;
  }
}

export function findOpenCanvasSpot(existing: Pick<CanvasSession, 'xPct' | 'yPct'>[]): {
  xPct: number;
  yPct: number;
} {
  if (existing.length === 0) {
    return { xPct: 50, yPct: 46 };
  }

  // Evaluate a balanced canvas grid using box-overlap Chebyshev clearance
  // (accounting for ~25% width x ~31% height per character + pill) plus Euclidean tie-breaking.
  const candidates: Array<{ xPct: number; yPct: number }> = [];
  for (let y = 20; y <= 70; y += 5) {
    for (let x = 14; x <= 86; x += 6) {
      candidates.push(clampCanvasPosition(x, y));
    }
  }

  let best = candidates[0];
  let bestScore = -1;

  for (const cand of candidates) {
    let minBoxClearance = Infinity;
    let minEuclid = Infinity;
    for (const item of existing) {
      const rx = Math.abs(cand.xPct - item.xPct) / 25;
      const ry = Math.abs(cand.yPct - item.yPct) / 31;
      const boxClearance = Math.max(rx, ry);
      const euclid = Math.hypot(rx, ry);
      if (boxClearance < minBoxClearance) minBoxClearance = boxClearance;
      if (euclid < minEuclid) minEuclid = euclid;
    }
    const centerBias =
      1 - Math.hypot((cand.xPct - 50) / 100, (cand.yPct - 48) / 100) * 0.04;
    // Prioritize avoiding any 2D bounding-box overlap first, then maximize comfortable separation.
    const overlapSafeScore = Math.min(1.05, minBoxClearance) * 2 + minEuclid * 0.35 + centerBias * 0.02;
    if (overlapSafeScore > bestScore) {
      bestScore = overlapSafeScore;
      best = cand;
    }
  }

  return best;
}

export function autoArrangeSessions(sessions: CanvasSession[]): CanvasSession[] {
  const count = sessions.length;
  if (count === 0) return sessions;

  // Two-row staggered constellation with generous spacing for per-character input & chat windows
  if (count <= 3) {
    return sessions.map((session, idx) => {
      const t = count === 1 ? 0.5 : idx / (count - 1);
      const clamped = clampCanvasPosition(18 + t * 64, idx % 2 === 0 ? 44 : 52);
      return { ...session, ...clamped };
    });
  }

  const topCount = Math.ceil(count / 2);
  const bottomCount = count - topCount;

  return sessions.map((session, idx) => {
    const isTop = idx < topCount;
    const rowIdx = isTop ? idx : idx - topCount;
    const rowLen = isTop ? topCount : bottomCount;
    const t = rowLen === 1 ? 0.5 : rowIdx / (rowLen - 1);
    const xMargin = isTop ? 18 : 26;
    const xSpan = isTop ? 64 : 48;
    const yPct = isTop ? 28 : 66;
    const clamped = clampCanvasPosition(xMargin + t * xSpan, yPct);
    return {
      ...session,
      ...clamped,
    };
  });
}

const DEFAULT_SHAPE_PRESETS: Record<
  string,
  { shape: BrailleShapeKind; tint: BrailleShapeTint; xPct: number; yPct: number; eyeStyle: 'open' | 'sleepy'; mood: ExpressionMood }
> = {
  general: { shape: 'clover', tint: 'lime', xPct: 18, yPct: 30, eyeStyle: 'open', mood: 'happy' },
  ops: { shape: 'trapezoid', tint: 'amber', xPct: 50, yPct: 26, eyeStyle: 'sleepy', mood: 'focused' },
  research: { shape: 'pebble', tint: 'periwinkle', xPct: 82, yPct: 30, eyeStyle: 'sleepy', mood: 'thinking' },
  launch: { shape: 'star', tint: 'pink', xPct: 26, yPct: 68, eyeStyle: 'open', mood: 'happy' },
  daemon: { shape: 'ghost', tint: 'lavender', xPct: 76, yPct: 68, eyeStyle: 'open', mood: 'neutral' },
  memory: { shape: 'cloud', tint: 'orange', xPct: 50, yPct: 68, eyeStyle: 'open', mood: 'happy' },
};

export function normalizeCanvasSessions(rawList: Partial<CanvasSession>[]): CanvasSession[] {
  const seenChannels = new Set<string>();
  const normalized: CanvasSession[] = [];

  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (!item || typeof item !== 'object') continue;
    const baseName = String(item.name || item.channelId || `session-${i + 1}`).replace(/^#/, '');
    const channelId =
      typeof item.channelId === 'string' && item.channelId.trim()
        ? item.channelId.trim()
        : slugifySessionName(baseName, seenChannels);
    if (seenChannels.has(channelId)) continue;
    seenChannels.add(channelId);

    const shape: BrailleShapeKind =
      item.shape && VALID_SHAPES.has(item.shape) ? item.shape : 'clover';
    const meta = getShapeMeta(shape);
    const pos = clampCanvasPosition(
      typeof item.xPct === 'number' && Number.isFinite(item.xPct) ? item.xPct : 50,
      typeof item.yPct === 'number' && Number.isFinite(item.yPct) ? item.yPct : 46
    );
    const mood: ExpressionMood =
      item.mood && VALID_MOODS.has(item.mood) ? item.mood : 'happy';

    normalized.push({
      id: typeof item.id === 'string' && item.id ? item.id : `session-${channelId}`,
      channelId,
      hermesSessionId:
        typeof item.hermesSessionId === 'string' &&
        item.hermesSessionId.trim() &&
        !/^duet(-|$)/i.test(item.hermesSessionId.trim())
          ? item.hermesSessionId.trim()
          : createHermesSessionId(channelId),
      agentPersona:
        typeof item.agentPersona === 'string' && item.agentPersona.trim()
          ? item.agentPersona.trim()
          : meta.defaultAgentPersona,
      name: baseName,
      topic:
        typeof item.topic === 'string' && item.topic.trim()
          ? item.topic.trim()
          : meta.tagline,
      shape,
      tint: item.tint ?? meta.defaultTint,
      xPct: pos.xPct,
      yPct: pos.yPct,
      mood,
      eyeStyle: item.eyeStyle === 'sleepy' ? 'sleepy' : item.eyeStyle === 'open' ? 'open' : meta.defaultEyeStyle,
      isCore: Boolean(item.isCore),
    });
  }

  return normalized;
}

export function createSeedCanvasSessions(channels: Channel[]): CanvasSession[] {
  const seen = new Set<string>();
  const seeded: CanvasSession[] = [];

  channels.forEach((ch, idx) => {
    const preset = DEFAULT_SHAPE_PRESETS[ch.id];
    const fallbackMeta = BRAILLE_SHAPE_CATALOG[idx % BRAILLE_SHAPE_CATALOG.length];
    const shape = preset?.shape ?? fallbackMeta.kind;
    const shapeMeta = getShapeMeta(shape);
    const pos = preset
      ? clampCanvasPosition(preset.xPct, preset.yPct)
      : findOpenCanvasSpot(seeded);

    seen.add(ch.id);
    seeded.push({
      id: `session-${ch.id}`,
      channelId: ch.id,
      hermesSessionId: createHermesSessionId(ch.id),
      agentPersona: ch.persona || shapeMeta.defaultAgentPersona,
      name: ch.name.replace(/^#/, ''),
      topic: ch.description || `Hermes session #${ch.name}`,
      shape,
      tint: preset?.tint ?? shapeMeta.defaultTint,
      xPct: pos.xPct,
      yPct: pos.yPct,
      mood: preset?.mood ?? 'happy',
      eyeStyle: preset?.eyeStyle ?? shapeMeta.defaultEyeStyle,
      isCore: true,
    });
  });

  // Add one floating background companion (Neko daemon) if not already present so the canvas opens rich
  if (!seen.has('daemon') && seeded.length > 0 && seeded.length < 5) {
    const p = DEFAULT_SHAPE_PRESETS.daemon;
    const daemonMeta = getShapeMeta(p.shape);
    seeded.push({
      id: 'session-daemon',
      channelId: 'daemon',
      hermesSessionId: createHermesSessionId('daemon'),
      agentPersona: daemonMeta.defaultAgentPersona,
      name: 'daemon',
      topic: 'Background cron watcher & ambient signal daemon',
      shape: p.shape,
      tint: p.tint,
      xPct: p.xPct,
      yPct: p.yPct,
      mood: p.mood,
      eyeStyle: p.eyeStyle,
      isCore: false,
    });
  }

  return seeded;
}
