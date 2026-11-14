import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_BOUNDS,
  autoArrangeSessions,
  clampCanvasPosition,
  createHermesSessionId,
  createSeedCanvasSessions,
  findOpenCanvasSpot,
  normalizeCanvasSessions,
  slugifySessionName,
} from './canvasSessions';
import { INITIAL_CHANNELS } from './cliEngine';

test('clampCanvasPosition enforces safe canvas stage bounds', () => {
  const low = clampCanvasPosition(-20, 0);
  assert.equal(low.xPct, CANVAS_BOUNDS.minX);
  assert.equal(low.yPct, CANVAS_BOUNDS.minY);

  const high = clampCanvasPosition(120, 99);
  assert.equal(high.xPct, CANVAS_BOUNDS.maxX);
  assert.equal(high.yPct, CANVAS_BOUNDS.maxY);
});

test('slugifySessionName normalizes and deduplicates session identifiers', () => {
  assert.equal(slugifySessionName('Design Critique!', ['general', 'ops']), 'design-critique');
  assert.equal(slugifySessionName('Ops', ['general', 'ops']), 'ops-2');
  assert.equal(slugifySessionName('Ops', ['general', 'ops', 'ops-2']), 'ops-3');
  assert.equal(slugifySessionName('   ', []), 'session');
});

test('findOpenCanvasSpot maximizes distance from existing sessions', () => {
  const first = findOpenCanvasSpot([]);
  assert.deepEqual(first, { xPct: 50, yPct: 46 });

  const next = findOpenCanvasSpot([first]);
  const dist = Math.hypot(next.xPct - first.xPct, next.yPct - first.yPct);
  assert.ok(dist >= 15, `expected open spot well separated from existing session, got dist=${dist}`);
});

test('createSeedCanvasSessions assigns distinct hermes-agent sessions and personas', () => {
  const seeded = createSeedCanvasSessions(INITIAL_CHANNELS);
  assert.ok(seeded.length >= 4);
  const sessionIds = new Set(seeded.map((s) => s.hermesSessionId));
  assert.equal(sessionIds.size, seeded.length, 'each shape must have a unique hermesSessionId');
  for (const s of seeded) {
    assert.ok(s.hermesSessionId.startsWith('hermes-'));
    assert.ok(s.agentPersona.length > 10);
  }

  const arranged = autoArrangeSessions(seeded);
  assert.equal(arranged.length, seeded.length);
  for (const s of arranged) {
    assert.ok(s.xPct >= CANVAS_BOUNDS.minX && s.xPct <= CANVAS_BOUNDS.maxX);
    assert.ok(s.yPct >= CANVAS_BOUNDS.minY && s.yPct <= CANVAS_BOUNDS.maxY);
  }
});

test('normalizeCanvasSessions backfills legacy localStorage entries cleanly', () => {
  const normalized = normalizeCanvasSessions([
    {
      id: 'legacy-1',
      channelId: 'kitsune-lab',
      name: 'kitsune-lab',
      shape: 'heart',
      tint: 'coral',
      xPct: 2,
      yPct: 95,
    },
  ]);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].hermesSessionId, createHermesSessionId('kitsune-lab'));
  assert.ok(normalized[0].agentPersona.length > 0);
  assert.equal(normalized[0].xPct, CANVAS_BOUNDS.minX);
  assert.equal(normalized[0].yPct, CANVAS_BOUNDS.maxY);
});
