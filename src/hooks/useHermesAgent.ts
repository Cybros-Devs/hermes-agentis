import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApprovalCard,
  BackgroundTask,
  BriefDecision,
  Channel,
  HermesAgentSession,
  HermesCronJob,
  HermesGatewayStatus,
  HermesSkill,
  HermesToolset,
  HermesTransportMode,
  TerminalEntry,
  TerminalTurnOutcome,
} from '../types/hermes';
import type { UiCustomizationPatch } from '../utils/uiCustomization';
import { isTerminalSettledItem, normalizeChannelId } from '../utils/homeSession';
import { createIdempotencyKey } from '../utils/hermesProtocol';

interface HermesCardPayload {
  type: string;
  title?: string;
  body?: string;
  status: string;
  draft?: string;
  action?: string;
  destination?: string;
  url?: string;
  command?: string;
  requestId?: string;
  executionGeneration?: number;
  choices?: string[];
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
  error_code?: string;
  terminal_outcome?: TerminalTurnOutcome;
  card?: HermesCardPayload;
  ui_patch?: UiCustomizationPatch;
  activity?: {
    run_id: string;
    status: string;
    kind?: 'reasoning' | 'commentary' | 'tool' | 'subagent' | 'status';
    summary?: string;
    detail?: string;
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
  run_id?: string;
  error_code?: string;
  progress?: string;
  steps?: { text: string; done?: boolean; active?: boolean }[];
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
  | { type: 'session_reset'; channelId: string; session: HermesAgentSession; item?: HermesServerItem | null }
  | { type: 'session_deleted'; channelId: string }
  | { type: 'ui_patch'; channelId?: string; patch: UiCustomizationPatch };

export interface UseHermesAgentOptions {
  upsertEntry: (entry: TerminalEntry) => void;
  patchEntryText: (id: string, text: string) => void;
  onAssistantComplete: (text: string, channelId: string) => void;
  onRunActive?: (channelId: string) => void;
  onRunSettled?: (channelId: string) => void;
  onSessionStatus?: (channelId: string, status: HermesAgentSession['status']) => void;
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
  if (a.kind === 'reasoning' && a.detail) return `Reasoning: ${a.detail}`;
  if (item.text) return item.text;
  if (a.error) return a.error;
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
      activityStatus: item.activity?.status,
      activityKind: item.activity?.kind,
      reasoningDetail: item.activity?.detail,
      streaming: Boolean(item.streaming),
      errorCode: item.error_code,
      terminalOutcome: item.terminal_outcome,
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
    errorCode: item.error_code,
    terminalOutcome: item.terminal_outcome,
    timestamp: hhmm(item.created_at),
    createdAtMs: item.created_at,
  };
}

function pendingToApproval(
  item: HermesServerItem,
  aliases?: ReadonlyMap<string, string>
): ApprovalCard | null {
  const c = item.card;
  if (!c || (c.type !== 'approval' && c.type !== 'payment' && c.type !== 'clarify')) return null;
  return {
    id: item.id,
    channelId: normalizeChannelId(item.channel_id, aliases),
    title: c.title || 'Run approval required',
    actionType: c.type === 'payment' || c.action === 'pay' ? 'payment' : 'send_message',
    kind: c.type === 'clarify' ? 'clarify' : 'approval',
    mcpTool: c.action || 'agent_action',
    runId: item.run_id ?? undefined,
    requestId: c.requestId,
    executionGeneration: c.executionGeneration,
    choices: c.choices,
    command: c.command,
    destination: c.destination ?? c.url ?? 'hermes-gateway',
    summary: (c.body ?? '').slice(0, 280),
    draft: c.draft ?? c.command ?? '',
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
  const resolvedChannelId = normalizeChannelId(t.channel_id || t.session_id, aliases);
  return {
    id: t.id,
    channelId: resolvedChannelId,
    sessionId: t.session_id,
    runId: t.run_id,
    errorCode: t.error_code,
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
  const [skills, setSkills] = useState<HermesSkill[]>([]);
  const [toolsets, setToolsets] = useState<HermesToolset[]>([]);
  const [cronJobs, setCronJobs] = useState<HermesCronJob[]>([]);
  const [transportMode, setTransportMode] = useState<HermesTransportMode>('auto');

  const optsRef = useRef(opts);
  optsRef.current = opts;
  const spokenItemIdsRef = useRef<Set<string>>(new Set());
  const loadedChannelsRef = useRef<Set<string>>(new Set());

  const refreshGateway = useCallback(async () => {
    try {
      const [gwRes, ctxRes] = await Promise.all([
        fetch('/api/hermes/gateway'),
        fetch('/api/hermes/context').catch(() => null),
      ]);
      let nextGw: HermesGatewayStatus | null = null;
      if (gwRes.ok) {
        nextGw = (await gwRes.json()) as HermesGatewayStatus;
        setGatewayStatus(nextGw);
        if (Array.isArray(nextGw.toolsets)) {
          setToolsets(nextGw.toolsets);
        }
      }
      if (ctxRes?.ok) {
        const ctx = (await ctxRes.json()) as {
          skills?: HermesSkill[];
          toolsets?: HermesToolset[];
          cronJobs?: HermesCronJob[];
        };
        if (Array.isArray(ctx.skills)) setSkills(ctx.skills);
        if (Array.isArray(ctx.toolsets)) setToolsets(ctx.toolsets);
        if (Array.isArray(ctx.cronJobs)) setCronJobs(ctx.cronJobs);
      }
      return nextGw;
    } catch {
      return null;
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/hermes/jobs');
      if (!res.ok) return [];
      const data = (await res.json()) as { jobs?: HermesCronJob[] };
      const list = Array.isArray(data.jobs) ? data.jobs : [];
      setCronJobs(list);
      return list;
    } catch {
      return [];
    }
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
    } else if (
      (item.kind === 'activity' && item.activity?.status) ||
      (item.kind === 'assistant' && item.streaming)
    ) {
      optsRef.current.onRunActive?.(entry.channelId);
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
        if (Array.isArray(snap.sessions)) {
          setSessions(snap.sessions);
          for (const s of snap.sessions) {
            optsRef.current.onSessionStatus?.(normalizeChannelId(s.channelId), s.status);
          }
        }
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
          const gw = (await gwRes.json()) as HermesGatewayStatus;
          setGatewayStatus(gw);
          if (Array.isArray(gw.toolsets)) setToolsets(gw.toolsets);
        }
        if (ctxRes?.ok) {
          const ctx = (await ctxRes.json()) as {
            skills?: HermesSkill[];
            toolsets?: HermesToolset[];
            cronJobs?: HermesCronJob[];
          };
          if (Array.isArray(ctx.skills)) setSkills(ctx.skills);
          if (Array.isArray(ctx.toolsets)) setToolsets(ctx.toolsets);
          if (Array.isArray(ctx.cronJobs)) setCronJobs(ctx.cronJobs);
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
          optsRef.current.onSessionStatus?.(
            normalizeChannelId(data.session.channelId),
            data.session.status
          );
        } else if (data.type === 'session_reset') {
          const resetChannelId = normalizeChannelId(data.channelId);
          setSessions((prev) => {
            const next = prev.filter((s) => s.channelId !== data.session.channelId);
            next.push(data.session);
            return next;
          });
          setTasks((prev) =>
            prev.filter((t) => !(t.channelId === resetChannelId && t.id.startsWith('task-turn-')))
          );
          optsRef.current.onSessionStatus?.(resetChannelId, data.session.status);
          optsRef.current.onSessionReset?.(resetChannelId);
          if (data.item) applyItem(data.item, false);
        } else if (data.type === 'session_deleted') {
          const deletedId = normalizeChannelId(data.channelId);
          setSessions((prev) => prev.filter((s) => s.channelId !== deletedId));
          setChannels((prev) => prev.filter((c) => c.id !== deletedId));
          setTasks((prev) => prev.filter((t) => t.channelId !== deletedId));
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
        sessionKey?: string;
        persona?: string;
        transportMode?: HermesTransportMode;
        idempotencyKey?: string;
        model?: string;
        provider?: string;
      }
    ) => {
      const idemKey = sessionMeta?.idempotencyKey || createIdempotencyKey('turn');
      const res = await fetch('/api/hermes/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idemKey,
        },
        body: JSON.stringify({
          text,
          channel_id: channelId,
          name: sessionMeta?.name,
          topic: sessionMeta?.topic,
          session_id: sessionMeta?.sessionId,
          session_key: sessionMeta?.sessionKey,
          persona: sessionMeta?.persona,
          transport_mode: sessionMeta?.transportMode ?? transportMode,
          idempotency_key: idemKey,
          model: sessionMeta?.model,
          provider: sessionMeta?.provider,
        }),
      });
      if (!res.ok) throw new Error(`hermes message failed: HTTP ${res.status}`);
      const data = (await res.json()) as {
        item?: HermesServerItem;
        session?: HermesAgentSession;
        task?: HermesTaskPayload;
        idempotencyKey?: string;
      };
      if (data.task) {
        const mappedTask = mapTask(data.task);
        setTasks((prev) => {
          const existing = prev.find((t) => t.id === mappedTask.id);
          if (
            existing &&
            (existing.updatedAtMs ?? 0) > (mappedTask.updatedAtMs ?? 0)
          ) {
            return prev;
          }
          return [...prev.filter((t) => t.id !== mappedTask.id), mappedTask];
        });
      }
      return data;
    },
    [transportMode]
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
      item?: HermesServerItem | null;
    };
  }, []);

  const deleteHermesSession = useCallback(async (channelId: string) => {
    const res = await fetch(`/api/hermes/sessions/${encodeURIComponent(channelId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`delete session failed: HTTP ${res.status}`);
    return res.json();
  }, []);

  const actOnRunApproval = useCallback(
    async (card: ApprovalCard, choice: 'once' | 'always' | 'deny') => {
      const runId = card.runId;
      const requestId = card.requestId;
      const executionGeneration = card.executionGeneration;
      if (!runId || !requestId || typeof executionGeneration !== 'number') {
        throw new Error('Approval is missing real run_id, request_id, or execution_generation');
      }
      const res = await fetch(`/api/hermes/runs/${encodeURIComponent(runId)}/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          execution_generation: executionGeneration,
          choice,
          card_id: card.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (body as { error?: string; message?: string }).error || (body as { message?: string }).message || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setApprovals((prev) => prev.filter((a) => a.id !== card.id));
      return body;
    },
    []
  );

  const clarifyRun = useCallback(
    async (card: ApprovalCard, answer: string) => {
      const runId = card.runId;
      const requestId = card.requestId;
      const executionGeneration = card.executionGeneration;
      if (!runId || !requestId || typeof executionGeneration !== 'number') {
        throw new Error('Clarification is missing real run_id, request_id, or execution_generation');
      }
      const res = await fetch(`/api/hermes/runs/${encodeURIComponent(runId)}/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          execution_generation: executionGeneration,
          answer,
          card_id: card.id,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (body as { error?: string; message?: string }).error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setApprovals((prev) => prev.filter((a) => a.id !== card.id));
      return body;
    },
    []
  );

  const stopRun = useCallback(async (runId: string) => {
    const res = await fetch(`/api/hermes/runs/${encodeURIComponent(runId)}/stop`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`stop run failed: HTTP ${res.status}`);
    return res.json();
  }, []);

  const steerRun = useCallback(async (runId: string, text: string) => {
    const res = await fetch(`/api/hermes/runs/${encodeURIComponent(runId)}/steer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`steer run failed: HTTP ${res.status}`);
    return res.json();
  }, []);

  const createJob = useCallback(
    async (payload: { prompt: string; schedule: string; name?: string; model?: string }) => {
      const res = await fetch('/api/hermes/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
      }
      await refreshJobs();
      return body;
    },
    [refreshJobs]
  );

  const pauseJob = useCallback(
    async (jobId: string) => {
      const res = await fetch(`/api/hermes/jobs/${encodeURIComponent(jobId)}/pause`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`pause job failed: HTTP ${res.status}`);
      await refreshJobs();
    },
    [refreshJobs]
  );

  const resumeJob = useCallback(
    async (jobId: string) => {
      const res = await fetch(`/api/hermes/jobs/${encodeURIComponent(jobId)}/resume`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`resume job failed: HTTP ${res.status}`);
      await refreshJobs();
    },
    [refreshJobs]
  );

  const runJob = useCallback(
    async (jobId: string) => {
      const res = await fetch(`/api/hermes/jobs/${encodeURIComponent(jobId)}/run`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`run job failed: HTTP ${res.status}`);
      await refreshJobs();
    },
    [refreshJobs]
  );

  const deleteJob = useCallback(
    async (jobId: string) => {
      const res = await fetch(`/api/hermes/jobs/${encodeURIComponent(jobId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`delete job failed: HTTP ${res.status}`);
      await refreshJobs();
    },
    [refreshJobs]
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
      toolsets,
      cronJobs,
      transportMode,
      setTransportMode,
      sendMessage,
      abortRun,
      createHermesSession,
      loadChannelHistory,
      resetHermesSession,
      deleteHermesSession,
      actOnRunApproval,
      clarifyRun,
      stopRun,
      steerRun,
      refreshJobs,
      createJob,
      pauseJob,
      resumeJob,
      runJob,
      deleteJob,
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
      toolsets,
      cronJobs,
      transportMode,
      sendMessage,
      abortRun,
      createHermesSession,
      loadChannelHistory,
      resetHermesSession,
      deleteHermesSession,
      actOnRunApproval,
      clarifyRun,
      stopRun,
      steerRun,
      refreshJobs,
      createJob,
      pauseJob,
      resumeJob,
      runJob,
      deleteJob,
      confirmTask,
      reopenTask,
      cancelTask,
      steerTask,
    ]
  );
}
