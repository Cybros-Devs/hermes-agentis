import type { Channel, ChannelId, ExpressionMood } from '../types/hermes';
import {
  BRAILLE_SHAPE_CATALOG,
  type BrailleShapeKind,
  type BrailleShapeTint,
} from './brailleShapesEngine';

export interface CanvasSession {
  id: string;
  channelId: ChannelId;
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
      .slice(0, 24) || 'session';

  const taken = new Set(Array.from(existingIds, (id) => id.toLowerCase()));
  if (!taken.has(base)) return base;

  let n = 2;
  while (taken.has(`${base}-${n}`)) {
    n++;
  }
  return `${base}-${n}`;
}

export function findOpenCanvasSpot(existing: Pick<CanvasSession, 'xPct' | 'yPct'>[]): {
  xPct: number;
  yPct: number;
} {
  if (existing.length === 0) {
    return { xPct: 50, yPct: 46 };
  }

  // Deterministic candidate grid prioritizing central breathing room
  const candidates: Array<{ xPct: number; yPct: number }> = [];
  const xs = [50, 34, 66, 22, 78, 42, 58, 16, 84];
  const ys = [46, 34, 58, 26, 66];
  for (const yPct of ys) {
    for (const xPct of xs) {
      candidates.push(clampCanvasPosition(xPct, yPct));
    }
  }

  let best = candidates[0];
  let bestMinDist = -1;

  for (const cand of candidates) {
    let minDist = Infinity;
    for (const item of existing) {
      const dx = cand.xPct - item.xPct;
      const dy = (cand.yPct - item.yPct) * 1.25;
      const dist = Math.hypot(dx, dy);
      if (dist < minDist) minDist = dist;
    }
    if (minDist > bestMinDist) {
      bestMinDist = minDist;
      best = cand;
    }
  }

  return best;
}

export function autoArrangeSessions(sessions: CanvasSession[]): CanvasSession[] {
  const count = sessions.length;
  if (count === 0) return sessions;

  // Staggered organic horizon arc inspired by Dots
  return sessions.map((session, idx) => {
    const t = count === 1 ? 0.5 : idx / (count - 1);
    const xPct = 15 + t * 70;
    const waveOffset = idx % 2 === 0 ? -9 : 8;
    const arch = Math.sin(t * Math.PI) * -6;
    const clamped = clampCanvasPosition(xPct, 48 + waveOffset + arch);
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
  general: { shape: 'clover', tint: 'lime', xPct: 19, yPct: 56, eyeStyle: 'open', mood: 'happy' },
  ops: { shape: 'trapezoid', tint: 'amber', xPct: 37, yPct: 48, eyeStyle: 'sleepy', mood: 'focused' },
  research: { shape: 'pebble', tint: 'periwinkle', xPct: 52, yPct: 58, eyeStyle: 'sleepy', mood: 'thinking' },
  launch: { shape: 'star', tint: 'pink', xPct: 81, yPct: 55, eyeStyle: 'open', mood: 'happy' },
  daemon: { shape: 'ghost', tint: 'lavender', xPct: 24, yPct: 29, eyeStyle: 'open', mood: 'neutral' },
  memory: { shape: 'cloud', tint: 'orange', xPct: 72, yPct: 33, eyeStyle: 'open', mood: 'happy' },
};

export function createSeedCanvasSessions(channels: Channel[]): CanvasSession[] {
  const seen = new Set<string>();
  const seeded: CanvasSession[] = [];

  channels.forEach((ch, idx) => {
    const preset = DEFAULT_SHAPE_PRESETS[ch.id];
    const fallbackMeta = BRAILLE_SHAPE_CATALOG[idx % BRAILLE_SHAPE_CATALOG.length];
    const pos = preset
      ? clampCanvasPosition(preset.xPct, preset.yPct)
      : findOpenCanvasSpot(seeded);

    seen.add(ch.id);
    seeded.push({
      id: `session-${ch.id}`,
      channelId: ch.id,
      name: ch.name.replace(/^#/, ''),
      topic: ch.description || `Hermes session #${ch.name}`,
      shape: preset?.shape ?? fallbackMeta.kind,
      tint: preset?.tint ?? fallbackMeta.defaultTint,
      xPct: pos.xPct,
      yPct: pos.yPct,
      mood: preset?.mood ?? 'happy',
      eyeStyle: preset?.eyeStyle ?? fallbackMeta.defaultEyeStyle,
      isCore: true,
    });
  });

  // Add one floating background companion (Phantom) if not already present so the canvas opens rich
  if (!seen.has('daemon') && seeded.length > 0 && seeded.length < 5) {
    const p = DEFAULT_SHAPE_PRESETS.daemon;
    seeded.push({
      id: 'session-daemon',
      channelId: 'daemon',
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
