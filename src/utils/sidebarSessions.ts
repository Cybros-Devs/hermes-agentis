import type { Channel, HermesAgentSession } from '../types/hermes';
import type { CanvasSession } from './canvasSessions';
import type { ChannelTaskSummary } from './taskInsights';

export type SidebarSessionBucket = 'chats' | 'runs';
export type SidebarFilterTab = 'chats' | 'runs' | 'all';

export interface SidebarSessionEntry {
  session: CanvasSession;
  hermesSession?: HermesAgentSession;
  bucket: SidebarSessionBucket;
  displayTitle: string;
  tooltipTitle: string;
  sourceLabel: string;
  relativeTime: string;
  metadataLine: string;
  updatedAtMs: number;
  turnCount: number;
  hasActiveWork: boolean;
  runningCount: number;
  activeTaskTitle?: string;
  isOpaqueId: boolean;
  searchText: string;
}

export interface SidebarSessionFilterResult {
  visible: SidebarSessionEntry[];
  chatsCount: number;
  runsCount: number;
  totalCount: number;
  crossBucketMatches: number;
}

const LOCAL_HASH_RE = /^(?:#?hermes-)?local[-_]([0-9a-f]{6,})$/i;
const RUN_HASH_RE = /^#?(?:hermes-)?run[-_]([0-9a-f]{6,})$/i;
const CRON_ID_RE = /^#?(?:hermes-)?cron[-_](.+)$/i;
const UUID_RE = /^#?(?:hermes-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RAW_HEX_RE = /^#?(?:hermes-)?([0-9a-f]{20,})$/i;

const SOURCE_LABELS: Record<string, string> = {
  cli: 'CLI',
  telegram: 'Telegram',
  discord: 'Discord',
  slack: 'Slack',
  whatsapp: 'WhatsApp',
  signal: 'Signal',
  cron: 'Cron',
  scheduler: 'Cron',
  daemon: 'Cron',
  web: 'Web',
  voxcell: 'Web',
  ui: 'Web',
  api: 'API',
  api_server: 'API',
  runs: 'Run',
};

export function isOpaqueSessionIdentifier(raw?: string | null): boolean {
  const s = String(raw ?? '').trim().replace(/^#/, '');
  if (!s) return false;
  return (
    LOCAL_HASH_RE.test(s) ||
    RUN_HASH_RE.test(s) ||
    CRON_ID_RE.test(s) ||
    UUID_RE.test(s) ||
    RAW_HEX_RE.test(s)
  );
}

export function formatSourceLabel(
  source?: string | null,
  sessionId?: string | null,
  channelId?: string | null
): string {
  const rawSource = String(source ?? '').trim().toLowerCase();
  const sid = String(sessionId ?? '').trim();
  const cid = String(channelId ?? '').trim().toLowerCase();

  if (rawSource === 'cron' || cid === 'daemon' || CRON_ID_RE.test(sid) || CRON_ID_RE.test(cid)) {
    return 'Cron';
  }
  if (RUN_HASH_RE.test(sid) || RUN_HASH_RE.test(cid)) {
    return 'Run';
  }
  if (LOCAL_HASH_RE.test(sid) || LOCAL_HASH_RE.test(cid)) {
    return 'Local API';
  }
  if (rawSource && SOURCE_LABELS[rawSource]) {
    if ((rawSource === 'api' || rawSource === 'api_server') && sid.startsWith('hermes-')) {
      return 'Web';
    }
    return SOURCE_LABELS[rawSource];
  }
  if (rawSource) {
    return rawSource.charAt(0).toUpperCase() + rawSource.slice(1);
  }
  return sid.startsWith('hermes-') ? 'Web' : 'Session';
}

function cleanDisplayCandidate(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/$/, '');
  }
  return trimmed;
}

function formatOpaqueFallback(
  sessionId: string,
  channelId: string,
  sourceLabel: string
): string {
  const localMatch = sessionId.match(LOCAL_HASH_RE) || channelId.match(LOCAL_HASH_RE);
  if (localMatch) {
    return `Local API · ${localMatch[1].slice(0, 6)}`;
  }
  const runMatch = sessionId.match(RUN_HASH_RE) || channelId.match(RUN_HASH_RE);
  if (runMatch) {
    return `Gateway run · ${runMatch[1].slice(0, 6)}`;
  }
  const cronMatch = sessionId.match(CRON_ID_RE) || channelId.match(CRON_ID_RE);
  if (cronMatch) {
    const cleanCron = cronMatch[1].replace(/[-_]\d{6,}$/, '').slice(0, 14);
    return cleanCron ? `Cron · ${cleanCron}` : 'Scheduled cron';
  }
  const shortHex = sessionId.replace(/^(?:hermes-)/i, '').slice(0, 8);
  return `${sourceLabel} · ${shortHex || channelId}`;
}

export function formatDisplaySessionTitle(params: {
  topic?: string | null;
  name?: string | null;
  channelId: string;
  sessionId: string;
  lastMessage?: string | null;
  sourceLabel: string;
}): { title: string; isOpaque: boolean } {
  const normalizedChannel = params.channelId.trim().toLowerCase();
  const normalizedSid = params.sessionId.trim().toLowerCase();

  const isMeaningfulLabel = (raw?: string | null): string | null => {
    const s = String(raw ?? '').trim();
    if (!s) return null;
    const noHash = s.replace(/^#/, '');
    if (isOpaqueSessionIdentifier(noHash)) return null;
    const cleaned = cleanDisplayCandidate(noHash);
    if (!cleaned) return null;
    // If topic literally equals normalized id like "local-abc123" handled above, skip.
    if (cleaned.toLowerCase() === normalizedSid && isOpaqueSessionIdentifier(cleaned)) {
      return null;
    }
    return cleaned;
  };

  const topicLabel = isMeaningfulLabel(params.topic);
  if (topicLabel && topicLabel.toLowerCase() !== normalizedChannel) {
    return { title: topicLabel, isOpaque: false };
  }

  const nameLabel = isMeaningfulLabel(params.name);
  if (nameLabel && nameLabel.toLowerCase() !== normalizedChannel) {
    return { title: nameLabel, isOpaque: false };
  }

  const previewLabel = isMeaningfulLabel(params.lastMessage);
  if (previewLabel) {
    return {
      title: previewLabel.length > 64 ? `${previewLabel.slice(0, 61).trimEnd()}…` : previewLabel,
      isOpaque: false,
    };
  }

  if (topicLabel) {
    return { title: topicLabel, isOpaque: false };
  }

  if (nameLabel && !isOpaqueSessionIdentifier(nameLabel)) {
    return { title: nameLabel, isOpaque: false };
  }

  return {
    title: formatOpaqueFallback(params.sessionId, params.channelId, params.sourceLabel),
    isOpaque: true,
  };
}

export function classifySessionBucket(params: {
  sessionId: string;
  channelId: string;
  source?: string | null;
  isOpaqueTitle: boolean;
  turnCount: number;
  hasActiveWork: boolean;
}): SidebarSessionBucket {
  const src = String(params.source ?? '').trim().toLowerCase();
  const sid = params.sessionId.trim();
  const cid = params.channelId.trim().toLowerCase();

  if (
    src === 'cron' ||
    src === 'scheduler' ||
    src === 'daemon' ||
    cid === 'daemon' ||
    CRON_ID_RE.test(sid) ||
    CRON_ID_RE.test(cid) ||
    RUN_HASH_RE.test(sid) ||
    RUN_HASH_RE.test(cid)
  ) {
    return 'runs';
  }

  if (
    (LOCAL_HASH_RE.test(sid) || LOCAL_HASH_RE.test(cid) || UUID_RE.test(sid) || RAW_HEX_RE.test(sid)) &&
    params.isOpaqueTitle &&
    !params.hasActiveWork &&
    params.turnCount <= 1
  ) {
    return 'runs';
  }

  return 'chats';
}

export function formatCompactRelativeTime(
  epochMs: number | undefined,
  nowMs: number = Date.now()
): string {
  if (!epochMs || !Number.isFinite(epochMs) || epochMs <= 0) return '';
  const diffMs = Math.max(0, nowMs - epochMs);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

export function buildSidebarSessionEntries(params: {
  canvasSessions: CanvasSession[];
  hermesSessions: HermesAgentSession[];
  activityByChannel: Record<string, ChannelTaskSummary | undefined>;
  nowMs?: number;
}): SidebarSessionEntry[] {
  const nowMs = params.nowMs ?? Date.now();
  const hermesByKey = new Map<string, HermesAgentSession>();
  for (const hs of params.hermesSessions) {
    hermesByKey.set(hs.channelId, hs);
    hermesByKey.set(hs.sessionId, hs);
  }

  // Include non-core sessions (and include daemon under Runs so background cron isn't orphaned into footer LANES)
  const candidates = params.canvasSessions.filter((s) => s.isCore === false || s.channelId === 'daemon');

  const indexed = candidates.map((session, originalIndex) => {
    const hs = hermesByKey.get(session.channelId) ?? hermesByKey.get(session.hermesSessionId);
    const activity = params.activityByChannel[session.channelId];
    const hasActiveWork =
      Boolean(activity?.hasActiveTask) ||
      hs?.status === 'thinking' ||
      hs?.status === 'running' ||
      hs?.status === 'speaking';
    const runningCount = activity?.runningCount ?? 0;

    const sourceLabel = formatSourceLabel(hs?.source, session.hermesSessionId, session.channelId);
    const titleInfo = formatDisplaySessionTitle({
      topic: hs?.topic || session.topic,
      name: hs?.name || session.name,
      channelId: session.channelId,
      sessionId: session.hermesSessionId,
      lastMessage: hs?.lastMessage,
      sourceLabel,
    });

    const turnCount = hs?.turnCount ?? 0;
    const updatedAtMs = hs?.updatedAtMs ?? 0;
    const relativeTime = formatCompactRelativeTime(updatedAtMs, nowMs);
    const bucket = classifySessionBucket({
      sessionId: session.hermesSessionId,
      channelId: session.channelId,
      source: hs?.source,
      isOpaqueTitle: titleInfo.isOpaque,
      turnCount,
      hasActiveWork,
    });

    const metaParts: string[] = [];
    if (!titleInfo.isOpaque) {
      metaParts.push(sourceLabel);
    }
    if (turnCount > 0) {
      metaParts.push(`${turnCount} ${turnCount === 1 ? 'turn' : 'turns'}`);
    }
    if (hs?.model && hs.model !== 'hermes-agent') {
      const shortModel = hs.model.split('/').pop() || hs.model;
      metaParts.push(shortModel);
    } else if (titleInfo.isOpaque) {
      metaParts.push(`${session.hermesSessionId.slice(0, 14)}…`);
    } else if (
      session.channelId &&
      !isOpaqueSessionIdentifier(session.channelId) &&
      session.channelId !== 'daemon' &&
      !titleInfo.title.toLowerCase().includes(session.channelId.toLowerCase().replace(/-/g, ' '))
    ) {
      metaParts.push(`#${session.channelId}`);
    }
    if (metaParts.length === 0) {
      metaParts.push(sourceLabel);
    }

    const activeTaskTitle = activity?.primaryTitle?.trim() || undefined;
    const metadataLine =
      hasActiveWork && activeTaskTitle
        ? `${sourceLabel} · ${activeTaskTitle}`
        : metaParts.join(' · ');

    const searchText = [
      titleInfo.title,
      session.topic,
      session.name,
      session.channelId,
      session.hermesSessionId,
      sourceLabel,
      hs?.source ?? '',
      hs?.model ?? '',
      activeTaskTitle ?? '',
    ]
      .join(' ')
      .toLowerCase();

    const tooltipParts = [titleInfo.title];
    if (sourceLabel) tooltipParts.push(sourceLabel);
    if (relativeTime) tooltipParts.push(relativeTime);
    tooltipParts.push(session.hermesSessionId);

    return {
      originalIndex,
      entry: {
        session,
        hermesSession: hs,
        bucket,
        displayTitle: titleInfo.title,
        tooltipTitle: tooltipParts.join(' · '),
        sourceLabel,
        relativeTime,
        metadataLine,
        updatedAtMs,
        turnCount,
        hasActiveWork,
        runningCount,
        activeTaskTitle,
        isOpaqueId: titleInfo.isOpaque,
        searchText,
      } satisfies SidebarSessionEntry,
    };
  });

  indexed.sort((a, b) => {
    if (a.entry.hasActiveWork !== b.entry.hasActiveWork) {
      return a.entry.hasActiveWork ? -1 : 1;
    }
    if (a.entry.updatedAtMs !== b.entry.updatedAtMs) {
      return b.entry.updatedAtMs - a.entry.updatedAtMs;
    }
    return b.originalIndex - a.originalIndex;
  });

  return indexed.map((item) => item.entry);
}

export function resolveEffectiveSidebarTab(
  requestedTab: SidebarFilterTab,
  entries: SidebarSessionEntry[]
): SidebarFilterTab {
  if (entries.length === 0) return 'all';
  const chatsCount = entries.filter((e) => e.bucket === 'chats').length;
  const runsCount = entries.length - chatsCount;
  if (requestedTab === 'chats' && chatsCount === 0 && runsCount > 0) {
    return 'runs';
  }
  if (requestedTab === 'runs' && runsCount === 0 && chatsCount > 0) {
    return 'chats';
  }
  return requestedTab;
}

export function filterSidebarSessionEntries(
  entries: SidebarSessionEntry[],
  opts: {
    tab: SidebarFilterTab;
    query: string;
  }
): SidebarSessionFilterResult {
  const chatsCount = entries.filter((e) => e.bucket === 'chats').length;
  const runsCount = entries.length - chatsCount;
  const effectiveTab = resolveEffectiveSidebarTab(opts.tab, entries);
  const q = opts.query.trim().toLowerCase();

  const matchesQuery = (entry: SidebarSessionEntry) =>
    !q || entry.searchText.includes(q);

  const visible = entries.filter((entry) => {
    if (effectiveTab === 'chats' && entry.bucket !== 'chats') return false;
    if (effectiveTab === 'runs' && entry.bucket !== 'runs') return false;
    return matchesQuery(entry);
  });

  const crossBucketMatches =
    q && effectiveTab !== 'all'
      ? entries.filter((entry) => entry.bucket !== effectiveTab && matchesQuery(entry)).length
      : 0;

  return {
    visible,
    chatsCount,
    runsCount,
    totalCount: entries.length,
    crossBucketMatches,
  };
}

export function computeFooterLanes(
  channels: Channel[],
  sidebarEntries: SidebarSessionEntry[]
): Array<Channel & { shortLabel: string }> {
  const sidebarChannelIds = new Set(sidebarEntries.map((e) => e.session.channelId));
  return channels
    .filter((ch) => {
      if (sidebarChannelIds.has(ch.id)) return false;
      if (ch.id === 'daemon') return false;
      if (isOpaqueSessionIdentifier(ch.id) || isOpaqueSessionIdentifier(ch.sessionId)) return false;
      return true;
    })
    .map((ch) => {
      const rawCandidate = ch.id.length <= 18 ? ch.id : ch.name.replace(/^#/, '').slice(0, 16);
      const shortLabel = rawCandidate.startsWith('#') ? rawCandidate : `#${rawCandidate}`;
      return { ...ch, shortLabel };
    });
}
