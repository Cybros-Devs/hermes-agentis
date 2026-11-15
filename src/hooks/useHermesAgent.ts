import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  HermesAgentSession,
  HermesCronJob,
  HermesGatewayStatus,
  HermesMemoryItem,
  HermesSkill,
  TerminalEntry,
} from '../types/hermes';
import type { UiCustomizationConfig, UiCustomizationPatch } from '../utils/uiCustomization';
import { isTerminalSettledItem, normalizeChannelId } from '../utils/homeSession';
import {
  INITIAL_HERMES_CRON,
  INITIAL_HERMES_MEMORY,
  INITIAL_HERMES_SKILLS,
} from '../utils/cliEngine';

interface HermesCardPayload {
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

export interface HermesServerItem {
  id: string;
  kind: 'user' | 'assistant' | 'card' | 'activity' | 'system';
  created_at: number;
  updated_at?: number;
  channel_id?: string;
  text?: string;
  streaming?: boolean;
  run_id?: string | null;
  card?: HermesCardPayload;
  ui_patch?: UiCustomizationPatch;
  activity?: {
    run_id: string;
    status: string;
    summary?: string;
    error?: string;
    steps?: { name: string; label?: string; status: string }[];
  };
}

interface HermesTaskPayload {
  id: string;
  title: string;
  status: string;
  kind?: string;
  background?: boolean;
  handover_id?: string;
  session_id?: string;
  progress?: string;
  steps?: { text: string; done?: boolean }[];
  result?: string;
  channel_id?: string;
  agent_done_at?: number;
  confirmed_at?: number;
  created_at: number;
  updated_at?: number;
}

interface HermesChannelPayload {
  id: string;
  name: string;
  slug?: string;
  session_id: string;
  topic?: string | null;
  instructions?: string | null;
  persona?: string | null;
  archived?: boolean;
  last_at?: number | null;
}

interface HermesStateSnapshot {
  items: HermesServerItem[];
  pending: HermesServerItem[];
  tasks: HermesTaskPayload[];
  channels: HermesChannelPayload[];
  sessions?: HermesAgentSession[];
}

type HermesServerEvent =
  | { type: 'item'; item: HermesServerItem }
  | { type: 'delta'; item_id: string; text: string }
  | { type: 'task'; task: HermesTaskPayload }
  | { type: 'channel'; channel: HermesChannelPayload }
  | { type: 'session'; session: HermesAgentSession }
  | { type: 'session_reset'; channelId: string; session: HermesAgentSession; item?: HermesServerItem }
  | { type: 'session_deleted'; channelId: string }
  | { type: 'ui_patch'; channelId?: string; patch: UiCustomizationPatch };

export interface UseHermesAgentOptions {
  upsertEntry: (entry: TerminalEntry) => void;
  patchEntryText: (id: string, text: string) => void;
  onAssistantComplete: (text: string, channelId: string) => void;
  onRunSettled?: (channelId: string) => void;
  onSessionReset?: (channelId: string) => void;
  onCardSettled?: (itemId: string, status: 'approved' | 'declined') => void;
  onUiPatch?: (patch: UiCustomizationPatch, channelId?: string) => void;
}

function hhmm(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function activityText(item: HermesServerItem): string {
  const a = item.activity;
  if (!a) return item.text ?? '';
  if (a.summary) return a.summary;
  const running = a.steps?.find((s) => s.status === 'running');
  const last = running ?? a.steps?.[a.steps.length - 1];
  if (last) return `${last.label ?? last.name} — ${running ? 'running' : last.status}`;
  return `run ${a.status}`;
}

export function hermesItemToEntry(
  item: HermesServerItem,
  aliases?: ReadonlyMap<string, string>
): TerminalEntry | null {
  if (item.kind === 'card') return null;
  const resolvedChannel = normalizeChannelId(item.channel_id, aliases);
  if (item.kind === 'activity') {
    return {
      id: item.id,
      channelId: resolvedChannel,
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
    channelId: resolvedChannel,
    role,
    source: 'ui',
    text: item.text ?? '',
    streaming: Boolean(item.streaming),
    timestamp: hhmm(item.created_at),
    createdAtMs: item.created_at,
  };
}

function pendingToApproval(
  item: HermesServerItem,
  aliases?: ReadonlyMap<string, string>
): ApprovalCard | null {
  const c = item.card;
  if (!c || (c.type !== 'approval' && c.type !== 'payment')) return null;
  return {
    id: item.id,
    channelId: normalizeChannelId(item.channel_id, aliases),
    title: c.title || 'Untitled request',
    actionType: c.type === 'payment' || c.action === 'pay' ? 'payment' : 'send_message',
    mcpTool: c.action || 'agent_action',
    runId: item.run_id ?? undefined,
    destination: c.destination ?? c.url ?? 'hermes',
    summary: (c.body ?? '').slice(0, 200),
    draft: c.draft ?? '',
    status: c.status === 'approved' ? 'approved' : c.status === 'declined' ? 'rejected' : 'pending',
    createdAt: hhmm(item.created_at),
  };
}

function pendingToBrief(item: HermesServerItem): BriefDecision | null {
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

function taskProgress(t: HermesTaskPayload): number {
  const p = t.progress ?? '';
  if (/^\d+$/.test(p)) return Math.min(100, Number(p));
  const frac = p.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Math.min(100, Math.round((Number(frac[1]) / Math.max(1, Number(frac[2]))) * 100));
  if (t.status === 'done') return 100;
  if (t.status === 'running') return 42;
  return 0;
}

function mapTask(t: HermesTaskPayload, aliases?: ReadonlyMap<string, string>): BackgroundTask {
  const status: BackgroundTask['status'] =
    t.status === 'running' || t.status === 'queued'
      ? 'running'
      : t.status === 'waiting' || t.status === 'paused'
      ? 'paused'
      : 'completed';
  const activeOrNext = (t.steps ?? []).find((s) => !s.done);
  const lastDone = [...(t.steps ?? [])].reverse().find((s) => s.done);
  const lastStep =
    (status === 'running' ? activeOrNext?.text : undefined) ??
    lastDone?.text ??
    (t.steps ?? []).slice(-1)[0]?.text ??
    (t.result ?? '').slice(0, 100) ??
    t.status;
  const resolvedChannelId = normalizeChannelId(t.channel_id, aliases);
  return {
    id: t.id,
    channelId: resolvedChannelId,
    sessionId: t.session_id,
    kind: t.kind ?? (t.background === false ? 'In chat' : 'Background'),
    background: t.background,
    handoverId: t.handover_id,
    title: t.title,
    status,
    rawStatus: t.status,
    progress: taskProgress(t),
    progressLabel: t.progress,
    lastStep,
    steps: t.steps,
    result: t.result,
    agentDoneAtMs: t.agent_done_at,
    confirmedAtMs: t.confirmed_at,
    createdAtMs: t.created_at,
    updatedAtMs: t.updated_at ?? t.created_at,
    updatedAt: hhmm(t.updated_at ?? t.created_at),
  };
}

function mapChannel(ch: HermesChannelPayload): Channel {
  const id = normalizeChannelId(ch.slug || ch.id);
  return {
    id,
    name: ch.name,
    sessionId: ch.session_id,
    description: ch.topic ?? '',
    persona: ch.persona ?? ch.instructions ?? undefined,
    unreadCount: 0,
  };
}

export function useHermesAgent(opts: UseHermesAgentOptions) {
  const [initialLoading, setInitialLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<HermesGatewayStatus | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sessions, setSessions] = useState<HermesAgentSession[]>([]);
  const [approvals, setApprovals] = useState<ApprovalCard[]>([]);
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [brief, setBrief] = useState<BriefDecision[]>([]);
  const [skills, setSkills] = useState<HermesSkill[]>(INITIAL_HERMES_SKILLS);
  const [memory, setMemory] = useState<HermesMemoryItem[]>(INITIAL_HERMES_MEMORY);
  const [cronJobs, setCronJobs] = useState<HermesCronJob[]>(INITIAL_HERMES_CRON);

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const spokenItemIdsRef = useRef<Set<string>>(new Set());
  const loadedChannelsRef = useRef<Set<string>>(new Set());

  const refreshGateway = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/gateway');
      if (res.ok) {
        const data = (await res.json()) as HermesGatewayStatus;
        setGatewayStatus(data);
        return data;
      }
    } catch {
      // keep existing status
    }
    return null;
  }, []);

  const applyItem = useCallback((item: HermesServerItem, triggerSpeech = true) => {
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

    const entry = hermesItemToEntry(item);
    if (!entry) return;

    optsRef.current.upsertEntry(entry);
    if (isTerminalSettledItem(item)) {
      optsRef.current.onRunSettled?.(entry.channelId);
    }
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
        if (item.ui_patch) {
          optsRef.current.onUiPatch?.(item.ui_patch, entry.channelId);
        }
        optsRef.current.onAssistantComplete(item.text.trim(), entry.channelId);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [stateRes, gwRes, ctxRes] = await Promise.all([
          fetch('/api/hermes/state'),
          fetch('/api/hermes/gateway').catch(() => null),
          fetch('/api/hermes/context').catch(() => null),
        ]);
        if (!stateRes.ok) throw new Error(`HTTP ${stateRes.status}`);
        const snap = (await stateRes.json()) as HermesStateSnapshot;
        if (!active) return;

        setChannels((snap.channels ?? []).filter((c) => !c.archived).map(mapChannel));
        if (Array.isArray(snap.sessions)) setSessions(snap.sessions);
        setApprovals(
          (snap.pending ?? [])
            .map((p) => pendingToApproval(p))
            .filter((a): a is ApprovalCard => a !== null && a.status === 'pending')
        );
        setBrief(
          (snap.pending ?? [])
            .map(pendingToBrief)
            .filter((b): b is BriefDecision => b !== null && !b.resolved)
        );
        setTasks((snap.tasks ?? []).map((t) => mapTask(t)));

        const entries = (snap.items ?? [])
          .map((item) => {
            if (item.kind === 'assistant' && item.id) {
              spokenItemIdsRef.current.add(item.id);
            }
            return hermesItemToEntry(item);
          })
          .filter((e): e is TerminalEntry => e !== null)
          .sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0));
        for (const e of entries) optsRef.current.upsertEntry(e);

        if (gwRes?.ok) {
          setGatewayStatus((await gwRes.json()) as HermesGatewayStatus);
        }
        if (ctxRes?.ok) {
          const ctx = (await ctxRes.json()) as {
            skills?: HermesSkill[];
            memory?: HermesMemoryItem[];
            cronJobs?: HermesCronJob[];
          };
          if (Array.isArray(ctx.skills) && ctx.skills.length > 0) setSkills(ctx.skills);
          if (Array.isArray(ctx.memory) && ctx.memory.length > 0) setMemory(ctx.memory);
          if (Array.isArray(ctx.cronJobs) && ctx.cronJobs.length > 0) setCronJobs(ctx.cronJobs);
        }

        setConnected(true);
        setInitialLoading(false);
      } catch {
        if (active) {
          setConnected(false);
          setInitialLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/hermes/events');
    es.onopen = () => setConnected(true);
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) setConnected(false);
    };
    es.onmessage = (ev) => {
      setConnected(true);
      try {
        const data = JSON.parse(ev.data) as HermesServerEvent;
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
        } else if (data.type === 'ui_patch' && data.patch) {
          optsRef.current.onUiPatch?.(data.patch, data.channelId);
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
      sessionMeta?: {
        name?: string;
        topic?: string;
        sessionId?: string;
        persona?: string;
        uiConfig?: Partial<UiCustomizationConfig>;
      }
    ) => {
      const res = await fetch('/api/hermes/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          channel_id: channelId,
          name: sessionMeta?.name,
          topic: sessionMeta?.topic,
          session_id: sessionMeta?.sessionId,
          persona: sessionMeta?.persona,
          ui_config: sessionMeta?.uiConfig,
        }),
      });
      if (!res.ok) throw new Error(`hermes message failed: HTTP ${res.status}`);
      return (await res.json()) as { item?: HermesServerItem; session?: HermesAgentSession };
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
      skipWelcome?: boolean;
      requireFresh?: boolean;
    }) => {
      const res = await fetch('/api/hermes/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`create session failed: HTTP ${res.status}`);
      const data = (await res.json()) as {
        resolvedChannelId?: string;
        session?: HermesAgentSession;
        channel?: HermesChannelPayload;
        item?: HermesServerItem | null;
      };
      if (data.channel) {
        const mapped = mapChannel(data.channel);
        setChannels((prev) => {
          const next = prev.filter((c) => c.id !== mapped.id);
          next.push(mapped);
          return next;
        });
      }
      return data;
    },
    []
  );

  const loadChannelHistory = useCallback(
    async (channelId: string, force = false) => {
      const cleanId = normalizeChannelId(channelId);
      if (!cleanId) return;
      if (!force && loadedChannelsRef.current.has(cleanId)) return;
      try {
        const res = await fetch(`/api/hermes/channels/${encodeURIComponent(cleanId)}/items`);
        if (!res.ok) return;
        const page = (await res.json()) as { items?: HermesServerItem[] };
        loadedChannelsRef.current.add(cleanId);
        const pageItems = [...(page.items ?? [])].sort((a, b) => a.created_at - b.created_at);
        for (const item of pageItems) {
          if (item.kind === 'assistant' && item.id) {
            spokenItemIdsRef.current.add(item.id);
          }
          applyItem(item, false);
        }
      } catch {
        // non-fatal
      }
    },
    [applyItem]
  );

  const abortRun = useCallback(async (channelId: string) => {
    await fetch(`/api/hermes/sessions/${encodeURIComponent(channelId)}/abort`, {
      method: 'POST',
    }).catch(() => {});
  }, []);

  const resetHermesSession = useCallback(async (channelId: string) => {
    const res = await fetch(`/api/hermes/sessions/${encodeURIComponent(channelId)}/reset`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`reset session failed: HTTP ${res.status}`);
    return (await res.json()) as {
      ok: boolean;
      session?: HermesAgentSession;
      item?: HermesServerItem;
    };
  }, []);

  const deleteHermesSession = useCallback(async (channelId: string) => {
    const res = await fetch(`/api/hermes/sessions/${encodeURIComponent(channelId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`delete session failed: HTTP ${res.status}`);
    return res.json();
  }, []);

  const actOnCard = useCallback(
    async (cardId: string, action: 'approve' | 'decline', value?: string) => {
      const res = await fetch(`/api/hermes/cards/${encodeURIComponent(cardId)}/act`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, value }),
      });
      if (!res.ok) throw new Error(`card action failed: HTTP ${res.status}`);
      return res.json();
    },
    []
  );

  const confirmTask = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/hermes/tasks/${encodeURIComponent(taskId)}/confirm`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`confirm task failed: HTTP ${res.status}`);
    return (await res.json()) as { ok: boolean; task?: HermesTaskPayload };
  }, []);

  const reopenTask = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/hermes/tasks/${encodeURIComponent(taskId)}/reopen`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`reopen task failed: HTTP ${res.status}`);
    return (await res.json()) as { ok: boolean; task?: HermesTaskPayload };
  }, []);

  const cancelTask = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/hermes/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`cancel task failed: HTTP ${res.status}`);
    return (await res.json()) as { ok: boolean; task?: HermesTaskPayload };
  }, []);

  const steerTask = useCallback(async (taskId: string, text: string) => {
    const res = await fetch(`/api/hermes/tasks/${encodeURIComponent(taskId)}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`steer task failed: HTTP ${res.status}`);
    return (await res.json()) as { ok: boolean; task?: HermesTaskPayload };
  }, []);

  return useMemo(
    () => ({
      initialLoading,
      connected,
      gatewayStatus,
      refreshGateway,
      channels,
      sessions,
      approvals,
      tasks,
      brief,
      skills,
      memory,
      cronJobs,
      sendMessage,
      abortRun,
      createHermesSession,
      loadChannelHistory,
      resetHermesSession,
      deleteHermesSession,
      actOnCard,
      confirmTask,
      reopenTask,
      cancelTask,
      steerTask,
    }),
    [
      initialLoading,
      connected,
      gatewayStatus,
      refreshGateway,
      channels,
      sessions,
      approvals,
      tasks,
      brief,
      skills,
      memory,
      cronJobs,
      sendMessage,
      abortRun,
      createHermesSession,
      loadChannelHistory,
      resetHermesSession,
      deleteHermesSession,
      actOnCard,
      confirmTask,
      reopenTask,
      cancelTask,
      steerTask,
    ]
  );
}
