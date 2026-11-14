import test from 'node:test';
import assert from 'node:assert/strict';
import type { TerminalEntry } from '../types/hermes';
import { classifyTraceStep, groupThreadTimeline } from './threadTrace';

function makeEntry(
  id: string,
  role: TerminalEntry['role'],
  text: string,
  timestamp = '10:47'
): TerminalEntry {
  return {
    id,
    channelId: 'general',
    role,
    source: 'ui',
    text,
    timestamp,
  };
}

test('classifyTraceStep categorizes spawn, tool, link, and status steps cleanly', () => {
  const spawn = classifyTraceStep(makeEntry('1', 'activity', 'Agent spawned: researcher'));
  assert.equal(spawn.icon, 'spawn');
  assert.equal(spawn.label, 'Agent spawned');
  assert.equal(spawn.detail, 'researcher');

  const link = classifyTraceStep(makeEntry('2', 'activity', 'MCP link verified'));
  assert.equal(link.icon, 'link');

  const tool = classifyTraceStep(makeEntry('3', 'activity', 'Tool run: brief summary'));
  assert.equal(tool.icon, 'tool');
  assert.equal(tool.label, 'Tool run');
  assert.equal(tool.detail, 'brief summary');
});

test('groupThreadTimeline collapses adjacent activity entries into a single trace tree', () => {
  const entries: TerminalEntry[] = [
    makeEntry('u1', 'user', 'Check repo status'),
    makeEntry('a1', 'activity', 'Agent spawned: inspector'),
    makeEntry('a2', 'activity', 'Tool run: git status'),
    makeEntry('a3', 'activity', 'Link x2: tabs'),
    makeEntry('h1', 'hermes', 'Everything is clean.'),
  ];

  const blocks = groupThreadTimeline(entries, false);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].kind, 'entry');
  assert.equal(blocks[1].kind, 'trace');
  if (blocks[1].kind === 'trace') {
    assert.equal(blocks[1].items.length, 3);
    assert.equal(blocks[1].isLive, false);
  }
  assert.equal(blocks[2].kind, 'entry');
});

test('groupThreadTimeline attaches live thinking state to trailing trace or creates one', () => {
  const withoutTrailingActivity = groupThreadTimeline(
    [makeEntry('u1', 'user', 'Run tests')],
    true
  );
  assert.equal(withoutTrailingActivity.length, 2);
  assert.equal(withoutTrailingActivity[1].kind, 'trace');
  if (withoutTrailingActivity[1].kind === 'trace') {
    assert.equal(withoutTrailingActivity[1].isLive, true);
    assert.equal(withoutTrailingActivity[1].items.length, 0);
  }

  const withTrailingActivity = groupThreadTimeline(
    [makeEntry('u1', 'user', 'Run tests'), makeEntry('a1', 'activity', 'Tool run: npm test')],
    true
  );
  assert.equal(withTrailingActivity.length, 2);
  if (withTrailingActivity[1].kind === 'trace') {
    assert.equal(withTrailingActivity[1].isLive, true);
    assert.equal(withTrailingActivity[1].items.length, 1);
  }
});
