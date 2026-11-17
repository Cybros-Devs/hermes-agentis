import test from 'node:test';
import assert from 'node:assert/strict';
import type { BackgroundTask, HermesAgentSession, TerminalEntry } from '../types/hermes';
import {
  applyStreamingDeltaToSteps,
  applyToolProgressToSteps,
  dedupeActivityEntries,
  deriveTurnTaskTitle,
  finalizeTurnTaskSteps,
  formatElapsedDuration,
  formatStartClock,
  formatTaskOutcomeSnippet,
  getTaskConfirmationLabel,
  getTaskConfirmationState,
  getTaskKindLabel,
  getTaskStatusDisplay,
  isTaskInitiallyExpanded,
  mergeTasksWithSessionActivity,
  partitionChannelTasks,
  resolveTaskDisplayTitle,
  resolveTaskProgress,
  resolveTaskStepBreakdown,
  summarizeChannelTaskActivity,
  summarizeThreadTaskAggregate,
  summarizeThreadTasks,
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

test('turn task lifecycle helpers derive clean titles and transition tool/streaming/final steps', () => {
  assert.equal(
    deriveTurnTaskTitle('https://github.com/Dev/hermes-agentis check git log'),
    'github.com/Dev/hermes-agentis check git log'
  );
  assert.equal(deriveTurnTaskTitle('   ', '#https-github-com'), '#https-github-com');

  const initial = [{ text: 'Working in hermes-https-github-com', done: false, active: true }];
  const afterRead = applyToolProgressToSteps(initial, {
    toolName: 'read_file',
    status: 'running',
    summary: 'Running read_file',
  });
  assert.equal(afterRead.progress, '1/2');
  assert.equal(afterRead.steps[0]?.done, true);
  assert.equal(afterRead.steps[1]?.text, 'Running read_file');
  assert.equal(afterRead.steps[1]?.active, true);

  const afterTermRunning = applyToolProgressToSteps(afterRead.steps, {
    toolName: 'terminal',
    status: 'running',
    summary: 'Running terminal',
  });
  assert.equal(afterTermRunning.steps.length, 3);
  assert.equal(afterTermRunning.steps[1]?.done, true);
  assert.equal(afterTermRunning.steps[2]?.active, true);

  const afterTerm = applyToolProgressToSteps(afterTermRunning.steps, {
    toolName: 'terminal',
    status: 'done',
    summary: 'terminal: git log --oneline -3 main',
  });
  assert.equal(afterTerm.steps.length, 3);
  assert.equal(afterTerm.steps[2]?.done, true);
  assert.equal(afterTerm.steps[2]?.text, 'terminal: git log --oneline -3 main');

  const streaming = applyStreamingDeltaToSteps(afterTerm.steps);
  assert.equal(streaming.changed, true);
  assert.equal(streaming.steps[streaming.steps.length - 1]?.text, 'Composing response');

  const settled = finalizeTurnTaskSteps(streaming.steps, 'done', 'Completed response');
  assert.equal(settled.progress, `${settled.steps.length}/${settled.steps.length}`);
  assert.ok(settled.steps.every((s) => s.done && !s.active));

  const cancelled = finalizeTurnTaskSteps(afterRead.steps, 'cancelled', 'Stopped by operator');
  assert.equal(cancelled.steps[cancelled.steps.length - 1]?.text, 'Stopped by operator');
});

test('mergeTasksWithSessionActivity surfaces running and tool-trace tasks on dynamic threads', () => {
  const entries: TerminalEntry[] = [
    {
      id: 'u-1',
      channelId: 'https-github-com',
      role: 'user',
      source: 'voice',
      text: 'https://github.com/Dev/demo scrub repo and make public',
      timestamp: '19:17',
      createdAtMs: 1_700_000_000_000,
    },
    {
      id: 'h-1',
      channelId: 'https-github-com',
      role: 'hermes',
      source: 'ui',
      text: 'On it — surveying the repo first.',
      streaming: false,
      timestamp: '19:17',
      createdAtMs: 1_700_000_005_000,
    },
    {
      id: 'a-1',
      channelId: 'https-github-com',
      role: 'activity',
      source: 'ui',
      text: 'Running read_file',
      activityStatus: 'running',
      timestamp: '19:19',
      createdAtMs: 1_700_000_120_000,
    },
    {
      id: 'a-2',
      channelId: 'https-github-com',
      role: 'activity',
      source: 'ui',
      text: 'terminal: git log --oneline -3 main',
      activityStatus: 'done',
      timestamp: '19:19',
      createdAtMs: 1_700_000_125_000,
    },
    {
      id: 'a-3',
      channelId: 'https-github-com',
      role: 'activity',
      source: 'ui',
      text: 'Running terminal',
      activityStatus: 'running',
      timestamp: '19:19',
      createdAtMs: 1_700_000_130_000,
    },
  ];

  const merged = mergeTasksWithSessionActivity({
    tasks: SAMPLE_TASKS,
    entries,
    sessions: [
      {
        sessionId: 'hermes-https-github-com',
        channelId: 'https-github-com',
        name: 'https-github-com',
        persona: 'Dynamic thread',
        topic: 'github.com/Dev/demo',
        status: 'idle',
        turnCount: 1,
        updatedAtMs: 1_700_000_130_000,
      },
    ],
    thinkingByChannel: {},
  });

  const dynamicPartition = partitionChannelTasks(merged, 'https-github-com');
  assert.equal(dynamicPartition.running.length, 1);
  assert.equal(dynamicPartition.running[0]?.id, 'live-turn-https-github-com');
  assert.equal(dynamicPartition.running[0]?.steps?.length, 3);
  assert.equal(dynamicPartition.running[0]?.steps?.[2]?.text, 'Running terminal');
  assert.equal(dynamicPartition.running[0]?.steps?.[2]?.active, true);

  // Never duplicates when an explicit running task already exists for the channel
  const launchSessions: HermesAgentSession[] = [
    {
      sessionId: 'hermes-launch',
      channelId: 'launch',
      name: 'launch',
      persona: 'Launch',
      topic: 'Launch lane',
      status: 'running',
      turnCount: 1,
      updatedAtMs: 1_700_000_240_000,
    },
  ];
  const noDuplicate = mergeTasksWithSessionActivity({
    tasks: SAMPLE_TASKS,
    entries: [],
    sessions: launchSessions,
    thinkingByChannel: { launch: true },
  });
  assert.equal(partitionChannelTasks(noDuplicate, 'launch').running.length, 1);

  // Completed tool trace on a thread with no server task surfaces as a completed task
  const completedEntries: TerminalEntry[] = [
    entries[0],
    {
      ...entries[2],
      text: 'terminal: git status',
      activityStatus: 'done',
    },
    {
      ...entries[1],
      createdAtMs: 1_700_000_140_000,
    },
  ];
  const withTraceTask = mergeTasksWithSessionActivity({
    tasks: SAMPLE_TASKS,
    entries: completedEntries,
    confirmedTaskIds: new Set(['trace-turn-https-github-com']),
  });
  const completedPartition = partitionChannelTasks(withTraceTask, 'https-github-com');
  assert.equal(completedPartition.completed.length, 1);
  assert.equal(completedPartition.completed[0]?.id, 'trace-turn-https-github-com');
  assert.ok(completedPartition.completed[0]?.confirmedAtMs);
});

test('summarizeThreadTasks and isTaskInitiallyExpanded compute right sidebar headers and default expansion', () => {
  const launchPartition = partitionChannelTasks(SAMPLE_TASKS, 'launch');
  const launchSummary = summarizeThreadTasks(launchPartition, false);
  assert.equal(launchSummary.totalCount, 1);
  assert.equal(launchSummary.runningCount, 1);
  assert.equal(launchSummary.headerBadge, '1 active');

  assert.equal(isTaskInitiallyExpanded(SAMPLE_TASKS[0], 'task-101', true), true);
  assert.equal(isTaskInitiallyExpanded(SAMPLE_TASKS[0], 'task-101', false), false);
  assert.equal(isTaskInitiallyExpanded(SAMPLE_TASKS[1], 'task-101', true), false);

  const researchPartition = partitionChannelTasks(SAMPLE_TASKS, 'research');
  const researchSummary = summarizeThreadTasks(researchPartition, false);
  assert.equal(researchSummary.totalCount, 1);
  assert.equal(researchSummary.needsConfirmCount, 1);
  assert.equal(researchSummary.headerBadge, '1 to confirm');

  const emptyPartition = partitionChannelTasks(SAMPLE_TASKS, 'general');
  assert.equal(summarizeThreadTasks(emptyPartition, true).headerBadge, '1 active');
  assert.equal(summarizeThreadTasks(emptyPartition, false).totalCount, 0);
  assert.equal(summarizeThreadTasks(emptyPartition, false).headerBadge, '');
});

test('dedupeActivityEntries and applyToolProgressToSteps collapse duplicate Running+<tool> placeholders', () => {
  const duped: TerminalEntry[] = [
    {
      id: 'd1',
      channelId: 'general',
      role: 'activity',
      source: 'ui',
      text: 'Running read_file',
      activityStatus: 'running',
      timestamp: '21:09',
    },
    {
      id: 'd2',
      channelId: 'general',
      role: 'activity',
      source: 'ui',
      text: 'read_file: ci-workflows.test.ts L40-119',
      activityStatus: 'done',
      timestamp: '21:09',
    },
    {
      id: 'd3',
      channelId: 'general',
      role: 'activity',
      source: 'ui',
      text: 'Running terminal',
      activityStatus: 'running',
      timestamp: '21:10',
    },
    {
      id: 'd4',
      channelId: 'general',
      role: 'activity',
      source: 'ui',
      text: 'terminal: gh pr checks 392',
      activityStatus: 'running',
      timestamp: '21:10',
    },
  ];
  const deduped = dedupeActivityEntries(duped);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0]?.text, 'read_file: ci-workflows.test.ts L40-119');
  assert.equal(deduped[1]?.text, 'terminal: gh pr checks 392');

  // applyToolProgressToSteps upgrades Running <tool> in-place when detailed summary arrives
  const s1 = applyToolProgressToSteps([{ text: 'Working in hermes-general', done: false, active: true }], {
    toolName: 'terminal',
    status: 'running',
    summary: 'Running terminal',
  });
  const s2 = applyToolProgressToSteps(s1.steps, {
    toolName: 'terminal',
    status: 'running',
    summary: 'terminal: gh pr checks 392',
  });
  assert.equal(s2.steps.length, 2);
  assert.equal(s2.steps[1]?.text, 'terminal: gh pr checks 392');

  const s3 = applyToolProgressToSteps(s2.steps, {
    toolName: 'terminal',
    status: 'finished',
    summary: 'terminal: gh pr checks 392 (passed)',
  });
  assert.equal(s3.steps.length, 2);
  assert.equal(s3.steps[1]?.done, true);
  assert.equal(s3.progress, '2/2');
});

test('resolveTaskDisplayTitle promotes meaningful step context for vague conversational nudges', () => {
  const vagueTask: BackgroundTask = {
    id: 'task-turn-1',
    channelId: 'general',
    title: 'what do you suggest',
    status: 'running',
    progress: 38,
    lastStep: 'terminal: gh pr checks 392 --repo Maia-VM/hermes',
    steps: [
      { text: 'Working in hermes-general', done: true },
      { text: 'Running read_file', done: true },
      { text: 'terminal: gh pr checks 392 --repo Maia-VM/hermes', done: false, active: true },
    ],
    updatedAt: 'live',
  };
  assert.equal(
    resolveTaskDisplayTitle(vagueTask),
    'terminal: gh pr checks 392 --repo Maia-VM/hermes'
  );

  const concreteTask: BackgroundTask = {
    ...vagueTask,
    title: 'Audit CI checks on Maia-VM/hermes PR 392',
  };
  assert.equal(
    resolveTaskDisplayTitle(concreteTask),
    'Audit CI checks on Maia-VM/hermes PR 392'
  );
});

test('resolveTaskStepBreakdown preserves pending steps on failed tasks and summarizeThreadTaskAggregate computes rollup', () => {
  const failedTask: BackgroundTask = {
    ...SAMPLE_TASKS[0],
    id: 'task-failed-1',
    channelId: 'launch',
    status: 'completed',
    rawStatus: 'failed',
    result: 'Gateway returned 502 Bad Gateway during publish step after retries.',
    steps: [
      { text: 'Collect changed thread summaries', done: true },
      { text: 'Publish final save_page artifact', done: false },
    ],
  };
  const failedBreakdown = resolveTaskStepBreakdown(failedTask);
  assert.equal(failedBreakdown.completedCount, 1);
  assert.equal(failedBreakdown.totalCount, 2);
  assert.equal(failedBreakdown.steps[0]?.state, 'done');
  assert.equal(failedBreakdown.steps[1]?.state, 'pending');

  assert.equal(
    formatTaskOutcomeSnippet(failedTask, 45),
    'Gateway returned 502 Bad Gateway during…'
  );
  assert.equal(
    formatTaskOutcomeSnippet({ ...failedTask, result: failedTask.lastStep }),
    null
  );

  const launchPlusFailed = partitionChannelTasks([SAMPLE_TASKS[0], failedTask], 'launch');
  const agg = summarizeThreadTaskAggregate(launchPlusFailed, false);
  assert.equal(agg.totalTasks, 2);
  assert.equal(agg.activeCount, 1);
  assert.equal(agg.completedCount, 1);
  assert.equal(agg.failedCount, 1);
  // SAMPLE_TASKS[0] is 67% (4/6), failedTask is 50% (1/2) -> average 59%
  assert.equal(agg.aggregatePct, 59);
});




