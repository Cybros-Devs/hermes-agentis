import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChatCompletionsStreamParser,
  RunsEventStreamParser,
  SessionChatStreamParser,
  buildGatewayUrl,
  chooseGatewayTransport,
  createIdempotencyKey,
  extractModelOptions,
  fetchWithConcurrentRetry,
  mapGatewayJobs,
  mapGatewaySessionMessages,
  mapGatewaySessions,
  mapGatewaySkills,
  mapGatewayToolsets,
  parseCapabilitiesPayload,
  parseChatCompletionsJson,
  resolveProfileGatewayConfig,
  sanitizeSessionKeyHeader,
} from './hermesProtocol';

test('resolveProfileGatewayConfig routes default unprefixed and named profiles under /p/<profile> with profile key', () => {
  const def = resolveProfileGatewayConfig({
    HERMES_API_URL: 'http://127.0.0.1:8642/',
    HERMES_PROFILE: 'default',
    HERMES_API_KEY: 'default-key',
    HERMES_PROFILE_API_KEY: 'profile-key',
  });
  assert.equal(def.routePrefix, '');
  assert.equal(def.apiKey, 'default-key');
  assert.equal(buildGatewayUrl(def, '/v1/capabilities'), 'http://127.0.0.1:8642/v1/capabilities');

  const work = resolveProfileGatewayConfig({
    HERMES_API_URL: 'http://127.0.0.1:8642',
    HERMES_PROFILE: 'work-ops',
    HERMES_API_KEY: 'default-key',
    HERMES_PROFILE_API_KEY: 'work-secret',
  });
  assert.equal(work.routePrefix, '/p/work-ops');
  assert.equal(work.apiKey, 'work-secret');
  assert.equal(buildGatewayUrl(work, '/v1/runs'), 'http://127.0.0.1:8642/p/work-ops/v1/runs');
  assert.equal(
    buildGatewayUrl(work, '/health', { unprefixed: true }),
    'http://127.0.0.1:8642/health'
  );
});

test('sanitizeSessionKeyHeader and createIdempotencyKey enforce gateway constraints', () => {
  assert.equal(sanitizeSessionKeyHeader('  chan\r\n-1\x00  '), 'chan-1');
  assert.equal(sanitizeSessionKeyHeader('a'.repeat(400))?.length, 256);
  const k = createIdempotencyKey('turn');
  assert.ok(k.startsWith('turn-'));
  assert.ok(k.length > 10 && k.length <= 255);
  assert.match(k, /^[\x21-\x7e]+$/);
});

test('parseCapabilitiesPayload and chooseGatewayTransport feature-detect cleanly', () => {
  const caps = parseCapabilitiesPayload({
    object: 'hermes.api_server.capabilities',
    platform: 'hermes-agent',
    model: 'nous/hermes-4',
    session_key_header: 'X-Hermes-Session-Key',
    features: {
      chat_completions: true,
      reasoning_streaming: true,
      run_submission: true,
      run_events_sse: true,
      run_approval: true,
      session_chat_stream: true,
    },
  });
  assert.ok(caps);
  assert.equal(caps?.sessionKeyHeader, 'X-Hermes-Session-Key');
  assert.equal(chooseGatewayTransport('auto', caps), 'runs');
  assert.equal(chooseGatewayTransport('chat_completions', caps), 'chat_completions');
  assert.equal(chooseGatewayTransport('session_stream', caps), 'session_stream');

  const noRunsCaps = parseCapabilitiesPayload({
    features: { chat_completions: true, reasoning_streaming: true },
  });
  assert.equal(chooseGatewayTransport('auto', noRunsCaps), 'chat_completions');
  assert.equal(chooseGatewayTransport('runs', noRunsCaps), 'chat_completions');
});

test('ChatCompletionsStreamParser preserves keepalives, parses reasoning_content, tool progress, and terminal finish_reason states', () => {
  const parser = new ChatCompletionsStreamParser();
  const reasoningEvents: string[] = [];
  const deltas: string[] = [];
  const tools: string[] = [];

  const sseChunk1 = [
    ': keepalive',
    '',
    'data: {"choices":[{"delta":{"reasoning_content":"Inspecting git status "}}],"session_id":"s-1","session_key":"k-1"}',
    '',
    'data: {"choices":[{"delta":{"reasoning_content":"before editing."}}]}',
    '',
    'event: hermes.tool.progress',
    'data: {"tool":"terminal","status":"running","summary":"git status --short"}',
    '',
    'data: {"choices":[{"delta":{"content":"Partial summary: "}}]}',
    '',
    'data: {"choices":[{"delta":{"content":"2 files changed."},"finish_reason":"length"}],"hermes":{"error_code":"iteration_budget_exhausted"}}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');

  parser.push(sseChunk1, {
    onReasoningDelta: (acc) => reasoningEvents.push(acc),
    onContentDelta: (acc) => deltas.push(acc),
    onToolProgress: (ev) => tools.push(`${ev.toolName}:${ev.status}`),
  });

  const result = parser.finish();
  assert.equal(result.reasoning, 'Inspecting git status before editing.');
  assert.equal(result.content, 'Partial summary: 2 files changed.');
  assert.equal(result.finishReason, 'length');
  assert.equal(result.errorCode, 'iteration_budget_exhausted');
  assert.equal(result.outcome, 'iteration_budget_exhausted');
  assert.equal(result.sessionId, 's-1');
  assert.equal(result.sessionKey, 'k-1');
  assert.equal(result.admissionConflict, false);
  assert.deepEqual(tools, ['terminal:running']);
  assert.equal(reasoningEvents.length, 2);
  assert.equal(deltas.length, 2);
});

test('ChatCompletionsStreamParser detects streaming 409 admission_conflict and cancelled finish_reason', () => {
  const conflictParser = new ChatCompletionsStreamParser();
  conflictParser.push(
    [
      'data: {"choices":[{"delta":{},"finish_reason":"error"}],"error":{"message":"admission_conflict"}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')
  );
  const conflictRes = conflictParser.finish();
  assert.equal(conflictRes.outcome, 'admission_conflict');
  assert.equal(conflictRes.admissionConflict, true);

  const cancelledParser = new ChatCompletionsStreamParser();
  cancelledParser.push(
    'data: {"choices":[{"delta":{"content":"Stopped halfway"},"finish_reason":"cancelled"}]}\n\n'
  );
  const cancelRes = cancelledParser.finish();
  assert.equal(cancelRes.outcome, 'cancelled');
  assert.equal(cancelRes.content, 'Stopped halfway');

  const nonStream = parseChatCompletionsJson({
    choices: [
      {
        message: {
          content: 'Done.',
          reasoning_content: 'Thought through options.',
        },
        finish_reason: 'stop',
      },
    ],
  });
  assert.equal(nonStream?.reasoning, 'Thought through options.');
  assert.equal(nonStream?.outcome, 'completed');
});

test('SessionChatStreamParser handles assistant.delta, commentary, tool.started/completed/failed, and terminal run status', () => {
  const parser = new SessionChatStreamParser();
  const commentaries: string[] = [];
  const tools: string[] = [];
  const deltas: string[] = [];

  parser.push(
    [
      ': keepalive',
      '',
      'data: {"type":"assistant.commentary","message_id":"m1","text":"Checking repo files...","already_streamed":false}',
      '',
      'data: {"type":"tool.started","tool":"read_file","args_preview":"package.json"}',
      '',
      'data: {"type":"tool.failed","tool":"terminal","error":"exit code 1"}',
      '',
      'data: {"type":"assistant.delta","delta":"Build failed in test step."}',
      '',
      'data: {"type":"assistant.completed","partial":true,"interrupted":true}',
      '',
      'data: {"type":"run.cancelled"}',
      '',
    ].join('\n'),
    {
      onCommentary: (c) => commentaries.push(c.text),
      onToolEvent: (ev) => tools.push(`${ev.phase}:${ev.toolName}`),
      onDelta: (acc) => deltas.push(acc),
    }
  );

  const res = parser.finish();
  assert.equal(res.content, 'Build failed in test step.');
  assert.equal(res.outcome, 'cancelled');
  assert.equal(res.partial, true);
  assert.equal(res.interrupted, true);
  assert.deepEqual(commentaries, ['Checking repo files...']);
  assert.deepEqual(tools, ['started:read_file', 'failed:terminal']);
});

test('RunsEventStreamParser parses approval.request, reasoning, subagent events, and run outcomes', () => {
  const parser = new RunsEventStreamParser();
  const approvals: Array<{ requestId: string; executionGeneration: number; command?: string }> = [];
  const subagents: string[] = [];
  const reasoningChunks: string[] = [];

  parser.push(
    [
      ': keepalive',
      '',
      'event: message.reasoning',
      'data: {"type":"message.reasoning","delta":"Planning safe shell check."}',
      '',
      'event: tool.started',
      'data: {"type":"tool.started","tool":"terminal","preview":"rm -rf /tmp/demo"}',
      '',
      'event: approval.request',
      'data: {"type":"approval.request","request_id":"req_42","execution_generation":3,"tool":"terminal","command":"rm -rf /tmp/demo","choices":["once","always","deny"]}',
      '',
      'event: subagent.start',
      'data: {"type":"subagent.start","summary":"Check build cache","child_session_id":"child-9"}',
      '',
      'event: run.completed',
      'data: {"type":"run.completed","output":"Approved and completed cleanly.","runtime":{"provider":"openai","model":"gpt-5"}}',
      '',
    ].join('\n'),
    {
      onReasoningDelta: (acc) => reasoningChunks.push(acc),
      onApprovalRequest: (req) =>
        approvals.push({
          requestId: req.requestId,
          executionGeneration: req.executionGeneration,
          command: req.command,
        }),
      onSubagentStart: (s) => subagents.push(s.summary),
    }
  );

  const res = parser.finish();
  assert.equal(res.output, 'Approved and completed cleanly.');
  assert.equal(res.reasoning, 'Planning safe shell check.');
  assert.equal(res.outcome, 'completed');
  assert.equal(res.model, 'gpt-5');
  assert.deepEqual(approvals, [
    { requestId: 'req_42', executionGeneration: 3, command: 'rm -rf /tmp/demo' },
  ]);
  assert.deepEqual(subagents, ['Check build cache']);
  assert.equal(reasoningChunks.length, 1);
});

test('fetchWithConcurrentRetry retries HTTP 429 with backoff and preserves Idempotency-Key', async () => {
  let calls = 0;
  const delays: number[] = [];
  const seenKeys: string[] = [];
  const key = 'idem-fixed-123';

  const res = await fetchWithConcurrentRetry(
    async () => {
      calls += 1;
      seenKeys.push(key);
      if (calls < 3) {
        return new Response('Too many concurrent runs (max 2)', {
          status: 429,
          headers: calls === 1 ? { 'retry-after': '0' } : undefined,
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    },
    {
      maxRetries: 3,
      baseDelayMs: 80,
      sleep: async (ms) => {
        delays.push(ms);
      },
    }
  );

  assert.equal(calls, 3);
  assert.equal(res.status, 200);
  assert.deepEqual(seenKeys, [key, key, key]);
  assert.deepEqual(delays, [50, 160]);
});

test('Gateway payload mappers normalize skills, toolsets, jobs, sessions, messages, and model options', () => {
  const skills = mapGatewaySkills([
    { name: 'github-pr-workflow', description: 'Review & merge PRs', category: 'git' },
  ]);
  assert.equal(skills.length, 1);
  assert.equal(skills[0].name, 'github-pr-workflow');
  assert.equal(skills[0].source, 'category:git');

  const toolsets = mapGatewayToolsets([
    {
      name: 'core',
      label: 'Core Tools',
      description: 'File and terminal ops',
      enabled: true,
      configured: true,
      tools: ['read_file', 'terminal'],
    },
  ]);
  assert.equal(toolsets[0].tools.length, 2);

  const jobs = mapGatewayJobs([
    { id: 'job-1', schedule: '0 8 * * *', prompt: 'Summarize overnight runs', status: 'paused' },
  ]);
  assert.equal(jobs[0].paused, true);

  const sessions = mapGatewaySessions({
    sessions: [{ session_id: 'hermes-alpha', title: 'Alpha Build', source: 'api', message_count: 4 }],
  });
  assert.equal(sessions[0].id, 'hermes-alpha');
  assert.equal(sessions[0].title, 'Alpha Build');

  const messages = mapGatewaySessionMessages(
    {
      messages: [
        { id: 'u1', role: 'user', content: 'hi' },
        { id: 'a1', role: 'assistant', content: 'hello', reasoning_content: 'pondering greeting' },
      ],
    },
    'hermes-alpha'
  );
  assert.equal(messages.length, 2);
  assert.equal(messages[1].reasoning, 'pondering greeting');

  const modelOpts = extractModelOptions({
    selected: { provider: 'nous', model: 'hermes-4' },
    providers: [{ id: 'nous', label: 'Nous Portal', configured: true, models: ['hermes-4', 'hermes-4-mini'] }],
  });
  assert.equal(modelOpts.activeModel, 'hermes-4');
  assert.equal(modelOpts.activeProvider, 'nous');
  assert.deepEqual(modelOpts.models, ['hermes-4', 'hermes-4-mini']);
});
