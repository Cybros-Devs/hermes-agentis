import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_BOUNDS,
  autoArrangeSessions,
  clampCanvasPosition,
  createSeedCanvasSessions,
  findOpenCanvasSpot,
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

test('createSeedCanvasSessions and autoArrangeSessions produce bounded distinct coordinates', () => {
  const seeded = createSeedCanvasSessions(INITIAL_CHANNELS);
  assert.ok(seeded.length >= 4);
  const arranged = autoArrangeSessions(seeded);
  assert.equal(arranged.length, seeded.length);
  for (const s of arranged) {
    assert.ok(s.xPct >= CANVAS_BOUNDS.minX && s.xPct <= CANVAS_BOUNDS.maxX);
    assert.ok(s.yPct >= CANVAS_BOUNDS.minY && s.yPct <= CANVAS_BOUNDS.maxY);
  }
});
