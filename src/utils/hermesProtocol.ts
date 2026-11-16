import type {
  HermesCapabilities,
  HermesCronJob,
  HermesSkill,
  HermesToolset,
  HermesTransportMode,
} from '../types/hermes';

export interface ProfileGatewayConfig {
  baseUrl: string;
  profile: string;
  apiKey: string;
  routePrefix: string;
}

/**
 * Resolves the authoritative Hermes Gateway base URL, URL prefix (`/p/<profile>`
 * when HERMES_PROFILE is set and not `"default"`), and the matching profile key.
 * Named profiles reject the default listener key with HTTP 401, so `HERMES_PROFILE_API_KEY`
 * or `HERMES_API_KEY_<PROFILE>` takes precedence when HERMES_PROFILE !== "default".
 */
export function resolveProfileGatewayConfig(env: {
  HERMES_API_URL?: string;
  HERMES_PROFILE?: string;
  HERMES_API_KEY?: string;
  HERMES_PROFILE_API_KEY?: string;
  [k: string]: string | undefined;
}): ProfileGatewayConfig {
  const baseUrl = (env.HERMES_API_URL || 'http://127.0.0.1:8642').replace(/\/+$/, '');
  const rawProfile = (env.HERMES_PROFILE || 'default').trim() || 'default';
  const isDefault = rawProfile.toLowerCase() === 'default';
  const routePrefix = isDefault ? '' : `/p/${encodeURIComponent(rawProfile)}`;

  const profileSlugEnv = rawProfile.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
  const profileSpecificKey =
    env[`HERMES_API_KEY_${profileSlugEnv}`]?.trim() ||
    env.HERMES_PROFILE_API_KEY?.trim() ||
    '';
  const defaultKey = (env.HERMES_API_KEY || '').trim();

  return {
    baseUrl,
    profile: rawProfile,
    apiKey: isDefault ? defaultKey : profileSpecificKey || defaultKey,
    routePrefix,
  };
}

export function buildGatewayUrl(
  config: Pick<ProfileGatewayConfig, 'baseUrl' | 'routePrefix'>,
  pathname: string,
  options?: { unprefixed?: boolean }
): string {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const prefix = options?.unprefixed ? '' : config.routePrefix;
  return `${config.baseUrl}${prefix}${cleanPath}`;
}

/**
 * Validates and sanitizes an `X-Hermes-Session-Key` header value per gateway rules:
 * max 256 chars, rejecting CR/LF/NUL control characters.
 */
export function sanitizeSessionKeyHeader(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = String(raw).replace(/[\r\n\x00]/g, '').trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, 256);
}

/**
 * Generates an unguessable 1..255-char visible ASCII `Idempotency-Key` for a turn.
 */
export function createIdempotencyKey(prefix = 'voxcell'): string {
  const cleanPrefix = prefix.replace(/[^\x21-\x7e]/g, '-').slice(0, 32) || 'voxcell';
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
          .toString(36)
          .slice(2, 10)}`;
  return `${cleanPrefix}-${uuid}`.slice(0, 255);
}

export function parseCapabilitiesPayload(raw: unknown): HermesCapabilities | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawFeatures =
    obj.features && typeof obj.features === 'object'
      ? (obj.features as Record<string, unknown>)
      : {};
  const rawEndpoints =
    obj.endpoints && typeof obj.endpoints === 'object'
      ? (obj.endpoints as Record<string, unknown>)
      : {};

  const features: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(rawFeatures)) {
    features[k] = Boolean(v);
  }

  const endpoints: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawEndpoints)) {
    if (typeof v === 'string') endpoints[k] = v;
  }

  return {
    object: typeof obj.object === 'string' ? obj.object : 'hermes.api_server.capabilities',
    platform: typeof obj.platform === 'string' ? obj.platform : 'hermes-agent',
    model: typeof obj.model === 'string' ? obj.model : 'hermes-agent',
    sessionKeyHeader:
      typeof obj.session_key_header === 'string' ? obj.session_key_header : undefined,
    features,
    endpoints: Object.keys(endpoints).length > 0 ? endpoints : undefined,
  };
}

export type ResolvedGatewayTransport = 'runs' | 'chat_completions' | 'session_stream';

/**
 * Chooses the best gateway transport supported by `/v1/capabilities`.
 * - `'runs'`: `POST /v1/runs` + `/v1/runs/{id}/events` (supports live tool lifecycle,
 *   subagents, `/stop`, `/steer`, and canonical `approval.request` / `POST /approval`).
 * - `'chat_completions'`: `POST /v1/chat/completions` (`reasoning_content`, `hermes.tool.progress`,
 *   `X-Hermes-Session-Id` + `X-Hermes-Session-Key`).
 * - `'session_stream'`: `POST /api/sessions/{id}/chat/stream` (`assistant.delta`,
 *   `assistant.commentary`, `tool.*`, `run.*`).
 */
export function chooseGatewayTransport(
  preferred: HermesTransportMode,
  capabilities?: HermesCapabilities | null
): ResolvedGatewayTransport {
  const f = capabilities?.features ?? {};
  const supportsRuns = Boolean(f.run_submission && f.run_events_sse);
  const supportsSessionStream = Boolean(f.session_chat_stream);
  const supportsChat = f.chat_completions !== false;

  if (preferred === 'runs') {
    if (supportsRuns) return 'runs';
    if (supportsChat) return 'chat_completions';
    if (supportsSessionStream) return 'session_stream';
    return 'chat_completions';
  }
  if (preferred === 'session_stream') {
    if (supportsSessionStream) return 'session_stream';
    if (supportsRuns) return 'runs';
    return 'chat_completions';
  }
  if (preferred === 'chat_completions') {
    if (supportsChat) return 'chat_completions';
    if (supportsRuns) return 'runs';
    if (supportsSessionStream) return 'session_stream';
    return 'chat_completions';
  }

  // Auto mode: prefer Runs when runs + approval/status controls are advertised,
  // unless only chat_completions or session_stream is available.
  if (supportsRuns && (f.run_approval || f.run_stop || !f.reasoning_streaming)) {
    return 'runs';
  }
  if (f.reasoning_streaming && supportsChat) {
    return 'chat_completions';
  }
  if (supportsRuns) return 'runs';
  if (supportsSessionStream) return 'session_stream';
  return 'chat_completions';
}

export function extractModelOptions(raw: unknown): {
  models: string[];
  activeModel?: string;
  activeProvider?: string;
  providers: Array<{ id: string; label: string; configured?: boolean }>;
} {
  if (!raw || typeof raw !== 'object') {
    return { models: [], providers: [] };
  }
  const obj = raw as Record<string, unknown>;
  const models: string[] = [];
  const providers: Array<{ id: string; label: string; configured?: boolean }> = [];

  const pushModel = (m: unknown) => {
    if (typeof m === 'string' && m.trim() && !models.includes(m.trim())) {
      models.push(m.trim());
    } else if (m && typeof m === 'object') {
      const mo = m as Record<string, unknown>;
      const id =
        (typeof mo.id === 'string' && mo.id) ||
        (typeof mo.model === 'string' && mo.model) ||
        (typeof mo.name === 'string' && mo.name) ||
        '';
      if (id.trim() && !models.includes(id.trim())) {
        models.push(id.trim());
      }
    }
  };

  if (Array.isArray(obj.models)) obj.models.forEach(pushModel);
  if (Array.isArray(obj.data)) obj.data.forEach(pushModel);
  if (Array.isArray(obj.curated_models)) obj.curated_models.forEach(pushModel);

  const selected =
    obj.selected && typeof obj.selected === 'object'
      ? (obj.selected as Record<string, unknown>)
      : null;

  const activeModel =
    (typeof obj.current_model === 'string' && obj.current_model) ||
    (typeof obj.active_model === 'string' && obj.active_model) ||
    (typeof obj.model === 'string' && obj.model) ||
    (typeof selected?.model === 'string' && selected.model) ||
    models[0];

  const activeProvider =
    (typeof obj.current_provider === 'string' && obj.current_provider) ||
    (typeof obj.active_provider === 'string' && obj.active_provider) ||
    (typeof obj.provider === 'string' && obj.provider) ||
    (typeof selected?.provider === 'string' && selected.provider) ||
    undefined;

  if (Array.isArray(obj.providers)) {
    for (const p of obj.providers) {
      if (typeof p === 'string' && p.trim()) {
        providers.push({ id: p.trim(), label: p.trim(), configured: true });
      } else if (p && typeof p === 'object') {
        const po = p as Record<string, unknown>;
        const id =
          (typeof po.id === 'string' && po.id) ||
          (typeof po.slug === 'string' && po.slug) ||
          (typeof po.name === 'string' && po.name) ||
          '';
        if (!id) continue;
        providers.push({
          id,
          label: (typeof po.label === 'string' && po.label) || id,
          configured:
            po.configured !== undefined
              ? Boolean(po.configured)
              : po.authenticated !== undefined
              ? Boolean(po.authenticated)
              : undefined,
        });
        if (Array.isArray(po.models)) po.models.forEach(pushModel);
      }
    }
  }

  if (activeModel && !models.includes(activeModel)) {
    models.unshift(activeModel);
  }

  return { models, activeModel, activeProvider, providers };
}

export function mapGatewaySkills(raw: unknown): HermesSkill[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
    ? ((raw as Record<string, unknown>).skills ??
        (raw as Record<string, unknown>).data ??
        [])
    : [];
  if (!Array.isArray(list)) return [];

  const result: HermesSkill[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) continue;
    const category = typeof obj.category === 'string' ? obj.category.trim() : undefined;
    const source =
      (typeof obj.source === 'string' && obj.source.trim()) ||
      (typeof obj.path === 'string' && obj.path.trim()) ||
      (category ? `category:${category}` : 'gateway:/v1/skills');
    const summary =
      (typeof obj.description === 'string' && obj.description.trim()) ||
      (typeof obj.summary === 'string' && obj.summary.trim()) ||
      '';
    result.push({
      name,
      source,
      summary,
      category,
      enabled: obj.enabled !== undefined ? Boolean(obj.enabled) : true,
    });
  }
  return result;
}

export function mapGatewayToolsets(raw: unknown): HermesToolset[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
    ? ((raw as Record<string, unknown>).toolsets ??
        (raw as Record<string, unknown>).data ??
        [])
    : [];
  if (!Array.isArray(list)) return [];

  const result: HermesToolset[] = [];
  for (const item of list) {
    if (typeof item === 'string' && item.trim()) {
      result.push({
        name: item.trim(),
        label: item.trim(),
        description: '',
        enabled: true,
        configured: true,
        tools: [],
      });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name) continue;
    const tools = Array.isArray(obj.tools)
      ? obj.tools.filter((t): t is string => typeof t === 'string')
      : [];
    result.push({
      name,
      label: (typeof obj.label === 'string' && obj.label.trim()) || name,
      description: typeof obj.description === 'string' ? obj.description.trim() : '',
      enabled: obj.enabled !== undefined ? Boolean(obj.enabled) : true,
      configured: obj.configured !== undefined ? Boolean(obj.configured) : true,
      tools,
    });
  }
  return result;
}

export function mapGatewayJobs(raw: unknown): HermesCronJob[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
    ? ((raw as Record<string, unknown>).jobs ??
        (raw as Record<string, unknown>).data ??
        [])
    : [];
  if (!Array.isArray(list)) return [];

  const result: HermesCronJob[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id =
      (typeof obj.id === 'string' && obj.id) ||
      (typeof obj.job_id === 'string' && obj.job_id) ||
      (typeof obj.name === 'string' && obj.name) ||
      '';
    if (!id) continue;
    const paused =
      Boolean(obj.paused) ||
      (typeof obj.status === 'string' && obj.status.toLowerCase() === 'paused') ||
      obj.enabled === false;
    result.push({
      id,
      name: typeof obj.name === 'string' ? obj.name : undefined,
      schedule:
        (typeof obj.schedule === 'string' && obj.schedule) ||
        (typeof obj.cron === 'string' && obj.cron) ||
        (typeof obj.schedule_display === 'string' && obj.schedule_display) ||
        '* * * * *',
      channelId:
        (typeof obj.channel_id === 'string' && obj.channel_id) ||
        (typeof obj.delivery_target === 'string' && obj.delivery_target) ||
        (typeof obj.channel === 'string' && obj.channel) ||
        'general',
      mode: obj.command && !obj.prompt ? 'no-agent' : 'agent',
      summary:
        (typeof obj.prompt === 'string' && obj.prompt) ||
        (typeof obj.command === 'string' && obj.command) ||
        (typeof obj.name === 'string' && obj.name) ||
        id,
      paused,
      enabled: obj.enabled !== undefined ? Boolean(obj.enabled) : !paused,
      status: typeof obj.status === 'string' ? obj.status : paused ? 'paused' : 'active',
      lastRunAt: typeof obj.last_run_at === 'string' ? obj.last_run_at : undefined,
      nextRunAt: typeof obj.next_run_at === 'string' ? obj.next_run_at : undefined,
      lastStatus: typeof obj.last_status === 'string' ? obj.last_status : undefined,
    });
  }
  return result;
}

export interface GatewaySessionRecord {
  id: string;
  title?: string;
  source?: string;
  model?: string;
  parentSessionId?: string;
  messageCount?: number;
  createdAtMs?: number;
  updatedAtMs?: number;
}

function toEpochMs(val: unknown): number | undefined {
  if (typeof val === 'number' && Number.isFinite(val)) {
    return val < 10_000_000_000 ? Math.round(val * 1000) : val;
  }
  if (typeof val === 'string' && val.trim()) {
    const asNum = Number(val);
    if (Number.isFinite(asNum)) {
      return asNum < 10_000_000_000 ? Math.round(asNum * 1000) : asNum;
    }
    const parsed = Date.parse(val);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function mapGatewaySessions(raw: unknown): GatewaySessionRecord[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
    ? ((raw as Record<string, unknown>).sessions ??
        (raw as Record<string, unknown>).data ??
        [])
    : [];
  if (!Array.isArray(list)) return [];

  const result: GatewaySessionRecord[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id =
      (typeof obj.session_id === 'string' && obj.session_id) ||
      (typeof obj.id === 'string' && obj.id) ||
      '';
    if (!id.trim()) continue;
    result.push({
      id: id.trim(),
      title: typeof obj.title === 'string' ? obj.title : undefined,
      source: typeof obj.source === 'string' ? obj.source : undefined,
      model: typeof obj.model === 'string' ? obj.model : undefined,
      parentSessionId:
        typeof obj.parent_session_id === 'string' ? obj.parent_session_id : undefined,
      messageCount:
        typeof obj.message_count === 'number' ? obj.message_count : undefined,
      createdAtMs: toEpochMs(obj.created_at ?? obj.started_at),
      updatedAtMs: toEpochMs(obj.updated_at ?? obj.last_active_at ?? obj.created_at),
    });
  }
  return result;
}

export interface GatewaySessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  reasoning?: string;
  createdAtMs: number;
}

export function mapGatewaySessionMessages(
  raw: unknown,
  sessionId: string
): GatewaySessionMessage[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
    ? ((raw as Record<string, unknown>).messages ??
        (raw as Record<string, unknown>).data ??
        [])
    : [];
  if (!Array.isArray(list)) return [];

  const out: GatewaySessionMessage[] = [];
  const baseTs = Date.now() - list.length * 1000;
  list.forEach((item, idx) => {
    if (!item || typeof item !== 'object') return;
    const obj = item as Record<string, unknown>;
    const rawRole = String(obj.role ?? 'assistant').toLowerCase();
    if (rawRole === 'tool' || rawRole === 'developer') return;
    const role: GatewaySessionMessage['role'] =
      rawRole === 'user' ? 'user' : rawRole === 'system' ? 'system' : 'assistant';

    let text = '';
    if (typeof obj.content === 'string') {
      text = obj.content;
    } else if (Array.isArray(obj.content)) {
      text = obj.content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object') {
            const p = part as Record<string, unknown>;
            if (typeof p.text === 'string') return p.text;
            if (p.type === 'input_image' || p.type === 'image_url') return '[image]';
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
    } else if (typeof obj.text === 'string') {
      text = obj.text;
    }

    const reasoning =
      typeof obj.reasoning_content === 'string' && obj.reasoning_content.trim()
        ? obj.reasoning_content
        : typeof obj.reasoning === 'string' && obj.reasoning.trim()
        ? obj.reasoning
        : undefined;

    if (!text.trim() && !reasoning) return;

    out.push({
      id:
        (typeof obj.id === 'string' && obj.id) ||
        `gw-msg-${sessionId}-${idx}`,
      role,
      text: text.trim(),
      reasoning,
      createdAtMs: toEpochMs(obj.created_at ?? obj.timestamp) ?? baseTs + idx * 1000,
    });
  });

  return out;
}

// ---------------------------------------------------------------------------
// SSE Line Framing & Transport Parsers (all preserve `: keepalive` comments)
// ---------------------------------------------------------------------------

export interface SseFrame {
  event: string;
  data: string;
}

export class SseLineDecoder {
  private buffer = '';
  private currentEvent = 'message';
  private dataLines: string[] = [];

  push(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];
    let nlIdx: number;
    while ((nlIdx = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nlIdx).replace(/\r$/, '');
      this.buffer = this.buffer.slice(nlIdx + 1);

      if (line === '') {
        if (this.dataLines.length > 0) {
          frames.push({
            event: this.currentEvent || 'message',
            data: this.dataLines.join('\n'),
          });
        }
        this.currentEvent = 'message';
        this.dataLines = [];
        continue;
      }

      // Per SSE spec: comment lines (`: keepalive`, `: ping`) are ignored.
      if (line.startsWith(':')) continue;

      if (line.startsWith('event:')) {
        this.currentEvent = line.slice('event:'.length).trim() || 'message';
        continue;
      }

      if (line.startsWith('data:')) {
        this.dataLines.push(line.slice('data:'.length).trimStart());
      }
    }
    return frames;
  }

  flush(): SseFrame[] {
    const frames: SseFrame[] = [];
    if (this.buffer.trim()) {
      const tail = this.buffer.replace(/\r$/, '');
      this.buffer = '';
      if (!tail.startsWith(':') && tail.startsWith('data:')) {
        this.dataLines.push(tail.slice('data:'.length).trimStart());
      }
    }
    if (this.dataLines.length > 0) {
      frames.push({
        event: this.currentEvent || 'message',
        data: this.dataLines.join('\n'),
      });
    }
    this.currentEvent = 'message';
    this.dataLines = [];
    return frames;
  }
}

export type TerminalTurnOutcome =
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'interrupted'
  | 'iteration_budget_exhausted'
  | 'admission_conflict';

export interface ParsedToolEvent {
  phase: 'started' | 'progress' | 'completed' | 'failed';
  toolName: string;
  label: string;
  status: string;
  summary: string;
  durationSec?: number;
  error?: string;
}

export interface ParsedApprovalRequest {
  requestId: string;
  executionGeneration: number;
  kind: 'approval' | 'clarify';
  title: string;
  toolName?: string;
  command?: string;
  summary: string;
  destination: string;
  choices: string[];
}

export interface ChatCompletionsParsedResult {
  content: string;
  reasoning: string;
  finishReason: string | null;
  errorCode?: string;
  errorMessage?: string;
  outcome: TerminalTurnOutcome;
  sessionId?: string;
  sessionKey?: string;
  admissionConflict: boolean;
}

export function classifyFinishReason(
  finishReason: string | null | undefined,
  errorCode?: string | null,
  errorMessage?: string | null
): TerminalTurnOutcome {
  const errLower = String(errorMessage ?? '').toLowerCase();
  const codeLower = String(errorCode ?? '').toLowerCase();
  if (errLower === 'admission_conflict' || codeLower === 'admission_conflict') {
    return 'admission_conflict';
  }
  if (finishReason === 'cancelled') return 'cancelled';
  if (finishReason === 'error') return 'failed';
  if (finishReason === 'length' && codeLower === 'iteration_budget_exhausted') {
    return 'iteration_budget_exhausted';
  }
  return 'completed';
}

export function parseChatCompletionsJson(
  raw: unknown
): ChatCompletionsParsedResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const choices = Array.isArray(obj.choices)
    ? (obj.choices as Array<Record<string, unknown>>)
    : [];
  const first = choices[0];
  const msg =
    first?.message && typeof first.message === 'object'
      ? (first.message as Record<string, unknown>)
      : {};
  const hermesMeta =
    obj.hermes && typeof obj.hermes === 'object'
      ? (obj.hermes as Record<string, unknown>)
      : {};
  const errMeta =
    obj.error && typeof obj.error === 'object'
      ? (obj.error as Record<string, unknown>)
      : {};

  const content = typeof msg.content === 'string' ? msg.content : '';
  const reasoning =
    typeof msg.reasoning_content === 'string' ? msg.reasoning_content : '';
  const finishReason =
    typeof first?.finish_reason === 'string' ? first.finish_reason : null;
  const errorCode =
    (typeof hermesMeta.error_code === 'string' && hermesMeta.error_code) ||
    (typeof errMeta.code === 'string' && errMeta.code) ||
    undefined;
  const errorMessage =
    typeof errMeta.message === 'string' ? errMeta.message : undefined;
  const outcome = classifyFinishReason(finishReason, errorCode, errorMessage);

  return {
    content,
    reasoning,
    finishReason,
    errorCode,
    errorMessage,
    outcome,
    sessionId: typeof obj.session_id === 'string' ? obj.session_id : undefined,
    sessionKey: typeof obj.session_key === 'string' ? obj.session_key : undefined,
    admissionConflict: outcome === 'admission_conflict',
  };
}

export interface ChatCompletionsStreamCallbacks {
  onReasoningDelta?: (accumulatedReasoning: string, chunk: string) => void;
  onContentDelta?: (accumulatedContent: string, chunk: string) => void;
  onToolProgress?: (event: ParsedToolEvent) => void;
}

export class ChatCompletionsStreamParser {
  private sse = new SseLineDecoder();
  private content = '';
  private reasoning = '';
  private finishReason: string | null = null;
  private errorCode: string | undefined;
  private errorMessage: string | undefined;
  private sessionId: string | undefined;
  private sessionKey: string | undefined;

  push(chunk: string, cb: ChatCompletionsStreamCallbacks = {}): void {
    const frames = this.sse.push(chunk);
    for (const frame of frames) {
      this.handleFrame(frame, cb);
    }
  }

  finish(cb: ChatCompletionsStreamCallbacks = {}): ChatCompletionsParsedResult {
    for (const frame of this.sse.flush()) {
      this.handleFrame(frame, cb);
    }
    const outcome = classifyFinishReason(
      this.finishReason,
      this.errorCode,
      this.errorMessage
    );
    return {
      content: this.content,
      reasoning: this.reasoning,
      finishReason: this.finishReason,
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
      outcome,
      sessionId: this.sessionId,
      sessionKey: this.sessionKey,
      admissionConflict: outcome === 'admission_conflict',
    };
  }

  private handleFrame(frame: SseFrame, cb: ChatCompletionsStreamCallbacks): void {
    const trimmed = frame.data.trim();
    if (!trimmed || trimmed === '[DONE]') return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }

    if (typeof payload.session_id === 'string') this.sessionId = payload.session_id;
    if (typeof payload.session_key === 'string') this.sessionKey = payload.session_key;

    if (frame.event === 'hermes.tool.progress') {
      const toolName = String(
        payload.tool || payload.name || payload.tool_name || 'tool'
      );
      const status = String(payload.status || 'running');
      const detail = String(
        payload.summary || payload.label || payload.message || payload.args || ''
      ).trim();
      cb.onToolProgress?.({
        phase: status.toLowerCase() === 'failed' || status.toLowerCase() === 'error' ? 'failed' : status.toLowerCase() === 'done' || status.toLowerCase() === 'completed' ? 'completed' : 'progress',
        toolName,
        label: detail ? `${toolName}: ${detail}` : toolName,
        status,
        summary: detail ? `${toolName}: ${detail}` : `Running ${toolName}`,
      });
      return;
    }

    const hermesMeta =
      payload.hermes && typeof payload.hermes === 'object'
        ? (payload.hermes as Record<string, unknown>)
        : null;
    if (hermesMeta && typeof hermesMeta.error_code === 'string') {
      this.errorCode = hermesMeta.error_code;
    }

    const errMeta =
      payload.error && typeof payload.error === 'object'
        ? (payload.error as Record<string, unknown>)
        : null;
    if (errMeta) {
      if (typeof errMeta.code === 'string') this.errorCode = errMeta.code;
      if (typeof errMeta.message === 'string') this.errorMessage = errMeta.message;
    }

    const choices = Array.isArray(payload.choices)
      ? (payload.choices as Array<Record<string, unknown>>)
      : [];
    const first = choices[0];
    if (!first) return;

    if (typeof first.finish_reason === 'string' && first.finish_reason) {
      this.finishReason = first.finish_reason;
    }

    const delta =
      first.delta && typeof first.delta === 'object'
        ? (first.delta as Record<string, unknown>)
        : first.message && typeof first.message === 'object'
        ? (first.message as Record<string, unknown>)
        : null;

    if (delta) {
      const rChunk =
        typeof delta.reasoning_content === 'string'
          ? delta.reasoning_content
          : typeof delta.reasoning === 'string'
          ? delta.reasoning
          : '';
      if (rChunk) {
        this.reasoning += rChunk;
        cb.onReasoningDelta?.(this.reasoning, rChunk);
      }

      const cChunk = typeof delta.content === 'string' ? delta.content : '';
      if (cChunk) {
        this.content += cChunk;
        cb.onContentDelta?.(this.content, cChunk);
      }
    }
  }
}

export interface SessionStreamCallbacks {
  onDelta?: (accumulatedContent: string, chunk: string) => void;
  onCommentary?: (commentary: {
    messageId?: string;
    text: string;
    alreadyStreamed: boolean;
  }) => void;
  onToolEvent?: (event: ParsedToolEvent) => void;
}

export interface SessionStreamResult {
  content: string;
  outcome: TerminalTurnOutcome;
  error?: string;
  partial: boolean;
  interrupted: boolean;
}

export class SessionChatStreamParser {
  private sse = new SseLineDecoder();
  private content = '';
  private outcome: TerminalTurnOutcome | null = null;
  private error: string | undefined;
  private partial = false;
  private interrupted = false;

  push(chunk: string, cb: SessionStreamCallbacks = {}): void {
    for (const frame of this.sse.push(chunk)) {
      this.handleFrame(frame, cb);
    }
  }

  finish(cb: SessionStreamCallbacks = {}): SessionStreamResult {
    for (const frame of this.sse.flush()) {
      this.handleFrame(frame, cb);
    }
    const finalOutcome: TerminalTurnOutcome =
      this.outcome ??
      (this.interrupted
        ? 'cancelled'
        : this.error
        ? 'failed'
        : 'completed');
    return {
      content: this.content,
      outcome: finalOutcome,
      error: this.error,
      partial: this.partial,
      interrupted: this.interrupted,
    };
  }

  private handleFrame(frame: SseFrame, cb: SessionStreamCallbacks): void {
    const trimmed = frame.data.trim();
    if (!trimmed || trimmed === '[DONE]') return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }

    const evType = (typeof payload.type === 'string' && payload.type) || frame.event;

    switch (evType) {
      case 'assistant.delta': {
        const delta =
          typeof payload.delta === 'string'
            ? payload.delta
            : typeof payload.text === 'string'
            ? payload.text
            : '';
        if (delta) {
          this.content += delta;
          cb.onDelta?.(this.content, delta);
        }
        break;
      }
      case 'assistant.commentary': {
        const text = typeof payload.text === 'string' ? payload.text : '';
        if (text.trim()) {
          cb.onCommentary?.({
            messageId:
              typeof payload.message_id === 'string' ? payload.message_id : undefined,
            text,
            alreadyStreamed: Boolean(payload.already_streamed),
          });
        }
        break;
      }
      case 'assistant.completed': {
        // Explicit spec: an assistant finalization frame is NOT proof of success on its own.
        if (typeof payload.content === 'string' && !this.content) {
          this.content = payload.content;
        }
        if (payload.partial !== undefined) this.partial = Boolean(payload.partial);
        if (payload.interrupted !== undefined) {
          this.interrupted = Boolean(payload.interrupted);
        }
        break;
      }
      case 'tool.started': {
        const toolName = String(payload.tool || payload.name || 'tool');
        const preview = String(
          payload.args_preview || payload.preview || payload.args || payload.summary || ''
        ).trim();
        cb.onToolEvent?.({
          phase: 'started',
          toolName,
          label: preview ? `${toolName}: ${preview}` : toolName,
          status: 'running',
          summary: preview ? `${toolName}: ${preview}` : `Running ${toolName}`,
        });
        break;
      }
      case 'tool.completed':
      case 'tool.failed': {
        const toolName = String(payload.tool || payload.name || 'tool');
        const isError = evType === 'tool.failed' || Boolean(payload.error);
        const preview = String(
          payload.preview || payload.result || payload.error || ''
        ).trim();
        cb.onToolEvent?.({
          phase: isError ? 'failed' : 'completed',
          toolName,
          label: preview ? `${toolName}: ${preview}` : toolName,
          status: isError ? 'failed' : 'done',
          summary: preview
            ? `${toolName}: ${preview}`
            : `${toolName} ${isError ? 'failed' : 'completed'}`,
          durationSec: typeof payload.duration === 'number' ? payload.duration : undefined,
          error: typeof payload.error === 'string' ? payload.error : undefined,
        });
        break;
      }
      case 'run.completed': {
        this.outcome = 'completed';
        if (typeof payload.output === 'string' && payload.output && !this.content) {
          this.content = payload.output;
        }
        break;
      }
      case 'run.failed': {
        this.outcome = 'failed';
        if (typeof payload.error === 'string') this.error = payload.error;
        break;
      }
      case 'run.cancelled': {
        this.outcome = 'cancelled';
        if (typeof payload.error === 'string') this.error = payload.error;
        break;
      }
    }
  }
}

export interface RunsEventCallbacks {
  onDelta?: (accumulatedContent: string, chunk: string) => void;
  onReasoningDelta?: (accumulatedReasoning: string, chunk: string) => void;
  onInterim?: (interim: { text: string; alreadyStreamed: boolean }) => void;
  onToolEvent?: (event: ParsedToolEvent) => void;
  onApprovalRequest?: (req: ParsedApprovalRequest) => void;
  onSubagentStart?: (info: { summary: string; childSessionId?: string; delegationId?: string }) => void;
  onSubagentComplete?: (info: {
    status: string;
    summary: string;
    childSessionId?: string;
    delegationId?: string;
  }) => void;
  onSteered?: (text: string) => void;
}

export interface RunsStreamResult {
  output: string;
  reasoning: string;
  outcome: TerminalTurnOutcome;
  error?: string;
  errorCode?: string;
  model?: string;
}

export class RunsEventStreamParser {
  private sse = new SseLineDecoder();
  private content = '';
  private reasoning = '';
  private finalOutput: string | undefined;
  private outcome: TerminalTurnOutcome | null = null;
  private error: string | undefined;
  private errorCode: string | undefined;
  private model: string | undefined;

  push(chunk: string, cb: RunsEventCallbacks = {}): void {
    for (const frame of this.sse.push(chunk)) {
      this.handleFrame(frame, cb);
    }
  }

  finish(cb: RunsEventCallbacks = {}): RunsStreamResult {
    for (const frame of this.sse.flush()) {
      this.handleFrame(frame, cb);
    }
    return {
      output: this.finalOutput ?? this.content,
      reasoning: this.reasoning,
      outcome: this.outcome ?? (this.error ? 'failed' : 'completed'),
      error: this.error,
      errorCode: this.errorCode,
      model: this.model,
    };
  }

  private handleFrame(frame: SseFrame, cb: RunsEventCallbacks): void {
    const trimmed = frame.data.trim();
    if (!trimmed || trimmed === '[DONE]') return;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      return;
    }

    const evType = (typeof payload.type === 'string' && payload.type) || frame.event;

    switch (evType) {
      case 'message.reasoning':
      case 'reasoning.delta': {
        const chunk =
          typeof payload.delta === 'string'
            ? payload.delta
            : typeof payload.text === 'string'
            ? payload.text
            : '';
        if (chunk) {
          this.reasoning += chunk;
          cb.onReasoningDelta?.(this.reasoning, chunk);
        }
        break;
      }
      case 'message.delta': {
        const reasoningChunk =
          typeof payload.reasoning_content === 'string'
            ? payload.reasoning_content
            : '';
        if (reasoningChunk) {
          this.reasoning += reasoningChunk;
          cb.onReasoningDelta?.(this.reasoning, reasoningChunk);
        }
        const chunk =
          typeof payload.delta === 'string'
            ? payload.delta
            : typeof payload.text === 'string'
            ? payload.text
            : typeof payload.content === 'string'
            ? payload.content
            : '';
        if (chunk) {
          this.content += chunk;
          cb.onDelta?.(this.content, chunk);
        }
        break;
      }
      case 'message.interim': {
        const text = typeof payload.text === 'string' ? payload.text : '';
        if (text.trim()) {
          cb.onInterim?.({
            text,
            alreadyStreamed: Boolean(payload.already_streamed),
          });
        }
        break;
      }
      case 'tool.started': {
        const toolName = String(payload.tool || payload.name || 'tool');
        const preview = String(
          payload.preview || payload.args_preview || payload.args || ''
        ).trim();
        cb.onToolEvent?.({
          phase: 'started',
          toolName,
          label: preview ? `${toolName}: ${preview}` : toolName,
          status: 'running',
          summary: preview ? `${toolName}: ${preview}` : `Running ${toolName}`,
        });
        break;
      }
      case 'tool.completed':
      case 'tool.failed': {
        const toolName = String(payload.tool || payload.name || 'tool');
        const isErr = evType === 'tool.failed' || Boolean(payload.error);
        const preview = String(
          payload.preview || payload.result || (typeof payload.error === 'string' ? payload.error : '') || ''
        ).trim();
        cb.onToolEvent?.({
          phase: isErr ? 'failed' : 'completed',
          toolName,
          label: preview ? `${toolName}: ${preview}` : toolName,
          status: isErr ? 'failed' : 'done',
          summary: preview
            ? `${toolName}: ${preview}`
            : `${toolName} ${isErr ? 'failed' : 'completed'}`,
          durationSec: typeof payload.duration === 'number' ? payload.duration : undefined,
          error: typeof payload.error === 'string' ? payload.error : isErr ? preview || 'error' : undefined,
        });
        break;
      }
      case 'approval.request':
      case 'clarify.request': {
        const requestId =
          (typeof payload.request_id === 'string' && payload.request_id) ||
          (typeof payload.prompt_id === 'string' && payload.prompt_id) ||
          '';
        const executionGeneration = Number(payload.execution_generation ?? 1);
        const command =
          (typeof payload.command === 'string' && payload.command) ||
          (typeof payload.args_preview === 'string' && payload.args_preview) ||
          (typeof payload.draft === 'string' && payload.draft) ||
          '';
        const toolName =
          (typeof payload.tool === 'string' && payload.tool) ||
          (typeof payload.tool_name === 'string' && payload.tool_name) ||
          undefined;
        const choices = Array.isArray(payload.choices)
          ? payload.choices.filter((c): c is string => typeof c === 'string')
          : ['once', 'always', 'deny'];
        if (requestId) {
          cb.onApprovalRequest?.({
            requestId,
            executionGeneration: Number.isFinite(executionGeneration) ? executionGeneration : 1,
            kind: evType === 'clarify.request' ? 'clarify' : 'approval',
            title:
              (typeof payload.title === 'string' && payload.title) ||
              (toolName ? `Approve ${toolName}` : 'Approval required'),
            toolName,
            command,
            summary:
              (typeof payload.description === 'string' && payload.description) ||
              (typeof payload.summary === 'string' && payload.summary) ||
              (command ? `Execute: ${command}` : 'Hermes run paused awaiting approval.'),
            destination:
              (typeof payload.destination === 'string' && payload.destination) ||
              toolName ||
              'hermes-run',
            choices,
          });
        }
        break;
      }
      case 'subagent.start': {
        const summary =
          (typeof payload.summary === 'string' && payload.summary) ||
          (typeof payload.task === 'string' && payload.task) ||
          'Subagent spawned';
        cb.onSubagentStart?.({
          summary,
          childSessionId:
            typeof payload.child_session_id === 'string' ? payload.child_session_id : undefined,
          delegationId:
            typeof payload.delegation_id === 'string' ? payload.delegation_id : undefined,
        });
        break;
      }
      case 'subagent.complete': {
        const status = String(payload.status || 'completed');
        const summary =
          (typeof payload.summary === 'string' && payload.summary) ||
          `Subagent ${status}`;
        cb.onSubagentComplete?.({
          status,
          summary,
          childSessionId:
            typeof payload.child_session_id === 'string' ? payload.child_session_id : undefined,
          delegationId:
            typeof payload.delegation_id === 'string' ? payload.delegation_id : undefined,
        });
        break;
      }
      case 'run.steered': {
        const text = typeof payload.text === 'string' ? payload.text : '';
        if (text) cb.onSteered?.(text);
        break;
      }
      case 'run.completed': {
        if (typeof payload.output === 'string') {
          this.finalOutput = payload.output;
        }
        if (typeof payload.reasoning_content === 'string' && !this.reasoning) {
          this.reasoning = payload.reasoning_content;
        }
        const errCode = typeof payload.error_code === 'string' ? payload.error_code : undefined;
        if (errCode === 'iteration_budget_exhausted') {
          this.errorCode = errCode;
          this.outcome = 'iteration_budget_exhausted';
        } else {
          this.outcome = 'completed';
        }
        if (payload.runtime && typeof payload.runtime === 'object') {
          const rt = payload.runtime as Record<string, unknown>;
          if (typeof rt.model === 'string') this.model = rt.model;
        }
        break;
      }
      case 'run.failed': {
        this.outcome = 'failed';
        this.error = typeof payload.error === 'string' ? payload.error : 'Run failed';
        if (typeof payload.error_code === 'string') this.errorCode = payload.error_code;
        break;
      }
      case 'run.cancelled': {
        this.outcome = 'cancelled';
        this.error = typeof payload.error === 'string' ? payload.error : undefined;
        break;
      }
      case 'run.interrupted': {
        this.outcome = 'interrupted';
        this.error =
          typeof payload.error === 'string'
            ? payload.error
            : 'Gateway shutdown interrupted the run.';
        break;
      }
    }
  }
}

export interface Retry429Options {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException('Aborted', 'AbortError'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseRetryAfterMs(headerVal: string | null): number | null {
  if (!headerVal) return null;
  const sec = Number(headerVal.trim());
  if (Number.isFinite(sec) && sec >= 0) {
    return Math.min(30_000, Math.round(sec * 1000));
  }
  const dateMs = Date.parse(headerVal);
  if (Number.isFinite(dateMs)) {
    return Math.min(30_000, Math.max(0, dateMs - Date.now()));
  }
  return null;
}

/**
 * Retries HTTP 429 ("Too many concurrent runs") with exponential backoff while
 * preserving the caller's `Idempotency-Key` across attempts.
 */
export async function fetchWithConcurrentRetry(
  makeRequest: () => Promise<Response>,
  opts: Retry429Options = {}
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 350;
  const maxDelayMs = opts.maxDelayMs ?? 5000;
  const sleepFn = opts.sleep ?? defaultSleep;

  let attempt = 0;
  while (true) {
    const res = await makeRequest();
    if (res.status !== 429 || attempt >= maxRetries) {
      return res;
    }
    const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
    const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
    const waitMs = retryAfterMs !== null ? Math.max(retryAfterMs, 50) : expDelay;
    attempt += 1;
    await sleepFn(waitMs, opts.signal);
  }
}
