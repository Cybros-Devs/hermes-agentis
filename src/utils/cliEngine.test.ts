import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ApprovalCard,
  BackgroundTask,
  HermesCronJob,
  HermesSkill,
  HermesToolset,
} from '../types/hermes';
import { executeCliInput } from './cliEngine';

const TEST_APPROVALS: ApprovalCard[] = [
  {
    id: 'approval-run_9-req_1',
    channelId: 'general',
    title: 'Run shell command',
    actionType: 'send_message',
    kind: 'approval',
    mcpTool: 'terminal',
    runId: 'run_9',
    requestId: 'req_1',
    executionGeneration: 2,
    choices: ['once', 'always', 'deny'],
    command: 'rm -rf /tmp/build-cache',
    destination: 'hermes-gateway',
    summary: 'Clear build cache directory',
    draft: 'rm -rf /tmp/build-cache',
    status: 'pending',
    createdAt: '10:00',
  },
];

const TEST_TASKS: BackgroundTask[] = [
  {
    id: 'task-turn-1',
    channelId: 'general',
    sessionId: 'hermes-general',
    runId: 'run_9',
    title: 'Inspect CI logs',
    status: 'running',
    progress: 50,
    lastStep: 'Running terminal',
    updatedAt: '10:00',
  },
];

const TEST_SKILLS: HermesSkill[] = [
  {
    name: 'github-pr-workflow',
    source: 'category:git',
    summary: 'Inspect and manage GitHub PR checks',
    enabled: true,
  },
];

const TEST_TOOLSETS: HermesToolset[] = [
  {
    name: 'core',
    label: 'Core Tools',
    description: 'File and terminal execution',
    enabled: true,
    configured: true,
    tools: ['read_file', 'terminal'],
  },
];

const TEST_CRON: HermesCronJob[] = [
  {
    id: 'job-daily-1',
    name: 'Morning check',
    schedule: '0 8 * * *',
    mode: 'agent',
    status: 'active',
    paused: false,
    enabled: true,
    summary: 'Summarize overnight runs',
    channelId: 'ops',
  },
];

const baseCtx = {
  activeChannel: 'general' as const,
  availableChannels: ['general', 'ops'],
  approvals: TEST_APPROVALS,
  tasks: TEST_TASKS,
  brief: [],
  isMuted: false,
  skills: TEST_SKILLS,
  toolsets: TEST_TOOLSETS,
  cronJobs: TEST_CRON,
  gatewayConnected: true,
  gatewayUrl: 'http://127.0.0.1:8642',
  activeModel: 'nous/hermes-4',
  gatewayProfile: 'default',
  routePrefix: '',
  healthStatus: 'ok',
  sessionKeyHeader: 'X-Hermes-Session-Key',
  capabilities: {
    object: 'hermes.api_server.capabilities',
    platform: 'hermes-agent',
    model: 'nous/hermes-4',
    sessionKeyHeader: 'X-Hermes-Session-Key',
    features: {
      chat_completions: true,
      reasoning_streaming: true,
      run_submission: true,
      run_events_sse: true,
      run_approval: true,
      session_chat_stream: true,
    },
  },
  transportMode: 'auto' as const,
  resolvedTransport: 'runs' as const,
};

test('executeCliInput routes natural language prompts to chat', () => {
  const res = executeCliInput('Summarize my morning brief', baseCtx);
  assert.equal(res.type, 'chat');
  if (res.type === 'chat') {
    assert.equal(res.prompt, 'Summarize my morning brief');
  }
});

test('executeCliInput handles /switch, /resume, and validates synced sessions', () => {
  const ok = executeCliInput('/switch ops', baseCtx);
  assert.equal(ok.type, 'handled');
  if (ok.type === 'handled') {
    assert.equal(ok.switchChannel, 'ops');
  }

  const resume = executeCliInput('/resume hermes-ops', baseCtx);
  assert.equal(resume.type, 'handled');
  if (resume.type === 'handled') {
    assert.equal(resume.switchChannel, 'ops');
  }

  const bad = executeCliInput('/switch invalid-room', baseCtx);
  assert.equal(bad.type, 'handled');
  if (bad.type === 'handled') {
    assert.equal(bad.mood, 'alert');
    assert.equal(bad.switchChannel, undefined);
  }
});

test('executeCliInput approves pending run card with once, always, deny, and /reject', () => {
  const once = executeCliInput('/approve approval-run_9-req_1', baseCtx);
  assert.equal(once.type, 'handled');
  if (once.type === 'handled') {
    assert.equal(once.approveCardId, 'approval-run_9-req_1');
    assert.equal(once.approveChoice, 'once');
    assert.equal(once.mood, 'happy');
  }

  const always = executeCliInput('/approve req_1 always', baseCtx);
  assert.equal(always.type, 'handled');
  if (always.type === 'handled') {
    assert.equal(always.approveCardId, 'approval-run_9-req_1');
    assert.equal(always.approveChoice, 'always');
  }

  const deny = executeCliInput('/reject approval-run_9-req_1', baseCtx);
  assert.equal(deny.type, 'handled');
  if (deny.type === 'handled') {
    assert.equal(deny.rejectCardId, 'approval-run_9-req_1');
    assert.equal(deny.approveChoice, 'deny');
  }
});

test('executeCliInput handles /shader modes including holo, norm, and invalid input', () => {
  const holo = executeCliInput('/shader holo', baseCtx);
  assert.equal(holo.type, 'handled');
  if (holo.type === 'handled') {
    assert.equal(holo.setShader, 'holo');
    assert.equal(holo.mood, 'focused');
  }

  const norm = executeCliInput('/shader norm', baseCtx);
  assert.equal(norm.type, 'handled');
  if (norm.type === 'handled') {
    assert.equal(norm.setShader, 'norm');
    assert.equal(norm.mood, 'focused');
  }

  const bad = executeCliInput('/shader invalid', baseCtx);
  assert.equal(bad.type, 'handled');
  if (bad.type === 'handled') {
    assert.equal(bad.setShader, undefined);
    assert.equal(bad.mood, 'alert');
  }
});

test('executeCliInput handles /style halftone dither modes', () => {
  const braille = executeCliInput('/style braille', baseCtx);
  assert.equal(braille.type, 'handled');
  if (braille.type === 'handled') {
    assert.equal(braille.setDitherStyle, 'braille');
    assert.equal(braille.mood, 'focused');
  }

  const invalid = executeCliInput('/style nope', baseCtx);
  assert.equal(invalid.type, 'handled');
  if (invalid.type === 'handled') {
    assert.equal(invalid.setDitherStyle, undefined);
    assert.equal(invalid.mood, 'alert');
  }
});

test('executeCliInput handles real Hermes Gateway /skills, /toolsets, /memory, /cron, /gateway, /transport, /stop, and offline states', () => {
  const skills = executeCliInput('/skills', baseCtx);
  assert.equal(skills.type, 'handled');
  if (skills.type === 'handled') {
    assert.match(skills.output, /github-pr-workflow/);
    assert.match(skills.output, /GET \/v1\/skills/);
  }

  const toolsets = executeCliInput('/toolsets', baseCtx);
  assert.equal(toolsets.type, 'handled');
  if (toolsets.type === 'handled') {
    assert.match(toolsets.output, /Core Tools/);
    assert.match(toolsets.output, /read_file, terminal/);
  }

  const mem = executeCliInput('/memory', baseCtx);
  assert.equal(mem.type, 'handled');
  if (mem.type === 'handled') {
    assert.match(mem.output, /X-Hermes-Session-Id/);
    assert.match(mem.output, /X-Hermes-Session-Key/);
  }

  const cron = executeCliInput('/cron', baseCtx);
  assert.equal(cron.type, 'handled');
  if (cron.type === 'handled') {
    assert.match(cron.output, /GET \/api\/jobs/);
    assert.match(cron.output, /Summarize overnight runs/);
  }

  const gw = executeCliInput('/gateway', baseCtx);
  assert.equal(gw.type, 'handled');
  if (gw.type === 'handled') {
    assert.match(gw.output, /GET \/v1\/capabilities/);
    assert.match(gw.output, /GET \/api\/model\/options/);
    assert.match(gw.output, /nous\/hermes-4/);
  }

  const transport = executeCliInput('/transport session-stream', baseCtx);
  assert.equal(transport.type, 'handled');
  if (transport.type === 'handled') {
    assert.equal(transport.setTransportMode, 'session_stream');
  }

  const stop = executeCliInput('/stop', baseCtx);
  assert.equal(stop.type, 'handled');
  if (stop.type === 'handled') {
    assert.equal(stop.cancelActiveRun, true);
  }

  const offlineSkills = executeCliInput('/skills', {
    ...baseCtx,
    skills: [],
    gatewayConnected: false,
    gatewayError: 'ECONNREFUSED',
  });
  assert.equal(offlineSkills.type, 'handled');
  if (offlineSkills.type === 'handled') {
    assert.equal(offlineSkills.mood, 'alert');
    assert.match(offlineSkills.output, /Gateway offline/i);
  }
});

test('executeCliInput handles /ui presets, natural arguments, reset, and /customize', () => {
  const studio = executeCliInput('/customize', baseCtx);
  assert.equal(studio.type, 'handled');
  if (studio.type === 'handled') {
    assert.equal(studio.uiPatch?.openCustomizer, true);
  }

  const preset = executeCliInput('/ui cyber-violet', baseCtx);
  assert.equal(preset.type, 'handled');
  if (preset.type === 'handled') {
    assert.equal(preset.uiPatch?.presetId, 'cyber-violet');
  }

  const natural = executeCliInput('/ui amber mono sharp right sidebar', baseCtx);
  assert.equal(natural.type, 'handled');
  if (natural.type === 'handled') {
    assert.equal(natural.uiPatch?.accentPreset, 'amber');
    assert.equal(natural.uiPatch?.fontPreset, 'mono');
    assert.equal(natural.uiPatch?.cornerRadius, 'sharp');
    assert.equal(natural.uiPatch?.sidebarPosition, 'right');
  }

  const reset = executeCliInput('/ui reset', baseCtx);
  assert.equal(reset.type, 'handled');
  if (reset.type === 'handled') {
    assert.equal(reset.uiPatch?.resetAll, true);
  }
});
