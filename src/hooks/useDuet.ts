import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
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
  session_id: string;
  topic?: string | null;
  archived?: boolean;
  last_at?: number | null;
}
interface DuetSnapshot {
  items: DuetItem[];
  pending: DuetItem[];
  tasks: DuetTask[];
  channels: DuetChannel[];
}
type DuetServerEvent =
  | { type: 'item'; item: DuetItem }
  | { type: 'delta'; item_id: string; text: string }
  | { type: 'task'; task: DuetTask }
  | { type: 'channel'; channel: DuetChannel };

export interface UseDuetOptions {
  /** Upsert a transcript entry derived from a Duet item (by id). */
  upsertEntry: (entry: TerminalEntry) => void;
  /** Patch an entry's text while it streams. */
  patchEntryText: (id: string, text: string) => void;
  /** A complete assistant reply arrived (spoken line + TTS hook). */
  onAssistantComplete: (text: string) => void;
  /** An approval card settled (so the UI can react optimistically). */
  onCardSettled?: (itemId: string, status: 'approved' | 'declined') => void;
}

function hhmm(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function itemToEntry(item: DuetItem): TerminalEntry | null {
  if (item.kind === 'card' || item.kind === 'activity') return null;
  const role: TerminalEntry['role'] =
    item.kind === 'assistant' ? 'hermes' : item.kind === 'user' ? 'user' : 'system';
  return {
    id: item.id,
    channelId: item.channel_id || 'general',
    role,
    source: 'ui',
    text: item.text ?? '',
    timestamp: hhmm(item.created_at),
    createdAtMs: item.created_at,
  };
}

function pendingToApproval(item: DuetItem): ApprovalCard | null {
  const c = item.card;
  if (!c || (c.type !== 'approval' && c.type !== 'payment')) return null;
  return {
    id: item.id,
    channelId: item.channel_id || 'general',
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
    channelId: t.channel_id ?? 'general',
    title: t.title,
    status,
    progress: taskProgress(t),
    lastStep,
    updatedAt: hhmm(t.created_at),
  };
}

function mapChannel(ch: DuetChannel): Channel {
  return {
    id: ch.id,
    name: ch.name,
    sessionId: ch.session_id,
    description: ch.topic ?? '',
    unreadCount: 0,
  };
}

export function useDuet(opts: UseDuetOptions) {
  const [connected, setConnected] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [approvals, setApprovals] = useState<ApprovalCard[]>([]);
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [brief, setBrief] = useState<BriefDecision[]>([]);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  /** Item ids whose completion already triggered speech; replays stay silent. */
  const spokenItemIdsRef = useRef<Set<string>>(new Set());

  const applyItem = useCallback((item: DuetItem) => {
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
      optsRef.current.upsertEntry(entry);
      if (
        item.kind === 'assistant' &&
        !item.streaming &&
        item.text &&
        item.text.trim().length > 0
      ) {
        if (!spokenItemIdsRef.current.has(item.id)) {
          spokenItemIdsRef.current.add(item.id);
          optsRef.current.onAssistantComplete(item.text.trim());
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
          .map(itemToEntry)
          .filter((e): e is TerminalEntry => e !== null)
          .sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));
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
        if (data.type === 'item') applyItem(data.item);
        else if (data.type === 'delta') {
          optsRef.current.patchEntryText(data.item_id, data.text);
        } else if (data.type === 'task') setTasks((prev) => {
          const next = prev.filter((t) => t.id !== data.task.id);
          next.push(mapTask(data.task));
          return next;
        });
        else if (data.type === 'channel') setChannels((prev) => {
          const mapped = mapChannel(data.channel);
          const next = prev.filter((c) => c.id !== mapped.id);
          next.push(mapped);
          return next;
        });
      } catch {
        // ignore malformed frames
      }
    };
    return () => es.close();
  }, [applyItem]);

  const sendMessage = useCallback(async (text: string, channelId: string) => {
    const res = await fetch('/api/duet/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, channel_id: channelId }),
    });
    if (!res.ok) throw new Error(`duet message failed: HTTP ${res.status}`);
    return (await res.json()) as { item?: DuetItem };
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

  return useMemo(
    () => ({ connected, channels, approvals, tasks, brief, sendMessage, actOnCard }),
    [connected, channels, approvals, tasks, brief, sendMessage, actOnCard]
  );
}
