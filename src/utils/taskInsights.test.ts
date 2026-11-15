import test from 'node:test';
import assert from 'node:assert/strict';
import type { BackgroundTask } from '../types/hermes';
import {
  formatElapsedDuration,
  formatStartClock,
  getTaskConfirmationLabel,
  getTaskConfirmationState,
  getTaskKindLabel,
  getTaskStatusDisplay,
  partitionChannelTasks,
  resolveTaskProgress,
  resolveTaskStepBreakdown,
  summarizeChannelTaskActivity,
} from './taskInsights';

const SAMPLE_TASKS: BackgroundTask[] = [
  {
    id: 'task-101',
    channelId: 'launch',
    sessionId: 'duet-run-409',
    kind: 'Background',
    background: true,
    title: 'Rebuild standing morning-brief.html (save_page)',
    status: 'running',
    progress: 67,
    progressLabel: '4/6',
    lastStep: 'Streaming update_task delta across Playwright parity lane',
    createdAtMs: 1_700_000_000_000,
    updatedAtMs: 1_700_000_240_000,
    updatedAt: '14:21',
    steps: [
      { text: 'Collect changed thread summaries', done: true },
      { text: 'Render static morning-brief.html template', done: true },
      { text: 'Run desktop viewport diff', done: true },
      { text: 'Run mobile viewport parity check', done: true },
      { text: 'Streaming update_task delta across Playwright parity lane', done: false, active: true },
      { text: 'Publish final save_page artifact', done: false },
    ],
  },
  {
    id: 'task-102',
    channelId: 'research',
    title: 'Index ~/.hermes/skills/ & MCP connectors',
    status: 'completed',
    rawStatus: 'done',
    progress: 100,
    lastStep: 'Synced 4 skills',
    agentDoneAtMs: 1_699_999_900_000,
    createdAtMs: 1_699_999_000_000,
    updatedAtMs: 1_699_999_900_000,
    updatedAt: '13:45',
    steps: [
      { text: 'Scan ~/.hermes/skills/', done: true },
      { text: 'Verify mcp_servers.duet manifest', done: true },
    ],
  },
  {
    id: 'task-103',
    channelId: 'ops',
    title: 'Audit ~/Downloads watcher rule',
    status: 'paused',
    rawStatus: 'waiting',
    progress: 40,
    lastStep: 'Waiting on confirmation',
    createdAtMs: 1_699_999_500_000,
    updatedAtMs: 1_699_999_700_000,
    updatedAt: '12:10',
  },
];

test('formatElapsedDuration formats seconds, minutes, hours, and handles bounds', () => {
  const base = 1_700_000_000_000;
  assert.equal(formatElapsedDuration(base, base + 42_000), '42s');
  assert.equal(formatElapsedDuration(base, base + (14 * 60 + 8) * 1000), '14m 08s');
  assert.equal(formatElapsedDuration(base, base + (67 * 60) * 1000), '1h 07m');
  assert.equal(formatElapsedDuration(base, base - 5000), '0s');
  assert.equal(formatElapsedDuration(undefined, base), '0s');
});

test('formatStartClock returns HH:MM string or empty when missing', () => {
  assert.equal(formatStartClock(undefined), '');
  assert.match(formatStartClock(1_700_000_000_000), /^\d{2}:\d{2}$/);
});

test('resolveTaskStepBreakdown marks completed, single active, and pending steps accurately', () => {
  const breakdown = resolveTaskStepBreakdown(SAMPLE_TASKS[0]);
  assert.equal(breakdown.completedCount, 4);
  assert.equal(breakdown.totalCount, 6);
  assert.equal(breakdown.ratioLabel, '4/6');
  assert.equal(
    breakdown.activeStepText,
    'Streaming update_task delta across Playwright parity lane'
  );
  assert.equal(breakdown.steps[3]?.state, 'done');
  assert.equal(breakdown.steps[4]?.state, 'active');
  assert.equal(breakdown.steps[5]?.state, 'pending');

  const doneBreakdown = resolveTaskStepBreakdown(SAMPLE_TASKS[1]);
  assert.equal(doneBreakdown.completedCount, 2);
  assert.equal(doneBreakdown.totalCount, 2);
  assert.ok(doneBreakdown.steps.every((s) => s.state === 'done'));

  const fallbackBreakdown = resolveTaskStepBreakdown({
    id: 't-x',
    channelId: 'general',
    title: 'Quick job',
    status: 'running',
    progress: 0,
    progressLabel: '0/6',
    lastStep: 'Reproduce mute bug',
    updatedAt: '13:31',
  });
  assert.equal(fallbackBreakdown.ratioLabel, '0/6');
  assert.equal(fallbackBreakdown.totalCount, 6);
  assert.equal(fallbackBreakdown.steps[0]?.state, 'active');
});

test('partitionChannelTasks strictly isolates tasks to their owning thread and orders unconfirmed first', () => {
  const launch = partitionChannelTasks(SAMPLE_TASKS, 'launch');
  assert.equal(launch.running.length, 1);
  assert.equal(launch.paused.length, 0);
  assert.equal(launch.completed.length, 0);
  assert.equal(launch.all[0]?.id, 'task-101');

  const general = partitionChannelTasks(SAMPLE_TASKS, 'general');
  assert.equal(general.all.length, 0);

  const ops = partitionChannelTasks(SAMPLE_TASKS, 'ops');
  assert.equal(ops.paused.length, 1);
  assert.equal(ops.paused[0]?.id, 'task-103');

  const confirmedOlder: BackgroundTask = {
    ...SAMPLE_TASKS[1],
    id: 'task-confirmed',
    confirmedAtMs: 1_700_000_500_000,
    updatedAtMs: 1_700_000_500_000,
  };
  const researchOrdered = partitionChannelTasks([confirmedOlder, SAMPLE_TASKS[1]], 'research');
  assert.equal(researchOrdered.completed[0]?.id, 'task-102');
  assert.equal(researchOrdered.completed[1]?.id, 'task-confirmed');
});

test('summarizeChannelTaskActivity highlights active threads for sidebar indicators', () => {
  const summary = summarizeChannelTaskActivity(
    SAMPLE_TASKS,
    [{ id: 'general' }, { id: 'launch' }, { id: 'ops' }, { id: 'research' }],
    { general: true }
  );

  assert.equal(summary.launch.runningCount, 1);
  assert.equal(summary.launch.hasActiveTask, true);
  assert.equal(summary.launch.primaryTitle, 'Rebuild standing morning-brief.html (save_page)');

  assert.equal(summary.general.runningCount, 0);
  assert.equal(summary.general.isThinking, true);
  assert.equal(summary.general.hasActiveTask, true);

  assert.equal(summary.ops.runningCount, 0);
  assert.equal(summary.ops.pausedCount, 1);
  assert.equal(summary.ops.hasActiveTask, false);

  assert.equal(summary.research.completedCount, 1);
  assert.equal(summary.research.hasActiveTask, false);
});

test('getTaskStatusDisplay and confirmation helpers align with hermes-duet semantics', () => {
  assert.equal(getTaskStatusDisplay(SAMPLE_TASKS[0]).label, 'Working');
  assert.equal(
    getTaskStatusDisplay({ ...SAMPLE_TASKS[0], rawStatus: 'queued' }).label,
    'Queued'
  );
  assert.equal(getTaskStatusDisplay(SAMPLE_TASKS[2]).label, 'Waiting');
  assert.equal(getTaskStatusDisplay({ ...SAMPLE_TASKS[2], rawStatus: 'paused' }).label, 'Paused');
  assert.equal(getTaskStatusDisplay(SAMPLE_TASKS[1]).label, 'Done');
  assert.equal(getTaskStatusDisplay({ ...SAMPLE_TASKS[1], rawStatus: 'failed' }).label, 'Failed');
  assert.equal(
    getTaskStatusDisplay({ ...SAMPLE_TASKS[1], rawStatus: 'cancelled' }).label,
    'Cancelled'
  );

  assert.equal(getTaskKindLabel(SAMPLE_TASKS[0]), 'Background');
  assert.equal(getTaskKindLabel({ ...SAMPLE_TASKS[0], background: false }), 'In chat');

  assert.equal(getTaskConfirmationState(SAMPLE_TASKS[0]), 'open');
  assert.equal(getTaskConfirmationLabel(SAMPLE_TASKS[0]), 'Open');

  assert.equal(getTaskConfirmationState(SAMPLE_TASKS[1]), 'needs-confirm');
  assert.equal(getTaskConfirmationLabel(SAMPLE_TASKS[1]), 'Looks done — confirm');

  assert.equal(
    getTaskConfirmationState({ ...SAMPLE_TASKS[1], confirmedAtMs: 1_700_000_000_000 }),
    'confirmed'
  );
  assert.equal(
    getTaskConfirmationLabel({ ...SAMPLE_TASKS[1], confirmedAtMs: 1_700_000_000_000 }),
    'Confirmed by you'
  );
});

test('resolveTaskProgress computes step percentages, 100% completion, and indeterminate running state', () => {
  assert.deepEqual(resolveTaskProgress(SAMPLE_TASKS[0]), {
    pct: 67,
    ratioLabel: '4/6',
    isIndeterminate: false,
  });

  assert.deepEqual(resolveTaskProgress(SAMPLE_TASKS[1]), {
    pct: 100,
    ratioLabel: '2/2',
    isIndeterminate: false,
  });

  assert.deepEqual(resolveTaskProgress(SAMPLE_TASKS[2]), {
    pct: 40,
    ratioLabel: '40%',
    isIndeterminate: false,
  });

  const zeroRunning: BackgroundTask = {
    id: 't-zero',
    channelId: 'general',
    title: 'Starting task',
    status: 'running',
    progress: 0,
    progressLabel: '0/4',
    lastStep: 'Initializing runner',
    updatedAt: '15:00',
  };
  assert.deepEqual(resolveTaskProgress(zeroRunning), {
    pct: 0,
    ratioLabel: '0/4',
    isIndeterminate: true,
  });

  const failedPartial: BackgroundTask = {
    ...SAMPLE_TASKS[0],
    status: 'completed',
    rawStatus: 'failed',
    progress: 50,
  };
  assert.equal(resolveTaskProgress(failedPartial).pct, 67);
});
