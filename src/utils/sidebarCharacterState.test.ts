import test from 'node:test';
import assert from 'node:assert/strict';
import type { ApprovalCard, BackgroundTask, HermesGatewayStatus } from '../types/hermes';
import {
  computeSidebarPointerLookTarget,
  deriveSidebarCharacterState,
  type SidebarCharacterInput,
} from './sidebarCharacterState';

function makeTask(overrides: Partial<BackgroundTask> = {}): BackgroundTask {
  return {
    id: 'task-1',
    channelId: 'alpha',
    title: 'Run security audit across gateway routes',
    status: 'running',
    progress: 45,
    lastStep: 'Scanning /api/hermes handlers',
    steps: [
      { text: 'Inspect routes', done: true },
      { text: 'Scanning /api/hermes handlers', done: false, active: true },
      { text: 'Write summary', done: false },
    ],
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_015_000,
    updatedAt: 'live',
    ...overrides,
  };
}

function makeApproval(overrides: Partial<ApprovalCard> = {}): ApprovalCard {
  return {
    id: 'app-1',
    channelId: 'alpha',
    title: 'Approve shell command rm -rf .cache',
    actionType: 'tool',
    destination: 'local-shell',
    summary: 'Clear stale build cache',
    draft: 'rm -rf .cache',
    status: 'pending',
    createdAt: 'just now',
    ...overrides,
  };
}

const ONLINE_GATEWAY: HermesGatewayStatus = {
  connected: true,
  mode: 'hermes-gateway',
  gatewayUrl: 'http://localhost:8080',
  profile: 'agentis',
  activeModel: 'hermes-agent',
  models: ['hermes-agent'],
  sessionHeader: 'x-session-id',
  skillsCount: 4,
  toolsets: [],
};

const BASE_INPUT: SidebarCharacterInput = {
  tasks: [],
  approvals: [],
  thinkingByChannel: {},
  hermesSessions: [],
  activeChannel: 'alpha',
  homeSessionDraft: false,
  baseMood: 'happy',
  isSpeaking: false,
  isListening: false,
  inputLevel: 0,
  outputLevel: 0,
  frequencyBands: [0, 0, 0, 0],
  tick: 0,
  gatewayStatus: ONLINE_GATEWAY,
  lastSpokenLine: 'Standby',
};

test('deriveSidebarCharacterState enters happy idle online state with gentle animation energy', () => {
  const snap = deriveSidebarCharacterState(BASE_INPUT);
  assert.equal(snap.mode, 'idle');
  assert.equal(snap.mood, 'happy');
  assert.equal(snap.viseme, 'smile');
  assert.equal(snap.tone, 'emerald');
  assert.equal(snap.statusLabel, 'online');
  assert.equal(snap.gatewayLine, 'hermes-agent · agentis');
  assert.ok(snap.energy > 0.1);
  assert.equal(snap.activeTask, null);
});

test('deriveSidebarCharacterState reacts to running tasks even from another channel or draft home view', () => {
  const snap = deriveSidebarCharacterState({
    ...BASE_INPUT,
    activeChannel: '',
    homeSessionDraft: true,
    tasks: [
      makeTask({
        id: 't-bg',
        channelId: 'deploy-ops',
        title: 'Deploy staging preview',
        lastStep: 'Building docker bundle',
      }),
      makeTask({
        id: 't-bg-2',
        channelId: 'qa-lane',
        title: 'Verify regression suite',
        updatedAtMs: 1_700_000_020_000,
      }),
    ],
    thinkingByChannel: {
      'deploy-ops': true, // Already counted via task t-bg (must not double-count)
      research: true, // Extra thinking channel without an explicit task row
    },
  });

  assert.equal(snap.mode, 'working');
  assert.equal(snap.mood, 'thinking');
  assert.equal(snap.eyeState, 'side');
  assert.equal(snap.tone, 'amber');
  assert.equal(snap.pulseState, 'thinking');
  assert.equal(snap.runningTaskCount, 3);
  assert.equal(snap.statusLabel, '3 working');
  assert.ok(snap.energy >= 0.6);
  assert.ok(snap.activeTask);
  assert.equal(snap.activeTask.id, 't-bg-2');
});

test('deriveSidebarCharacterState prefers active channel task when not on draft and surfaces progress cleanly', () => {
  const snap = deriveSidebarCharacterState({
    ...BASE_INPUT,
    activeChannel: 'alpha',
    homeSessionDraft: false,
    tasks: [
      makeTask({ id: 't-other', channelId: 'other', updatedAtMs: 1_700_000_099_000 }),
      makeTask({ id: 't-alpha', channelId: 'alpha', updatedAtMs: 1_700_000_010_000 }),
    ],
  });

  assert.equal(snap.mode, 'working');
  assert.equal(snap.activeTask?.id, 't-alpha');
  assert.equal(snap.activeTask?.stepText, 'Scanning /api/hermes handlers');
  assert.equal(snap.activeTask?.ratioLabel, '1/3');
  assert.equal(snap.activeTask?.progressPct, 33);
});

test('deriveSidebarCharacterState prioritizes speaking and listening with live viseme & energy', () => {
  const speakingSnap = deriveSidebarCharacterState({
    ...BASE_INPUT,
    tasks: [makeTask()],
    isSpeaking: true,
    outputLevel: 0.78,
    frequencyBands: [0.6, 0.85, 0.72, 0.4],
    tick: 3,
    lastSpokenLine: 'All tests are passing now.',
  });

  assert.equal(speakingSnap.mode, 'speaking');
  assert.equal(speakingSnap.mood, 'speaking');
  assert.equal(speakingSnap.tone, 'emerald');
  assert.equal(speakingSnap.statusLabel, 'speaking');
  assert.notEqual(speakingSnap.viseme, 'closed');
  assert.ok(speakingSnap.energy >= 0.7);
  assert.ok(speakingSnap.activeTask);

  const listeningSnap = deriveSidebarCharacterState({
    ...BASE_INPUT,
    isListening: true,
    inputLevel: 0.42,
  });
  assert.equal(listeningSnap.mode, 'listening');
  assert.equal(listeningSnap.mood, 'listening');
  assert.equal(listeningSnap.statusLabel, 'listening');
  assert.equal(listeningSnap.viseme, 'rest');
});

test('deriveSidebarCharacterState surfaces pending approval attention and offline gateway states', () => {
  const attentionSnap = deriveSidebarCharacterState({
    ...BASE_INPUT,
    approvals: [makeApproval()],
  });
  assert.equal(attentionSnap.mode, 'attention');
  assert.equal(attentionSnap.mood, 'alert');
  assert.equal(attentionSnap.eyeState, 'wide');
  assert.equal(attentionSnap.pulseState, 'waiting');
  assert.equal(attentionSnap.statusLabel, '1 approval');
  assert.equal(attentionSnap.topApproval?.title, 'Approve shell command rm -rf .cache');

  const offlineSnap = deriveSidebarCharacterState({
    ...BASE_INPUT,
    gatewayStatus: { ...ONLINE_GATEWAY, connected: false },
  });
  assert.equal(offlineSnap.mode, 'offline');
  assert.equal(offlineSnap.tone, 'rose');
  assert.equal(offlineSnap.pulseState, 'error');
  assert.equal(offlineSnap.statusLabel, 'offline');
});

test('computeSidebarPointerLookTarget normalizes pointer gaze relative to sidebar avatar', () => {
  const rightLook = computeSidebarPointerLookTarget(
    { left: 12, top: 60, width: 270, height: 84 },
    260,
    90
  );
  assert.ok(rightLook.x > 0.6 && rightLook.x <= 1);
  assert.ok(Math.abs(rightLook.y) <= 1);
});
