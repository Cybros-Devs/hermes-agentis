import test from 'node:test';
import assert from 'node:assert/strict';
import type { TerminalEntry } from '../types/hermes';
import type { ClassifiedTraceStep } from './threadTrace';
import {
  findMatchingThreadEntryIds,
  findPrecedingUserPrompt,
  formatThreadTranscriptMarkdown,
  stepMatchIndex,
  summarizeTraceHeader,
} from './threadSearch';

const sampleEntries: TerminalEntry[] = [
  {
    id: 'u1',
    channelId: 'audit',
    role: 'user',
    source: 'voice',
    text: 'Check PR #395 status',
    timestamp: '09:10',
  },
  {
    id: 'act1',
    channelId: 'audit',
    role: 'activity',
    source: 'ui',
    text: 'terminal completed',
    timestamp: '09:11',
  },
  {
    id: 'a1',
    channelId: 'audit',
    role: 'hermes',
    source: 'voice',
    text: 'PR #395 has 1 failing DB lane test.',
    timestamp: '09:11',
  },
  {
    id: 'c1',
    channelId: 'audit',
    role: 'command',
    source: 'cli',
    text: '/gateway',
    timestamp: '09:12',
  },
];

test('findMatchingThreadEntryIds matches visible messages case-insensitively and ignores activity', () => {
  assert.deepEqual(findMatchingThreadEntryIds(sampleEntries, 'pr #395'), ['u1', 'a1']);
  assert.deepEqual(findMatchingThreadEntryIds(sampleEntries, 'terminal'), []);
  assert.deepEqual(findMatchingThreadEntryIds(sampleEntries, '   '), []);
});

test('stepMatchIndex wraps cleanly in both directions', () => {
  assert.equal(stepMatchIndex(0, 3, 'next'), 1);
  assert.equal(stepMatchIndex(2, 3, 'next'), 0);
  assert.equal(stepMatchIndex(0, 3, 'prev'), 2);
  assert.equal(stepMatchIndex(-1, 3, 'next'), 0);
  assert.equal(stepMatchIndex(0, 0, 'next'), -1);
});

test('summarizeTraceHeader previews latest active tool when live and tool/reasoning summary when settled', () => {
  const steps: ClassifiedTraceStep[] = [
    { id: '1', label: 'Reasoning', detail: 'Check CI', timestamp: '09:10', icon: 'reasoning', isReasoning: true },
    { id: '2', label: 'terminal', detail: 'running', timestamp: '09:11', icon: 'tool' },
  ];
  assert.equal(summarizeTraceHeader(steps, true), '2 steps · terminal');
  assert.equal(summarizeTraceHeader(steps, false), '2 steps · 1 tool · reasoning');
  assert.equal(summarizeTraceHeader([], true), 'Running');
});

test('formatThreadTranscriptMarkdown exports clean Markdown excluding raw activity noise', () => {
  const md = formatThreadTranscriptMarkdown({
    title: 'PR Audit',
    sessionId: 'hermes-audit',
    profile: 'default',
    model: 'hermes-agent',
    entries: sampleEntries,
  });
  assert.ok(md.includes('# PR Audit'));
  assert.ok(md.includes('### User (09:10)'));
  assert.ok(md.includes('### Hermes (09:11)'));
  assert.ok(md.includes('`/gateway`'));
  assert.ok(!md.includes('terminal completed'));
});

test('findPrecedingUserPrompt resolves the prompt belonging to a specific reply', () => {
  assert.equal(findPrecedingUserPrompt(sampleEntries, 'a1'), 'Check PR #395 status');
  assert.equal(findPrecedingUserPrompt(sampleEntries, 'u1'), '');
});
