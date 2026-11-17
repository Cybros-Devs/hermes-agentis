import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THREAD_SPLIT_MIN_STAGE_WIDTH,
  computeCanvasPopoverAlignment,
  resolveStageHeaderSize,
  resolveThreadTasksLayoutMode,
} from './responsiveLayout';

test('resolveThreadTasksLayoutMode uses overlay on mobile/tablet and narrow desktop stages', () => {
  assert.equal(resolveThreadTasksLayoutMode(1200, false), 'overlay');
  assert.equal(resolveThreadTasksLayoutMode(688, true), 'overlay');
  assert.equal(resolveThreadTasksLayoutMode(THREAD_SPLIT_MIN_STAGE_WIDTH - 1, true), 'overlay');
  assert.equal(resolveThreadTasksLayoutMode(0, true), 'overlay');
  assert.equal(resolveThreadTasksLayoutMode(null, true), 'overlay');
});

test('resolveThreadTasksLayoutMode uses split docking only when desktop stage has >= 900px width', () => {
  assert.equal(resolveThreadTasksLayoutMode(THREAD_SPLIT_MIN_STAGE_WIDTH, true), 'split');
  assert.equal(resolveThreadTasksLayoutMode(940, true), 'split');
  assert.equal(resolveThreadTasksLayoutMode(1100, true), 'split');
});

test('computeCanvasPopoverAlignment prevents edge clipping for left and right dots', () => {
  assert.equal(computeCanvasPopoverAlignment(10), 'left');
  assert.equal(computeCanvasPopoverAlignment(23.9), 'left');
  assert.equal(computeCanvasPopoverAlignment(24), 'center');
  assert.equal(computeCanvasPopoverAlignment(50), 'center');
  assert.equal(computeCanvasPopoverAlignment(76), 'center');
  assert.equal(computeCanvasPopoverAlignment(76.1), 'right');
  assert.equal(computeCanvasPopoverAlignment(90), 'right');
  assert.equal(computeCanvasPopoverAlignment(Number.NaN), 'center');
});

test('resolveStageHeaderSize adapts Queue/CLI/Thread chrome to viewport height', () => {
  assert.equal(resolveStageHeaderSize({ panelView: 'home', viewportHeightPx: 700 }), 'full');
  assert.equal(resolveStageHeaderSize({ panelView: 'canvas', viewportHeightPx: 900 }), 'strip');
  assert.equal(resolveStageHeaderSize({ panelView: 'queue', viewportHeightPx: 768 }), 'strip');
  assert.equal(resolveStageHeaderSize({ panelView: 'queue', viewportHeightPx: 900 }), 'compact');
  assert.equal(resolveStageHeaderSize({ panelView: 'cli', viewportHeightPx: 768 }), 'strip');
  assert.equal(resolveStageHeaderSize({ panelView: 'cli', viewportHeightPx: 900 }), 'compact');
  assert.equal(resolveStageHeaderSize({ panelView: 'voice', viewportHeightPx: 768 }), 'compact');
  assert.equal(resolveStageHeaderSize({ panelView: 'voice', viewportHeightPx: 640 }), 'strip');
});
