import test from 'node:test';
import assert from 'node:assert/strict';
import type { TerminalEntry } from '../types/hermes';
import { groupThreadTimeline } from './threadTrace';
import {
  cleanMarkdownSnippet,
  determineActiveMinimapTurn,
  extractThreadMinimapTurns,
} from './threadMinimap';

function makeEntry(partial: Partial<TerminalEntry> & Pick<TerminalEntry, 'id' | 'role' | 'text'>): TerminalEntry {
  return {
    channelId: 'general',
    source: 'voice',
    timestamp: '14:20',
    ...partial,
  };
}

test('cleanMarkdownSnippet strips markdown clutter and truncates cleanly at word boundary', () => {
  const raw = '## Summary\nYes — **both** are safe. Use `git status` before pushing.\n- Step one\n- Step two';
  assert.equal(
    cleanMarkdownSnippet(raw, 120),
    'Summary Yes — both are safe. Use git status before pushing. • Step one • Step two'
  );

  const long = 'Alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november';
  const truncated = cleanMarkdownSnippet(long, 42);
  assert.ok(truncated.endsWith('…'));
  assert.ok(truncated.length <= 43);
});

test('extractThreadMinimapTurns skips bare init greeting and pairs user turns with trace + reply snippets', () => {
  const bareInit = groupThreadTimeline(
    [makeEntry({ id: 'init-1', role: 'hermes', text: 'Ready in #general.' })],
    false,
    true
  );
  assert.deepEqual(extractThreadMinimapTurns(bareInit), []);

  const entries: TerminalEntry[] = [
    makeEntry({ id: 'init-1', role: 'hermes', text: 'Welcome to Hermes.' }),
    makeEntry({ id: 'u-1', role: 'user', text: 'is this safe?', timestamp: '14:21' }),
    makeEntry({
      id: 'a-1',
      role: 'activity',
      text: 'Reasoning step',
      activityKind: 'reasoning',
      activityStatus: 'done',
      timestamp: '14:21',
    }),
    makeEntry({
      id: 'a-2',
      role: 'activity',
      text: 'read_file: sitemap.xml',
      activityStatus: 'done',
      timestamp: '14:21',
    }),
    makeEntry({
      id: 'h-1',
      role: 'hermes',
      text: "Yes — both are safe. Here's the simple version: #2 (sitemap date fix) is 100% safe.",
      timestamp: '14:21',
    }),
    makeEntry({ id: 'u-2', role: 'user', text: 'check gateway health', timestamp: '14:23' }),
    makeEntry({
      id: 'err-2',
      role: 'activity',
      text: 'Gateway unreachable at 127.0.0.1:8642',
      activityStatus: 'error',
      errorCode: 'gateway_offline',
      terminalOutcome: 'failed',
      timestamp: '14:23',
    }),
    makeEntry({ id: 'u-3', role: 'user', text: 'run live audit', timestamp: '14:25' }),
  ];

  const blocks = groupThreadTimeline(entries, true, true);
  const turns = extractThreadMinimapTurns(blocks);

  assert.equal(turns.length, 3);

  assert.equal(turns[0]?.anchorId, 'u-1');
  assert.equal(turns[0]?.turnNumber, 1);
  assert.equal(turns[0]?.title, 'is this safe?');
  assert.match(turns[0]?.snippet ?? '', /^Yes — both are safe/);
  assert.equal(turns[0]?.stepCount, 2);
  assert.equal(turns[0]?.hasReasoning, true);
  assert.equal(turns[0]?.status, 'done');

  assert.equal(turns[1]?.anchorId, 'u-2');
  assert.equal(turns[1]?.status, 'error');
  assert.match(turns[1]?.snippet ?? '', /Gateway unreachable/);

  assert.equal(turns[2]?.anchorId, 'u-3');
  assert.equal(turns[2]?.status, 'live');
  assert.equal(turns[2]?.snippet, 'Thinking…');
});

test('extractThreadMinimapTurns supports active sessions that open directly with agent/tool output', () => {
  const entries: TerminalEntry[] = [
    makeEntry({
      id: 'h-lead',
      role: 'hermes',
      text: 'Survey done. Scrubbing repository provenance files now.',
      timestamp: '19:17',
    }),
    makeEntry({
      id: 'a-lead',
      role: 'activity',
      text: 'Running terminal',
      activityStatus: 'running',
      timestamp: '19:19',
    }),
  ];
  const blocks = groupThreadTimeline(entries, true, true);
  const turns = extractThreadMinimapTurns(blocks);
  assert.equal(turns.length, 1);
  assert.equal(turns[0]?.anchorId, 'h-lead');
  assert.equal(turns[0]?.status, 'live');
  assert.equal(turns[0]?.stepCount, 1);
});

test('determineActiveMinimapTurn tracks scroll position from top to mid-stream to bottom', () => {
  const anchors = [
    { id: 'u-1', top: 0, height: 180 },
    { id: 'u-2', top: 220, height: 240 },
    { id: 'u-3', top: 500, height: 300 },
  ];

  assert.equal(determineActiveMinimapTurn([], 0, 500, 300), null);
  assert.equal(determineActiveMinimapTurn(anchors, 0, 500, 300), 'u-1');
  assert.equal(determineActiveMinimapTurn(anchors, 140, 500, 400), 'u-2');
  assert.equal(determineActiveMinimapTurn(anchors, 390, 500, 400), 'u-3');
});
