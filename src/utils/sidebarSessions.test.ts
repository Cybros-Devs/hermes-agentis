import test from 'node:test';
import assert from 'node:assert/strict';
import type { Channel, HermesAgentSession } from '../types/hermes';
import type { CanvasSession } from './canvasSessions';
import {
  buildSidebarSessionEntries,
  classifySessionBucket,
  computeFooterLanes,
  filterSidebarSessionEntries,
  formatCompactRelativeTime,
  formatDisplaySessionTitle,
  formatSourceLabel,
  isOpaqueSessionIdentifier,
  resolveEffectiveSidebarTab,
} from './sidebarSessions';

function makeCanvasSession(overrides: Partial<CanvasSession> = {}): CanvasSession {
  const channelId = overrides.channelId ?? 'demo-thread';
  return {
    id: overrides.id ?? `session-${channelId}`,
    channelId,
    hermesSessionId: overrides.hermesSessionId ?? `hermes-${channelId}`,
    agentPersona: 'Hermes Agent session',
    name: overrides.name ?? channelId,
    topic: overrides.topic ?? channelId,
    shape: 'clover',
    tint: 'lime',
    xPct: 50,
    yPct: 50,
    mood: 'happy',
    eyeStyle: 'open',
    isCore: overrides.isCore ?? false,
    autonomyMode: 'manual',
    scheduleLabel: 'On-demand',
    sandboxEnv: 'cloud-sandbox',
    workspaceDir: `~/hermes/${channelId}`,
    skills: [],
    ...overrides,
  };
}

function makeHermesSession(overrides: Partial<HermesAgentSession> = {}): HermesAgentSession {
  const channelId = overrides.channelId ?? 'demo-thread';
  return {
    sessionId: overrides.sessionId ?? `hermes-${channelId}`,
    channelId,
    name: overrides.name ?? channelId,
    persona: '',
    topic: overrides.topic ?? '',
    status: overrides.status ?? 'idle',
    turnCount: overrides.turnCount ?? 0,
    updatedAtMs: overrides.updatedAtMs ?? 1_700_000_000_000,
    ...overrides,
  };
}

test('identifies opaque Hermes gateway IDs and formats readable titles without hash noise', () => {
  assert.equal(isOpaqueSessionIdentifier('local-5e52c0948b0bfd7907bf92990a4140f94'), true);
  assert.equal(isOpaqueSessionIdentifier('run_6f2b7fcbed7c4eaeba5e67564d0a4958'), true);
  assert.equal(isOpaqueSessionIdentifier('cron_morning_17123456'), true);
  assert.equal(isOpaqueSessionIdentifier('fill-me-in-on-what'), false);

  const localUntitled = formatDisplaySessionTitle({
    topic: 'local-5e52c0948b0bfd7907bf92990a4140f94',
    name: 'local-5e52c0948b0bfd7907bf92990a4140f94',
    channelId: 'local-5e52c0948b0bfd7907bf92990a4140f94',
    sessionId: 'local-5e52c0948b0bfd7907bf92990a4140f94',
    sourceLabel: 'Local API',
  });
  assert.equal(localUntitled.title, 'Local API · 5e52c0');
  assert.equal(localUntitled.isOpaque, true);

  const runUntitled = formatDisplaySessionTitle({
    topic: '',
    name: 'run_6f2b7fcbed7c4eaeba5e67564d0a4958',
    channelId: 'run_6f2b7fcbed7c4eaeba5e67564d0a4958',
    sessionId: 'run_6f2b7fcbed7c4eaeba5e67564d0a4958',
    sourceLabel: 'Run',
  });
  assert.equal(runUntitled.title, 'Gateway run · 6f2b7f');
  assert.equal(runUntitled.isOpaque, true);

  const githubUrl = formatDisplaySessionTitle({
    topic: 'https://github.com/NousResearch/hermes-agent/issues/42',
    name: 'https-github-com',
    channelId: 'https-github-com',
    sessionId: 'hermes-https-github-com',
    sourceLabel: 'Web',
  });
  assert.equal(githubUrl.title, 'github.com/NousResearch/hermes-agent/issues/42');
  assert.equal(githubUrl.isOpaque, false);

  const localWithPreview = formatDisplaySessionTitle({
    topic: 'local-07ee2d7b545bd3db563f9fcd83fb72482',
    name: 'local-07ee2d7b545bd3db563f9fcd83fb72482',
    channelId: 'local-07ee2d7b545bd3db563f9fcd83fb72482',
    sessionId: 'local-07ee2d7b545bd3db563f9fcd83fb72482',
    lastMessage: 'Summarize overnight test failures across CI',
    sourceLabel: 'Local API',
  });
  assert.equal(localWithPreview.title, 'Summarize overnight test failures across CI');
  assert.equal(localWithPreview.isOpaque, false);
});

test('formats source labels and compact relative timestamps accurately', () => {
  assert.equal(formatSourceLabel('cli', 'cli_20260412', 'cli-20260412'), 'CLI');
  assert.equal(formatSourceLabel('telegram', 'tg-991', 'tg-991'), 'Telegram');
  assert.equal(formatSourceLabel('api_server', 'hermes-fill-me-in', 'fill-me-in'), 'Web');
  assert.equal(formatSourceLabel('api', 'local-5e52c0948b0bfd7907bf92990a4140f94', 'local-5e52c094'), 'Local API');
  assert.equal(formatSourceLabel(undefined, 'run_6f2b7fcbed7c4eaeba5e67564d0a4958', 'run_6f2b'), 'Run');
  assert.equal(formatSourceLabel('cron', 'cron_watch_1', 'daemon'), 'Cron');

  const now = 1_700_000_000_000;
  assert.equal(formatCompactRelativeTime(now - 20_000, now), 'now');
  assert.equal(formatCompactRelativeTime(now - 14 * 60_000, now), '14m');
  assert.equal(formatCompactRelativeTime(now - 3 * 3_600_000, now), '3h');
  assert.equal(formatCompactRelativeTime(now - 4 * 86_400_000, now), '4d');
});

test('separates interactive chats from automated runs & ephemeral local API scratch sessions', () => {
  assert.equal(
    classifySessionBucket({
      sessionId: 'local-5e52c0948b0bfd7907bf92990a4140f94',
      channelId: 'local-5e52c0948b0bfd7907bf92990a4140f94',
      source: 'api',
      isOpaqueTitle: true,
      turnCount: 0,
      hasActiveWork: false,
    }),
    'runs'
  );

  assert.equal(
    classifySessionBucket({
      sessionId: 'run_6f2b7fcbed7c4eaeba5e67564d0a4958',
      channelId: 'run_6f2b7fcbed7c4eaeba5e67564d0a4958',
      source: 'api',
      isOpaqueTitle: true,
      turnCount: 1,
      hasActiveWork: false,
    }),
    'runs'
  );

  assert.equal(
    classifySessionBucket({
      sessionId: 'hermes-fill-me-in',
      channelId: 'fill-me-in',
      source: 'api_server',
      isOpaqueTitle: false,
      turnCount: 4,
      hasActiveWork: false,
    }),
    'chats'
  );
});

test('buildSidebarSessionEntries pins active work first, sorts by recency, and supports search/filtering', () => {
  const now = 1_700_010_000_000;
  const canvasSessions: CanvasSession[] = [
    makeCanvasSession({
      channelId: 'local-5e52c0948b0bfd7907bf92990a4140f94',
      hermesSessionId: 'local-5e52c0948b0bfd7907bf92990a4140f94',
      name: 'local-5e52c0948b0bfd7907bf92990a4140f94',
      topic: 'local-5e52c0948b0bfd7907bf92990a4140f94',
    }),
    makeCanvasSession({
      channelId: 'https-github-com',
      hermesSessionId: 'hermes-https-github-com',
      name: 'https-github-com',
      topic: 'https://github.com/NousResearch/hermes-agent',
    }),
    makeCanvasSession({
      channelId: 'fill-me-in-we',
      hermesSessionId: 'hermes-fill-me-in-we',
      name: 'fill-me-in-we',
      topic: 'Fill me in on what happened',
    }),
    makeCanvasSession({
      channelId: 'daemon',
      hermesSessionId: 'hermes-daemon',
      name: 'daemon',
      topic: 'Background cron watcher & ambient signal daemon',
    }),
  ];

  const hermesSessions: HermesAgentSession[] = [
    makeHermesSession({
      channelId: 'local-5e52c0948b0bfd7907bf92990a4140f94',
      sessionId: 'local-5e52c0948b0bfd7907bf92990a4140f94',
      source: 'api',
      turnCount: 1,
      updatedAtMs: now - 2 * 60_000,
    }),
    makeHermesSession({
      channelId: 'https-github-com',
      sessionId: 'hermes-https-github-com',
      source: 'api_server',
      turnCount: 7,
      updatedAtMs: now - 30 * 60_000,
    }),
    makeHermesSession({
      channelId: 'fill-me-in-we',
      sessionId: 'hermes-fill-me-in-we',
      source: 'cli',
      turnCount: 3,
      updatedAtMs: now - 5 * 60_000,
    }),
  ];

  const entries = buildSidebarSessionEntries({
    canvasSessions,
    hermesSessions,
    activityByChannel: {
      'https-github-com': {
        channelId: 'https-github-com',
        runningCount: 1,
        pausedCount: 0,
        completedCount: 6,
        isThinking: false,
        hasActiveTask: true,
        primaryTitle: 'Checking repo disk cleanup',
      },
    },
    nowMs: now,
  });

  // Active task session pinned first regardless of older timestamp
  assert.equal(entries[0].session.channelId, 'https-github-com');
  assert.equal(entries[0].displayTitle, 'github.com/NousResearch/hermes-agent');
  assert.equal(entries[0].bucket, 'chats');

  const chatsOnly = filterSidebarSessionEntries(entries, { tab: 'chats', query: '' });
  assert.equal(chatsOnly.chatsCount, 2);
  assert.equal(chatsOnly.runsCount, 2);
  assert.deepEqual(
    chatsOnly.visible.map((e) => e.session.channelId),
    ['https-github-com', 'fill-me-in-we']
  );

  // Searching across buckets reveals crossBucketMatches
  const searchInChats = filterSidebarSessionEntries(entries, { tab: 'chats', query: '5e52c0' });
  assert.equal(searchInChats.visible.length, 0);
  assert.equal(searchInChats.crossBucketMatches, 1);

  const searchInAll = filterSidebarSessionEntries(entries, { tab: 'all', query: '5e52c0' });
  assert.equal(searchInAll.visible.length, 1);
  assert.equal(searchInAll.visible[0].displayTitle, 'Local API · 5e52c0');

  // If no chats exist at all, resolveEffectiveSidebarTab avoids an empty chats view
  const onlyRuns = entries.filter((e) => e.bucket === 'runs');
  assert.equal(resolveEffectiveSidebarTab('chats', onlyRuns), 'runs');
});

test('computeFooterLanes excludes daemon and long background cron strings from bottom LANES strip', () => {
  const entries = buildSidebarSessionEntries({
    canvasSessions: [
      makeCanvasSession({
        channelId: 'daemon',
        hermesSessionId: 'hermes-daemon',
        name: 'daemon',
        topic: 'Background cron watcher & ambient signal daemon',
      }),
      makeCanvasSession({
        channelId: 'fill-me-in',
        hermesSessionId: 'hermes-fill-me-in',
        name: 'fill-me-in',
        topic: 'Fill me in on what happened',
      }),
    ],
    hermesSessions: [],
    activityByChannel: {},
  });

  const channels: Channel[] = [
    {
      id: 'daemon',
      name: 'Background cron watcher & ambient signal daemon',
      sessionId: 'cron_watch_1',
      description: 'Background cron watcher & ambient signal daemon',
      unreadCount: 0,
    },
    {
      id: 'local-5e52c0948b0bfd7907bf92990a4140f94',
      name: 'local-5e52c0948b0bfd7907bf92990a4140f94',
      sessionId: 'local-5e52c0948b0bfd7907bf92990a4140f94',
      description: '',
      unreadCount: 0,
    },
    {
      id: 'general',
      name: 'general',
      sessionId: 'hermes-general',
      description: 'Primary general assistant lane',
      unreadCount: 0,
    },
  ];

  const footer = computeFooterLanes(channels, entries);
  assert.deepEqual(
    footer.map((l) => l.shortLabel),
    ['#general']
  );
});
