import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDLE_ACTION_SLOT_SECONDS,
  IDLE_ACTIVE_END_SECONDS,
  IDLE_ANIMATION_SETS,
  IDLE_FULL_LOOP_SECONDS,
  IDLE_SET_ORDER,
  evaluateIdleActionStep,
  resolveIdleSetForShape,
} from './brailleIdleLoops';
import type { BrailleShapeKind } from './brailleShapesEngine';

test('defines exactly 6 animation sets with 6 distinct separated actions each (36 unique actions)', () => {
  assert.equal(IDLE_SET_ORDER.length, 6);
  const seenActionIds = new Set<string>();

  for (const setId of IDLE_SET_ORDER) {
    const meta = IDLE_ANIMATION_SETS[setId];
    assert.ok(meta, `Missing metadata for set ${setId}`);
    assert.equal(meta.actions.length, 6, `${setId} must have exactly 6 actions`);
    for (const action of meta.actions) {
      assert.ok(action.id.length > 0 && action.label.length > 0);
      assert.equal(
        seenActionIds.has(action.id),
        false,
        `Duplicate action ID detected across sets: ${action.id}`
      );
      seenActionIds.add(action.id);
    }
  }

  assert.equal(seenActionIds.size, 36);
});

test('6 primary Canvas shapes resolve cleanly across all 6 distinct animation sets', () => {
  const primaryShapes: BrailleShapeKind[] = [
    'clover',
    'trapezoid',
    'pebble',
    'star',
    'ghost',
    'cloud',
  ];
  const resolved = new Set(primaryShapes.map((shape) => resolveIdleSetForShape(shape)));
  assert.equal(resolved.size, 6, 'Primary shapes must map 1:1 across all 6 sets');
});

test('evaluateIdleActionStep steps through all 6 actions with calm separated resting gaps and wraps smoothly', () => {
  for (const setId of IDLE_SET_ORDER) {
    const visited = new Set<string>();

    for (let idx = 0; idx < 6; idx++) {
      const activeSample = evaluateIdleActionStep(
        setId,
        idx * IDLE_ACTION_SLOT_SECONDS + 1.4
      );
      assert.equal(activeSample.actionIndex, idx);
      assert.equal(activeSample.isResting, false);
      assert.equal(activeSample.envelope, 1);
      visited.add(activeSample.actionId);

      const restSample = evaluateIdleActionStep(
        setId,
        idx * IDLE_ACTION_SLOT_SECONDS + IDLE_ACTIVE_END_SECONDS + 0.35
      );
      assert.equal(restSample.actionIndex, idx);
      assert.equal(restSample.isResting, true);
      assert.equal(restSample.envelope, 0);
      assert.equal(restSample.pose.hand, 'none');
      assert.equal(restSample.pose.prop, 'none');
    }

    assert.equal(visited.size, 6, `${setId} loop should visit all 6 actions`);

    const wrappedSample = evaluateIdleActionStep(setId, IDLE_FULL_LOOP_SECONDS + 1.4);
    assert.equal(wrappedSample.actionIndex, 0);
    assert.equal(wrappedSample.isResting, false);
  }
});

test('evaluateIdleActionStep respects reducedMotion by returning calm neutral rest pose', () => {
  for (const setId of IDLE_SET_ORDER) {
    const frame = evaluateIdleActionStep(setId, 1.5, true);
    assert.equal(frame.isResting, true);
    assert.equal(frame.envelope, 0);
    assert.equal(frame.pose.headX, 0);
    assert.equal(frame.pose.headY, 0);
    assert.equal(frame.pose.tilt, 0);
    assert.equal(frame.pose.hand, 'none');
    assert.equal(frame.pose.prop, 'none');
  }
});

test('evaluateIdleActionStep transitions smoothly across anticipation, peak, and settle without abrupt pops', () => {
  for (const setId of IDLE_SET_ORDER) {
    let prev = evaluateIdleActionStep(setId, 0);
    for (let step = 1; step <= 64; step++) {
      const curr = evaluateIdleActionStep(setId, step * (IDLE_ACTIVE_END_SECONDS / 64));
      assert.ok(
        Math.abs(curr.pose.headY - prev.pose.headY) < 0.035,
        `${setId} headY jumped unexpectedly at step ${step}: ${prev.pose.headY} -> ${curr.pose.headY}`
      );
      assert.ok(
        Math.abs(curr.pose.tilt - prev.pose.tilt) < 0.055,
        `${setId} tilt jumped unexpectedly at step ${step}: ${prev.pose.tilt} -> ${curr.pose.tilt}`
      );
      prev = curr;
    }
  }
});
