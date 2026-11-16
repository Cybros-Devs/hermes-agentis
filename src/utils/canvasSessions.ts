import type { Channel, ChannelId, ExpressionMood, HermesAgentSession } from '../types/hermes';
import {
  BRAILLE_SHAPE_CATALOG,
  type BrailleShapeKind,
  type BrailleShapeTint,
} from './brailleShapesEngine';
import {
  classifySessionBucket,
  formatDisplaySessionTitle,
  formatSourceLabel,
  isOpaqueSessionIdentifier,
} from './sidebarSessions';

export type DotAutonomyMode = 'manual' | 'scheduled' | 'watch';
export type DotSandboxEnv = 'cloud-sandbox' | 'local-repo' | 'browser-worker';
export type CanvasFormationPreset = 'constellation' | 'orbit' | 'grid';
export type CanvasSessionFilter = 'chats' | 'all' | 'live' | 'autonomous';

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
  /** OpenAI Dots-inspired autonomy & dedicated computer metadata */
  autonomyMode: DotAutonomyMode;
  scheduleLabel: string;
  autonomyPaused?: boolean;
  sandboxEnv: DotSandboxEnv;
  workspaceDir: string;
  skills: string[];
  connectedTo?: ChannelId[];
}

export type CanvasPinKind = 'brief' | 'repo' | 'note' | 'skill';

export interface CanvasPin {
  id: string;
  kind: CanvasPinKind;
  title: string;
  detail: string;
  meta: string;
  xPct: number;
  yPct: number;
  linkedChannelId?: ChannelId;
}

export interface CanvasViewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface DotStarterTemplate {
  id: string;
  label: string;
  subtitle: string;
  shape: BrailleShapeKind;
  tint: BrailleShapeTint;
  autonomyMode: DotAutonomyMode;
  scheduleLabel: string;
  sandboxEnv: DotSandboxEnv;
  skills: string[];
  persona: string;
}

export const CANVAS_BOUNDS = {
  minX: 10,
  maxX: 90,
  minY: 18,
  maxY: 74,
} as const;

export const CANVAS_ZOOM_BOUNDS = {
  min: 0.65,
  max: 1.5,
  step: 0.15,
} as const;

export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = {
  panX: 0,
  panY: 0,
  zoom: 1,
};

export const AVAILABLE_DOT_SKILLS: readonly { id: string; label: string; summary: string }[] = [
  { id: 'browser', label: 'Browser', summary: 'Headless web inspection & screenshots' },
  { id: 'shell', label: 'Terminal', summary: 'Isolated sandbox shell execution' },
  { id: 'files', label: 'Workspace FS', summary: 'Read/patch project files' },
  { id: 'mail', label: 'Mail Gate', summary: 'Draft & dispatch gated email' },
  { id: 'calendar', label: 'Calendar', summary: 'Schedule triage & conflict checks' },
  { id: 'research', label: 'Web Research', summary: 'Multi-source citations & synthesis' },
];

export const DOT_STARTER_TEMPLATES: readonly DotStarterTemplate[] = [
  {
    id: 'custom',
    label: 'Custom Companion',
    subtitle: 'Interactive single-thread collaborator',
    shape: 'ghost',
    tint: 'pink',
    autonomyMode: 'manual',
    scheduleLabel: 'On-demand',
    sandboxEnv: 'cloud-sandbox',
    skills: ['browser', 'files'],
    persona: 'Adaptive Hermes specialist balancing fast terminal execution with clear status briefs.',
  },
  {
    id: 'ops-watchdog',
    label: 'Ops Watchdog',
    subtitle: 'Continuous build & health monitor',
    shape: 'trapezoid',
    tint: 'amber',
    autonomyMode: 'watch',
    scheduleLabel: 'Continuous watch',
    sandboxEnv: 'local-repo',
    skills: ['shell', 'files', 'browser'],
    persona: 'Proactive reliability monitor tracking CI pipelines, dev servers, and regression alerts.',
  },
  {
    id: 'research-scout',
    label: 'Research Scout',
    subtitle: 'Scheduled multi-source synthesis',
    shape: 'pebble',
    tint: 'periwinkle',
    autonomyMode: 'scheduled',
    scheduleLabel: 'Every 30m',
    sandboxEnv: 'browser-worker',
    skills: ['research', 'browser', 'files'],
    persona: 'Methodical research scout gathering citations, diffing specs, and posting concise briefs.',
  },
  {
    id: 'release-dispatch',
    label: 'Release Dispatch',
    subtitle: 'Gated rollout & comms coordinator',
    shape: 'star',
    tint: 'lime',
    autonomyMode: 'scheduled',
    scheduleLabel: 'Hourly check',
    sandboxEnv: 'cloud-sandbox',
    skills: ['mail', 'calendar', 'shell'],
    persona: 'Release coordinator preparing changelog drafts, gating outbound mail, and checking windows.',
  },
];

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
const VALID_AUTONOMY = new Set<DotAutonomyMode>(['manual', 'scheduled', 'watch']);
const VALID_SANDBOX = new Set<DotSandboxEnv>(['cloud-sandbox', 'local-repo', 'browser-worker']);
const VALID_PIN_KINDS = new Set<CanvasPinKind>(['brief', 'repo', 'note', 'skill']);

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

export function clampPinPosition(xPct: number, yPct: number): { xPct: number; yPct: number } {
  return {
    xPct: Math.max(10, Math.min(90, Number(xPct.toFixed(2)))),
    yPct: Math.max(14, Math.min(82, Number(yPct.toFixed(2)))),
  };
}

export function clampCanvasZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Number(
    Math.max(CANVAS_ZOOM_BOUNDS.min, Math.min(CANVAS_ZOOM_BOUNDS.max, zoom)).toFixed(3)
  );
}

export function clampCanvasPan(panX: number, panY: number, zoom: number): { panX: number; panY: number } {
  const maxPan = 420 * Math.max(1, zoom);
  return {
    panX: Math.max(-maxPan, Math.min(maxPan, Number((Number.isFinite(panX) ? panX : 0).toFixed(1)))),
    panY: Math.max(-maxPan, Math.min(maxPan, Number((Number.isFinite(panY) ? panY : 0).toFixed(1)))),
  };
}

export function zoomViewportAroundPoint(
  current: CanvasViewport,
  nextZoomRaw: number,
  cursorLocalX: number,
  cursorLocalY: number,
  stageWidth: number,
  stageHeight: number
): CanvasViewport {
  const nextZoom = clampCanvasZoom(nextZoomRaw);
  const prevZoom = clampCanvasZoom(current.zoom);
  if (Math.abs(nextZoom - prevZoom) < 0.0001 || stageWidth <= 0 || stageHeight <= 0) {
    return { ...current, zoom: nextZoom };
  }
  const cx = cursorLocalX - stageWidth * 0.5;
  const cy = cursorLocalY - stageHeight * 0.5;
  const ratio = nextZoom / prevZoom;
  const rawPanX = cx - (cx - current.panX) * ratio;
  const rawPanY = cy - (cy - current.panY) * ratio;
  const clampedPan = clampCanvasPan(rawPanX, rawPanY, nextZoom);
  return {
    panX: clampedPan.panX,
    panY: clampedPan.panY,
    zoom: nextZoom,
  };
}

export function formatSandboxLabel(env: DotSandboxEnv): string {
  if (env === 'local-repo') return 'Local Repo';
  if (env === 'browser-worker') return 'Browser Worker';
  return 'Cloud Sandbox';
}

export function formatAutonomyLabel(
  mode: DotAutonomyMode,
  scheduleLabel: string,
  paused?: boolean
): string {
  if (mode === 'manual') return 'On-demand';
  const base = scheduleLabel || (mode === 'watch' ? 'Continuous watch' : 'Scheduled');
  return paused ? `${base} (paused)` : base;
}

export function isDotAutonomous(session: Pick<CanvasSession, 'autonomyMode' | 'autonomyPaused'>): boolean {
  return session.autonomyMode !== 'manual' && !session.autonomyPaused;
}

export function isCanvasBackgroundRun(
  session: Pick<CanvasSession, 'channelId' | 'hermesSessionId' | 'name' | 'topic' | 'isCore' | 'autonomyMode'>,
  hermesSession?: HermesAgentSession
): boolean {
  if (session.isCore) return false;
  if (session.autonomyMode !== 'manual') return false;
  const sourceLabel = formatSourceLabel(
    hermesSession?.source,
    session.hermesSessionId,
    session.channelId
  );
  const titleInfo = formatDisplaySessionTitle({
    topic: hermesSession?.topic || session.topic,
    name: hermesSession?.name || session.name,
    channelId: session.channelId,
    sessionId: session.hermesSessionId,
    lastMessage: hermesSession?.lastMessage,
    sourceLabel,
  });
  const turnCount = hermesSession?.turnCount ?? 0;
  const hasActiveWork =
    hermesSession?.status === 'thinking' ||
    hermesSession?.status === 'running' ||
    hermesSession?.status === 'speaking';
  return (
    classifySessionBucket({
      sessionId: session.hermesSessionId,
      channelId: session.channelId,
      source: hermesSession?.source,
      isOpaqueTitle: titleInfo.isOpaque,
      turnCount,
      hasActiveWork,
    }) === 'runs'
  );
}

export function formatCanvasDotLabel(
  session: Pick<CanvasSession, 'channelId' | 'hermesSessionId' | 'name' | 'topic'>,
  hermesSession?: HermesAgentSession,
  turnCount = 0
): {
  primaryLabel: string;
  secondaryLabel: string;
  promptTarget: string;
  isOpaque: boolean;
} {
  const sourceLabel = formatSourceLabel(
    hermesSession?.source,
    session.hermesSessionId,
    session.channelId
  );
  const titleInfo = formatDisplaySessionTitle({
    topic: hermesSession?.topic || session.topic,
    name: hermesSession?.name || session.name,
    channelId: session.channelId,
    sessionId: session.hermesSessionId,
    lastMessage: hermesSession?.lastMessage,
    sourceLabel,
  });

  const compactPrimary =
    titleInfo.title.length > 24
      ? `${titleInfo.title.slice(0, 22).trimEnd()}…`
      : titleInfo.title;

  const isOpaque =
    titleInfo.isOpaque || isOpaqueSessionIdentifier(session.channelId);

  const shortPromptBase = titleInfo.isOpaque
    ? titleInfo.title.split('·').pop()?.trim() || session.channelId.slice(0, 8)
    : session.channelId.length <= 16 && !/^https?-/i.test(session.channelId)
    ? session.channelId
    : compactPrimary.includes('/')
    ? compactPrimary.split('/')[0].slice(0, 14)
    : compactPrimary.slice(0, 14);

  const parts: string[] = [];
  if (!titleInfo.isOpaque) {
    parts.push(sourceLabel);
  }
  const effectiveTurns = Math.max(turnCount, hermesSession?.turnCount ?? 0);
  parts.push(`${effectiveTurns}t`);

  if (hermesSession?.model && hermesSession.model !== 'hermes-agent') {
    parts.push(hermesSession.model.split('/').pop() || hermesSession.model);
  } else if (
    !isOpaque &&
    session.channelId &&
    !compactPrimary.toLowerCase().includes(session.channelId.toLowerCase())
  ) {
    const cleanSlug =
      session.channelId.length > 14
        ? `${session.channelId.slice(0, 12)}…`
        : session.channelId;
    parts.push(`#${cleanSlug}`);
  }

  return {
    primaryLabel: titleInfo.isOpaque ? compactPrimary : `#${compactPrimary}`,
    secondaryLabel: parts.join(' · '),
    promptTarget: shortPromptBase,
    isOpaque: titleInfo.isOpaque,
  };
}

export function filterCanvasSessions(
  sessions: CanvasSession[],
  filter: CanvasSessionFilter,
  thinkingByChannel: Record<string, boolean>,
  hermesStatusByChannel?: ReadonlyMap<string, string>,
  hermesSessionsByChannel?: ReadonlyMap<string, HermesAgentSession>
): CanvasSession[] {
  if (filter === 'all') return sessions;
  if (filter === 'chats') {
    return sessions.filter((s) => {
      if (
        thinkingByChannel[s.channelId] ||
        hermesStatusByChannel?.get(s.channelId) === 'thinking' ||
        hermesStatusByChannel?.get(s.channelId) === 'running'
      ) {
        return true;
      }
      return !isCanvasBackgroundRun(s, hermesSessionsByChannel?.get(s.channelId));
    });
  }
  if (filter === 'live') {
    return sessions.filter(
      (s) =>
        Boolean(thinkingByChannel[s.channelId]) ||
        hermesStatusByChannel?.get(s.channelId) === 'thinking' ||
        hermesStatusByChannel?.get(s.channelId) === 'running'
    );
  }
  return sessions.filter((s) => s.autonomyMode !== 'manual');
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
    const overlapSafeScore = Math.min(1.05, minBoxClearance) * 2 + minEuclid * 0.35 + centerBias * 0.02;
    if (overlapSafeScore > bestScore) {
      bestScore = overlapSafeScore;
      best = cand;
    }
  }

  return best;
}

export function findOpenPinSpot(
  sessions: Pick<CanvasSession, 'xPct' | 'yPct'>[],
  pins: Pick<CanvasPin, 'xPct' | 'yPct'>[]
): { xPct: number; yPct: number } {
  const occupied = [...sessions, ...pins];
  if (occupied.length === 0) return { xPct: 18, yPct: 22 };
  const candidates = [
    { xPct: 14, yPct: 22 },
    { xPct: 86, yPct: 22 },
    { xPct: 14, yPct: 72 },
    { xPct: 86, yPct: 72 },
    { xPct: 50, yPct: 18 },
    { xPct: 34, yPct: 76 },
    { xPct: 66, yPct: 76 },
  ];
  let best = candidates[0];
  let bestDist = -1;
  for (const c of candidates) {
    let nearest = Infinity;
    for (const o of occupied) {
      const d = Math.hypot((c.xPct - o.xPct) / 20, (c.yPct - o.yPct) / 24);
      if (d < nearest) nearest = d;
    }
    if (nearest > bestDist) {
      bestDist = nearest;
      best = c;
    }
  }
  return clampPinPosition(best.xPct, best.yPct);
}

export function arrangeSessionsFormation(
  sessions: CanvasSession[],
  formation: CanvasFormationPreset = 'constellation'
): CanvasSession[] {
  const count = sessions.length;
  if (count === 0) return sessions;

  if (formation === 'orbit') {
    if (count === 1) {
      return [{ ...sessions[0], ...clampCanvasPosition(50, 44) }];
    }
    const hasHub = count >= 5;
    return sessions.map((session, idx) => {
      if (hasHub && idx === 0) {
        return { ...session, ...clampCanvasPosition(50, 44) };
      }
      const ringCount = hasHub ? count - 1 : count;
      const ringIdx = hasHub ? idx - 1 : idx;
      const angle = -Math.PI * 0.5 + (ringIdx / ringCount) * Math.PI * 2;
      const rx = ringCount <= 3 ? 25 : 29;
      const ry = ringCount <= 3 ? 20 : 26;
      const clamped = clampCanvasPosition(
        50 + Math.cos(angle) * rx,
        46 + Math.sin(angle) * ry
      );
      return { ...session, ...clamped };
    });
  }

  if (formation === 'grid') {
    const cols = count <= 2 ? count : count <= 4 ? 2 : count <= 9 ? 3 : 4;
    const rows = Math.ceil(count / cols);
    return sessions.map((session, idx) => {
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      const colsInRow = r === rows - 1 ? count - r * cols : cols;
      const tX = colsInRow === 1 ? 0.5 : c / (colsInRow - 1);
      const tY = rows === 1 ? 0.5 : r / (rows - 1);
      const xMargin = colsInRow === 2 ? 26 : cols >= 4 ? 13 : 18;
      const xSpan = colsInRow === 2 ? 48 : cols >= 4 ? 74 : 64;
      const yMin = rows === 1 ? 45 : rows >= 4 ? 19 : 24;
      const ySpan = rows === 1 ? 0 : rows >= 4 ? 54 : 44;
      const clamped = clampCanvasPosition(xMargin + tX * xSpan, yMin + tY * ySpan);
      return { ...session, ...clamped };
    });
  }

  return autoArrangeSessions(sessions);
}

export function autoArrangeSessions(sessions: CanvasSession[]): CanvasSession[] {
  const count = sessions.length;
  if (count === 0) return sessions;

  if (count <= 3) {
    return sessions.map((session, idx) => {
      const t = count === 1 ? 0.5 : idx / (count - 1);
      const clamped = clampCanvasPosition(18 + t * 64, idx % 2 === 0 ? 44 : 52);
      return { ...session, ...clamped };
    });
  }

  if (count <= 6) {
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

  // Multi-row staggered constellation for 7+ sessions so nodes never overlap horizontally
  const cols = count <= 9 ? 3 : 4;
  const rows = Math.ceil(count / cols);
  return sessions.map((session, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const colsInRow = r === rows - 1 ? count - r * cols : cols;
    const tX = colsInRow === 1 ? 0.5 : c / (colsInRow - 1);
    const tY = rows === 1 ? 0.5 : r / (rows - 1);
    const rowStagger = r % 2 === 1 && colsInRow < cols ? 4 : 0;
    const xMargin = colsInRow === 2 ? 26 : 14;
    const xSpan = colsInRow === 2 ? 48 : 72;
    const yMin = rows >= 4 ? 19 : 22;
    const ySpan = rows >= 4 ? 54 : 48;
    const clamped = clampCanvasPosition(xMargin + rowStagger + tX * xSpan, yMin + tY * ySpan);
    return {
      ...session,
      ...clamped,
    };
  });
}

const DEFAULT_SHAPE_PRESETS: Record<
  string,
  {
    shape: BrailleShapeKind;
    tint: BrailleShapeTint;
    xPct: number;
    yPct: number;
    eyeStyle: 'open' | 'sleepy';
    mood: ExpressionMood;
    autonomyMode: DotAutonomyMode;
    scheduleLabel: string;
    sandboxEnv: DotSandboxEnv;
    skills: string[];
    connectedTo?: string[];
  }
> = {
  general: {
    shape: 'clover',
    tint: 'lime',
    xPct: 20,
    yPct: 30,
    eyeStyle: 'open',
    mood: 'happy',
    autonomyMode: 'manual',
    scheduleLabel: 'On-demand',
    sandboxEnv: 'cloud-sandbox',
    skills: ['browser', 'files', 'research'],
    connectedTo: ['ops', 'research'],
  },
  ops: {
    shape: 'trapezoid',
    tint: 'amber',
    xPct: 50,
    yPct: 26,
    eyeStyle: 'sleepy',
    mood: 'focused',
    autonomyMode: 'scheduled',
    scheduleLabel: 'Every 15m',
    sandboxEnv: 'local-repo',
    skills: ['shell', 'files', 'mail'],
    connectedTo: ['launch', 'daemon'],
  },
  research: {
    shape: 'pebble',
    tint: 'periwinkle',
    xPct: 80,
    yPct: 30,
    eyeStyle: 'sleepy',
    mood: 'thinking',
    autonomyMode: 'scheduled',
    scheduleLabel: 'Every 30m',
    sandboxEnv: 'browser-worker',
    skills: ['research', 'browser'],
    connectedTo: ['general'],
  },
  launch: {
    shape: 'star',
    tint: 'pink',
    xPct: 30,
    yPct: 68,
    eyeStyle: 'open',
    mood: 'happy',
    autonomyMode: 'manual',
    scheduleLabel: 'On-demand',
    sandboxEnv: 'cloud-sandbox',
    skills: ['mail', 'calendar', 'browser'],
    connectedTo: ['ops'],
  },
  daemon: {
    shape: 'ghost',
    tint: 'lavender',
    xPct: 72,
    yPct: 68,
    eyeStyle: 'open',
    mood: 'neutral',
    autonomyMode: 'watch',
    scheduleLabel: 'Continuous watch',
    sandboxEnv: 'local-repo',
    skills: ['shell', 'files'],
    connectedTo: ['ops'],
  },
  memory: {
    shape: 'cloud',
    tint: 'orange',
    xPct: 50,
    yPct: 68,
    eyeStyle: 'open',
    mood: 'happy',
    autonomyMode: 'watch',
    scheduleLabel: 'Continuous watch',
    sandboxEnv: 'cloud-sandbox',
    skills: ['files', 'research'],
  },
};

function defaultAutonomyForChannel(channelId: string): {
  autonomyMode: DotAutonomyMode;
  scheduleLabel: string;
  sandboxEnv: DotSandboxEnv;
  skills: string[];
  connectedTo?: string[];
} {
  const preset = DEFAULT_SHAPE_PRESETS[channelId];
  if (preset) {
    return {
      autonomyMode: preset.autonomyMode,
      scheduleLabel: preset.scheduleLabel,
      sandboxEnv: preset.sandboxEnv,
      skills: [...preset.skills],
      connectedTo: preset.connectedTo ? [...preset.connectedTo] : undefined,
    };
  }
  return {
    autonomyMode: 'manual',
    scheduleLabel: 'On-demand',
    sandboxEnv: 'cloud-sandbox',
    skills: ['browser', 'files'],
  };
}

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

    const defaults = defaultAutonomyForChannel(channelId);
    const autonomyMode: DotAutonomyMode =
      item.autonomyMode && VALID_AUTONOMY.has(item.autonomyMode)
        ? item.autonomyMode
        : defaults.autonomyMode;
    const sandboxEnv: DotSandboxEnv =
      item.sandboxEnv && VALID_SANDBOX.has(item.sandboxEnv)
        ? item.sandboxEnv
        : defaults.sandboxEnv;
    const scheduleLabel =
      typeof item.scheduleLabel === 'string' && item.scheduleLabel.trim()
        ? item.scheduleLabel.trim()
        : defaults.scheduleLabel;
    const workspaceDir =
      typeof item.workspaceDir === 'string' && item.workspaceDir.trim()
        ? item.workspaceDir.trim()
        : `~/hermes/dots/${channelId}`;
    const skills = Array.isArray(item.skills)
      ? item.skills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 8)
      : defaults.skills;
    const connectedTo = Array.isArray(item.connectedTo)
      ? item.connectedTo.filter((c): c is string => typeof c === 'string' && c !== channelId)
      : defaults.connectedTo;

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
      autonomyMode,
      scheduleLabel,
      autonomyPaused: Boolean(item.autonomyPaused),
      sandboxEnv,
      workspaceDir,
      skills,
      connectedTo,
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
    const defaults = defaultAutonomyForChannel(ch.id);

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
      autonomyMode: defaults.autonomyMode,
      scheduleLabel: defaults.scheduleLabel,
      autonomyPaused: false,
      sandboxEnv: defaults.sandboxEnv,
      workspaceDir: `~/hermes/dots/${ch.id}`,
      skills: defaults.skills,
      connectedTo: defaults.connectedTo,
    });
  });

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
      autonomyMode: p.autonomyMode,
      scheduleLabel: p.scheduleLabel,
      autonomyPaused: false,
      sandboxEnv: p.sandboxEnv,
      workspaceDir: '~/hermes/dots/daemon',
      skills: [...p.skills],
      connectedTo: p.connectedTo ? [...p.connectedTo] : undefined,
    });
  }

  return seeded;
}

export function createSeedCanvasPins(): CanvasPin[] {
  return [
    {
      id: 'pin-workspace-repo',
      kind: 'repo',
      title: 'Workspace Brief',
      detail: 'Isolated hermes-agent sandboxes share portable skills & gated outbound actions.',
      meta: '~/hermes/workspace · main',
      xPct: 12,
      yPct: 16,
      linkedChannelId: 'general',
    },
    {
      id: 'pin-ops-runbook',
      kind: 'brief',
      title: 'Release Checklist',
      detail: '1. Verify tests  2. Review draft mail gate  3. Confirm rollout window',
      meta: 'Pinned artifact · #ops',
      xPct: 88,
      yPct: 16,
      linkedChannelId: 'ops',
    },
  ];
}

export function normalizeCanvasPins(rawList: Partial<CanvasPin>[]): CanvasPin[] {
  const seen = new Set<string>();
  const out: CanvasPin[] = [];
  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `pin-${i + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const kind: CanvasPinKind =
      item.kind && VALID_PIN_KINDS.has(item.kind) ? item.kind : 'note';
    const pos = clampPinPosition(
      typeof item.xPct === 'number' && Number.isFinite(item.xPct) ? item.xPct : 20,
      typeof item.yPct === 'number' && Number.isFinite(item.yPct) ? item.yPct : 20
    );
    out.push({
      id,
      kind,
      title:
        typeof item.title === 'string' && item.title.trim()
          ? item.title.trim().slice(0, 48)
          : 'Workspace Note',
      detail:
        typeof item.detail === 'string' && item.detail.trim()
          ? item.detail.trim().slice(0, 180)
          : 'Pinned spatial context for connected Dots.',
      meta:
        typeof item.meta === 'string' && item.meta.trim()
          ? item.meta.trim().slice(0, 44)
          : 'Canvas pin',
      xPct: pos.xPct,
      yPct: pos.yPct,
      linkedChannelId:
        typeof item.linkedChannelId === 'string' && item.linkedChannelId.trim()
          ? item.linkedChannelId.trim()
          : undefined,
    });
  }
  return out;
}
