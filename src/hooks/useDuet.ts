import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  HermesAgentSession,
  TerminalEntry,
} from '../types/hermes';

/** Minimal shapes of the Duet server's shared types (snake_case, as served). */
interface DuetCard {
  type: string;
  title?: string;
  body?: string;
  status: string;
  draft?: string;
  action?: string;
  destination?: string;
  url?: string;
  entries?: { title?: string; summary?: string }[];
}
interface DuetItem {
  id: string;
  kind: 'user' | 'assistant' | 'card' | 'activity' | 'system';
  created_at: number;
  updated_at?: number;
  channel_id?: string;
  text?: string;
  streaming?: boolean;
  run_id?: string | null;
  card?: DuetCard;
  activity?: {
    run_id: string;
    status: string;
    summary?: string;
    error?: string;
    steps?: { name: string; label?: string; status: string }[];
  };
}
interface DuetTask {
  id: string;
  title: string;
  status: string;
  progress?: string;
  steps?: { text: string; done?: boolean }[];
  result?: string;
  channel_id?: string;
  created_at: number;
}
interface DuetChannel {
  id: string;
  name: string;
  slug?: string;
  session_id: string;
  topic?: string | null;
  /** Real Duet channels keep the agent persona here (standing instructions). */
  instructions?: string | null;
  persona?: string | null;
  archived?: boolean;
  last_at?: number | null;
}
interface DuetSnapshot {
  items: DuetItem[];
  pending: DuetItem[];
  tasks: DuetTask[];
  channels: DuetChannel[];
  sessions?: HermesAgentSession[];
}
type DuetServerEvent =
  | { type: 'item'; item: DuetItem }
  | { type: 'delta'; item_id: string; text: string }
  | { type: 'task'; task: DuetTask }
  | { type: 'channel'; channel: DuetChannel }
  | { type: 'session'; session: HermesAgentSession }
  | { type: 'session_reset'; channelId: string; session: HermesAgentSession; item?: DuetItem }
  | { type: 'session_deleted'; channelId: string };

export interface UseDuetOptions {
  /** Upsert a transcript entry derived from a Duet item (by id). */
  upsertEntry: (entry: TerminalEntry) => void;
  /** Patch an entry's text while it streams. */
  patchEntryText: (id: string, text: string) => void;
  /** A complete assistant reply arrived (spoken line + TTS hook + scoped channelId). */
  onAssistantComplete: (text: string, channelId: string) => void;
  /** Called when an isolated session resets on the server. */
  onSessionReset?: (channelId: string) => void;
  /** An approval card settled (so the UI can react optimistically). */
  onCardSettled?: (itemId: string, status: 'approved' | 'declined') => void;
}

function hhmm(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Compact one-line label for the agent's live work (activity items). */
function activityText(item: DuetItem): string {
  const a = item.activity;
  if (!a) return '';
  if (a.summary) return a.summary;
  const running = a.steps?.find((s) => s.status === 'running');
  const last = running ?? a.steps?.[a.steps.length - 1];
  if (last) return `${last.label ?? last.name} — ${running ? 'running' : last.status}`;
  return `run ${a.status}`;
}

function itemToEntry(item: DuetItem): TerminalEntry | null {
  if (item.kind === 'card') return null;
  if (item.kind === 'activity') {
    return {
      id: item.id,
      channelId: localChannelId(item.channel_id),
      role: 'activity',
      source: 'ui',
      text: activityText(item),
      timestamp: hhmm(item.created_at),
      createdAtMs: item.created_at,
    };
  }
  const role: TerminalEntry['role'] =
    item.kind === 'assistant' ? 'hermes' : item.kind === 'user' ? 'user' : 'system';
  return {
    id: item.id,
    channelId: localChannelId(item.channel_id),
    role,
    source: 'ui',
    text: item.text ?? '',
    timestamp: hhmm(item.created_at),
    createdAtMs: item.created_at,
  };
}

export { itemToEntry as duetItemToEntry };

function pendingToApproval(item: DuetItem): ApprovalCard | null {
  const c = item.card;
  if (!c || (c.type !== 'approval' && c.type !== 'payment')) return null;
  return {
    id: item.id,
    channelId: localChannelId(item.channel_id),
    title: c.title || 'Untitled request',
    actionType: c.type === 'payment' || c.action === 'pay' ? 'payment' : 'send_message',
    mcpTool:
      c.type === 'payment' ? 'mcp__duet__request_payment' : 'mcp__duet__request_approval',
    runId: item.run_id ?? undefined,
    destination: c.destination ?? c.url ?? 'duet',
    summary: (c.body ?? '').slice(0, 200),
    draft: c.draft ?? '',
    status: c.status === 'approved' ? 'approved' : c.status === 'declined' ? 'rejected' : 'pending',
    createdAt: hhmm(item.created_at),
  };
}

function pendingToBrief(item: DuetItem): BriefDecision | null {
  const c = item.card;
  if (!c || c.type !== 'brief' || !c.entries?.length) return null;
  const top = c.entries[0];
  return {
    id: item.id,
    title: top.title ?? c.title ?? 'Brief decision',
    priority: 'high',
    detail: (top.summary ?? c.body ?? '').slice(0, 200),
    suggestedCommand: '',
    resolved: c.status !== 'pending',
  };
}

function taskProgress(t: DuetTask): number {
  const p = t.progress ?? '';
  if (/^\d+$/.test(p)) return Math.min(100, Number(p));
  const frac = p.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Math.min(100, Math.round((Number(frac[1]) / Math.max(1, Number(frac[2]))) * 100));
  if (t.status === 'done') return 100;
  if (t.status === 'running') return 42;
  return 0;
}

function mapTask(t: DuetTask): BackgroundTask {
  const status: BackgroundTask['status'] =
    t.status === 'running' || t.status === 'queued'
      ? 'running'
      : t.status === 'waiting'
      ? 'paused'
      : 'completed';
  const lastDone = [...(t.steps ?? [])].reverse().find((s) => s.done);
  const lastStep = lastDone?.text ?? (t.steps ?? []).slice(-1)[0]?.text ?? (t.result ?? '').slice(0, 80) ?? t.status;
  return {
    id: t.id,
    channelId: localChannelId(t.channel_id),
    title: t.title,
    status,
    progress: taskProgress(t),
    lastStep,
    updatedAt: hhmm(t.created_at),
  };
}

function mapChannel(ch: DuetChannel): Channel {
  const id = localChannelId(ch.slug || ch.id);
  return {
    id,
    name: ch.name,
    sessionId: ch.session_id,
    description: ch.topic ?? '',
    persona: ch.persona ?? ch.instructions ?? undefined,
    unreadCount: 0,
  };
}

/**
 * Real Duet channels use ids like "chan-general"; the canvas dots and standalone
 * lanes key channels by slug ("general"). Normalize every channel id on ingest so
 * dots, transcript entries, and the active channel always agree. The server
 * resolves the slug back to the real channel id when proxying.
 */
function localChannelId(id?: string | null): string {
  const raw = (id ?? '').replace(/^chan-/, '').trim().toLowerCase();
  return raw || 'general';
}

export function useDuet(opts: UseDuetOptions) {
  const [connected, setConnected] = useState(false);
  const [linked, setLinked] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sessions, setSessions] = useState<HermesAgentSession[]>([]);
  /**
   * Live per-channel stats derived from real Duet items. In linked mode the
   * upstream snapshot has no `sessions` array, so canvas dots read their
   * thinking/speaking/turn state from here.
   */
  const channelStatsRef = useRef<
    Map<string, { lastIsUser: boolean; streaming: boolean; userCount: number; lastAssistant?: string; updatedAtMs: number }>
  >(new Map());
  const [statsTick, setStatsTick] = useState(0);
  const [approvals, setApprovals] = useState<ApprovalCard[]>([]);
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [brief, setBrief] = useState<BriefDecision[]>([]);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  /** Item ids whose completion already triggered speech; replays stay silent. */
  const spokenItemIdsRef = useRef<Set<string>>(new Set());

  /** Track live per-channel state from a Duet item (linked-mode dot status). */
  const noteItemStats = useCallback((item: DuetItem) => {
    if (item.kind !== 'user' && item.kind !== 'assistant') return;
    const ch = localChannelId(item.channel_id);
    const st = channelStatsRef.current.get(ch) ?? { lastIsUser: false, streaming: false, userCount: 0, updatedAtMs: 0 };
    if (item.kind === 'user') {
      st.userCount += 1;
      st.lastIsUser = true;
      st.streaming = false;
    } else {
      st.lastIsUser = false;
      st.streaming = Boolean(item.streaming);
      if (!item.streaming && item.text) st.lastAssistant = item.text.trim().slice(0, 140);
    }
    st.updatedAtMs = item.updated_at ?? item.created_at;
    channelStatsRef.current.set(ch, st);
  }, []);

  const applyItem = useCallback((item: DuetItem, triggerSpeech = true) => {
    if (item.kind === 'card') {
      const approval = pendingToApproval(item);
      if (approval) {
        setApprovals((prev) => {
          const next = prev.filter((a) => a.id !== approval.id);
          if (approval.status === 'pending') next.push(approval);
          else if (approval.status === 'rejected') optsRef.current.onCardSettled?.(approval.id, 'declined');
          return next;
        });
        return;
      }
      const briefItem = pendingToBrief(item);
      if (briefItem) {
        setBrief((prev) => {
          const next = prev.filter((b) => b.id !== briefItem.id);
          if (!briefItem.resolved) next.push(briefItem);
          return next;
        });
        return;
      }
      return;
    }
    const entry = itemToEntry(item);
    if (entry) {
      noteItemStats(item);
      setStatsTick((t) => t + 1);
      optsRef.current.upsertEntry(entry);
      if (
        triggerSpeech &&
        item.kind === 'assistant' &&
        !item.streaming &&
        item.text &&
        item.text.trim().length > 0 &&
        !item.id.startsWith('init-welcome-')
      ) {
        if (!spokenItemIdsRef.current.has(item.id)) {
          spokenItemIdsRef.current.add(item.id);
          optsRef.current.onAssistantComplete(item.text.trim(), entry.channelId);
        }
      }
    }
  }, []);

  // Initial snapshot load.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/duet/state');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const snap = (await res.json()) as DuetSnapshot;
        if (!active) return;
        setChannels(
          (snap.channels ?? [])
            .filter((c) => !c.archived)
            .map(mapChannel)
        );
        if (Array.isArray(snap.sessions)) {
          setSessions(snap.sessions);
        }
        // Real Duet snapshots carry no `sessions` array — we are linked to the
        // live server; standalone mode does. Dots read derived sessions instead.
        setLinked(!Array.isArray(snap.sessions));
        setApprovals(
          (snap.pending ?? [])
            .map(pendingToApproval)
            .filter((a): a is ApprovalCard => a !== null && a.status === 'pending')
        );
        setBrief(
          (snap.pending ?? [])
            .map(pendingToBrief)
            .filter((b): b is BriefDecision => b !== null && !b.resolved)
        );
        setTasks((snap.tasks ?? []).map(mapTask));
        const entries = (snap.items ?? [])
          .map((item) => {
            if (item.kind === 'assistant' && item.id) {
              spokenItemIdsRef.current.add(item.id);
            }
            noteItemStats(item);
            return itemToEntry(item);
          })
          .filter((e): e is TerminalEntry => e !== null)
          .sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));
        setStatsTick((t) => t + 1);
        for (const e of entries) optsRef.current.upsertEntry(e);
        setConnected(true);
      } catch {
        if (active) setConnected(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Live updates over the SSE passthrough.
  useEffect(() => {
    const es = new EventSource('/api/duet/events');
    es.onopen = () => setConnected(true);
    // EventSource auto-reconnects on transient drops; only flag dead when fully closed.
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) setConnected(false);
    };
    es.onmessage = (ev) => {
      setConnected(true);
      try {
        const data = JSON.parse(ev.data) as DuetServerEvent;
        if (data.type === 'item') applyItem(data.item, true);
        else if (data.type === 'delta') {
          optsRef.current.patchEntryText(data.item_id, data.text);
        } else if (data.type === 'task') {
          setTasks((prev) => {
            const next = prev.filter((t) => t.id !== data.task.id);
            next.push(mapTask(data.task));
            return next;
          });
        } else if (data.type === 'channel') {
          setChannels((prev) => {
            const mapped = mapChannel(data.channel);
            const next = prev.filter((c) => c.id !== mapped.id);
            next.push(mapped);
            return next;
          });
        } else if (data.type === 'session') {
          setSessions((prev) => {
            const next = prev.filter((s) => s.channelId !== data.session.channelId);
            next.push(data.session);
            return next;
          });
        } else if (data.type === 'session_reset') {
          setSessions((prev) => {
            const next = prev.filter((s) => s.channelId !== data.session.channelId);
            next.push(data.session);
            return next;
          });
          optsRef.current.onSessionReset?.(data.channelId);
          if (data.item) applyItem(data.item, false);
        } else if (data.type === 'session_deleted') {
          setSessions((prev) => prev.filter((s) => s.channelId !== data.channelId));
          setChannels((prev) => prev.filter((c) => c.id !== data.channelId));
        }
      } catch {
        // ignore malformed frames
      }
    };
    const handleUnload = () => es.close();
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      es.close();
    };
  }, [applyItem]);

  const sendMessage = useCallback(
    async (
      text: string,
      channelId: string,
      sessionMeta?: { sessionId?: string; persona?: string }
    ) => {
      const res = await fetch('/api/duet/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          channel_id: channelId,
          session_id: sessionMeta?.sessionId,
          persona: sessionMeta?.persona,
        }),
      });
      if (!res.ok) throw new Error(`duet message failed: HTTP ${res.status}`);
      return (await res.json()) as { item?: DuetItem; session?: HermesAgentSession };
    },
    []
  );

  const createHermesSession = useCallback(
    async (payload: {
      channelId: string;
      name: string;
      sessionId: string;
      topic: string;
      persona: string;
    }) => {
      const res = await fetch('/api/hermes/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`create session failed: HTTP ${res.status}`);
      return (await res.json()) as {
        session?: HermesAgentSession;
        channel?: DuetChannel;
        item?: DuetItem | null;
      };
    },
    []
  );

  const resetHermesSession = useCallback(async (channelId: string) => {
    const res = await fetch(`/api/hermes/sessions/${encodeURIComponent(channelId)}/reset`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`reset session failed: HTTP ${res.status}`);
    return (await res.json()) as {
      ok: boolean;
      session?: HermesAgentSession;
      item?: DuetItem;
    };
  }, []);

  const deleteHermesSession = useCallback(async (channelId: string) => {
    const res = await fetch(`/api/hermes/sessions/${encodeURIComponent(channelId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`delete session failed: HTTP ${res.status}`);
    return res.json();
  }, []);

  const actOnCard = useCallback(async (cardId: string, action: 'approve' | 'decline', value?: string) => {
    const res = await fetch(`/api/duet/cards/${encodeURIComponent(cardId)}/act`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, value }),
    });
    if (!res.ok) throw new Error(`duet card action failed: HTTP ${res.status}`);
    return res.json();
  }, []);

  // Linked mode: derive live dot state from real channels + item stats.
  // Standalone mode keeps the server-tracked sessions untouched.
  const sessionsOut = useMemo<HermesAgentSession[]>(() => {
    if (sessions.length > 0) return sessions;
    return channels.map((ch) => {
      const st = channelStatsRef.current.get(ch.id);
      const status: HermesAgentSession['status'] = st?.streaming
        ? 'speaking'
        : st?.lastIsUser
        ? 'thinking'
        : 'idle';
      return {
        sessionId: ch.sessionId,
        channelId: ch.id,
        name: ch.name,
        persona: ch.persona ?? '',
        topic: ch.description,
        status,
        turnCount: st?.userCount ?? 0,
        ...(st?.lastAssistant ? { lastMessage: st.lastAssistant } : {}),
        updatedAtMs: st?.updatedAtMs ?? 0,
      };
    });
  }, [sessions, channels, statsTick]);

  return useMemo(
    () => ({
      connected,
      linked,
      channels,
      sessions: sessionsOut,
      approvals,
      tasks,
      brief,
      sendMessage,
      createHermesSession,
      resetHermesSession,
      deleteHermesSession,
      actOnCard,
    }),
    [
      connected,
      linked,
      channels,
      sessionsOut,
      approvals,
      tasks,
      brief,
      sendMessage,
      createHermesSession,
      resetHermesSession,
      deleteHermesSession,
      actOnCard,
    ]
  );
}
