import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUniqueSlugForFreshChannel,
  deriveSessionFromPrompt,
  isTerminalSettledItem,
  normalizeDuetChannelId,
  pickNextShapeAndTint,
  shouldStartNewHomeSession,
} from './homeSession';

test('deriveSessionFromPrompt generates meaningful unique slugs and session IDs', () => {
  const s1 = deriveSessionFromPrompt('Can you audit my CI runners and open PRs?', ['general', 'ops']);
  assert.equal(s1.slug, 'audit-ci-runners');
  assert.equal(s1.hermesSessionId, 'hermes-audit-ci-runners');
  assert.match(s1.persona, /audit my CI runners/i);

  const s2 = deriveSessionFromPrompt('Can you audit my CI runners?', [
    'general',
    'ops',
    'audit-ci-runners',
  ]);
  assert.equal(s2.slug, 'audit-ci-runners-2');
  assert.equal(s2.hermesSessionId, 'hermes-audit-ci-runners-2');

  const s3 = deriveSessionFromPrompt('help me', []);
  assert.equal(s3.slug, 'help-me');
});

test('shouldStartNewHomeSession only triggers on natural-language prompts when Home draft is armed', () => {
  assert.equal(
    shouldStartNewHomeSession({ homeSessionDraft: true, panelView: 'home', rawText: 'Review backlog' }),
    true
  );
  assert.equal(
    shouldStartNewHomeSession({ homeSessionDraft: true, panelView: 'home', rawText: '/help' }),
    false
  );
  assert.equal(
    shouldStartNewHomeSession({ homeSessionDraft: true, panelView: 'voice', rawText: 'Review backlog' }),
    false
  );
  assert.equal(
    shouldStartNewHomeSession({ homeSessionDraft: false, panelView: 'home', rawText: 'Follow up question' }),
    false
  );
  assert.equal(
    shouldStartNewHomeSession({ homeSessionDraft: true, panelView: 'home', rawText: '   ' }),
    false
  );
});

test('normalizeDuetChannelId resolves chan- prefixes and alias maps accurately', () => {
  const aliases = new Map<string, string>([
    ['chan-k9x2p', 'audit-ci-runners'],
    ['k9x2p', 'audit-ci-runners'],
    ['audit-ci-runners', 'audit-ci-runners'],
  ]);
  assert.equal(normalizeDuetChannelId('chan-k9x2p', aliases), 'audit-ci-runners');
  assert.equal(normalizeDuetChannelId('chan-ops'), 'ops');
  assert.equal(normalizeDuetChannelId('#https-github-com'), 'https-github-com');
  assert.equal(normalizeDuetChannelId('hermes-https-github-com'), 'https-github-com');
  assert.equal(normalizeDuetChannelId(undefined), 'general');
});

test('isTerminalSettledItem identifies completed assistant turns and terminal activity runs', () => {
  assert.equal(isTerminalSettledItem({ kind: 'assistant', streaming: true }), false);
  assert.equal(isTerminalSettledItem({ kind: 'assistant', streaming: false }), true);
  assert.equal(
    isTerminalSettledItem({ kind: 'activity', activity: { status: 'running' } }),
    false
  );
  assert.equal(
    isTerminalSettledItem({ kind: 'activity', activity: { status: 'error' } }),
    true
  );
  assert.equal(
    isTerminalSettledItem({ kind: 'activity', activity: { status: 'done' } }),
    true
  );
  assert.equal(isTerminalSettledItem({ kind: 'user' }), false);
});

test('pickNextShapeAndTint avoids overusing already-present shapes', () => {
  const picked = pickNextShapeAndTint([
    { shape: 'clover', tint: 'lime' },
    { shape: 'trapezoid', tint: 'amber' },
    { shape: 'pebble', tint: 'periwinkle' },
    { shape: 'star', tint: 'pink' },
    { shape: 'ghost', tint: 'lavender' },
  ]);
  assert.notEqual(picked.shape, 'clover');
  assert.ok(picked.tint);
});

test('buildUniqueSlugForFreshChannel prevents collisions with existing upstream slugs within 24 chars', () => {
  assert.equal(buildUniqueSlugForFreshChannel('morning-brief', ['general', 'morning-brief']), 'morning-brief-2');
  const maxBase = 'ultra-long-session-title';
  const collided = buildUniqueSlugForFreshChannel(maxBase, [maxBase]);
  assert.ok(collided.length <= 24, `expected <= 24 chars, got ${collided.length}`);
  assert.ok(collided.endsWith('-2'));
});

test('deriveSessionFromPrompt never yields reserved general slug', () => {
  const s = deriveSessionFromPrompt('general', []);
  assert.notEqual(s.slug, 'general');
  assert.ok(s.slug.length <= 24);
});
