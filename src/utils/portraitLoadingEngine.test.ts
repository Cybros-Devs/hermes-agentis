import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blendLoadingToPortraitFrame,
  computeMaterializeProgress,
  renderPortraitLoadingFrame,
} from './portraitLoadingEngine';

test('renderPortraitLoadingFrame produces exact dimensions with animated Braille orbital signal', () => {
  const f1 = renderPortraitLoadingFrame({ cols: 62, rows: 28, time: 0.2, variant: 'stage' });
  const f2 = renderPortraitLoadingFrame({ cols: 62, rows: 28, time: 1.1, variant: 'stage' });

  assert.equal(f1.lines.length, 28);
  assert.equal(f1.cells.length, 62 * 28);
  for (const line of f1.lines) {
    assert.equal(line.length, 62);
  }

  const glyphs1 = f1.lines.join('').replace(/\s/g, '');
  assert.ok(glyphs1.length > 40, 'Expected visible Braille orbital loader glyphs');
  assert.ok(/[\u2801-\u28FF]/.test(glyphs1), 'Expected Unicode Braille dots');
  assert.notEqual(
    f1.lines.join('\n'),
    f2.lines.join('\n'),
    'Loading scanner sweep and orbital rings should animate smoothly over time'
  );
});

test('renderPortraitLoadingFrame supports thumb and error modes cleanly', () => {
  const thumb = renderPortraitLoadingFrame({ cols: 22, rows: 11, time: 0.5, variant: 'thumb' });
  assert.equal(thumb.lines.length, 11);
  assert.ok(thumb.lines.join('').replace(/\s/g, '').length > 5);

  const errFrame = renderPortraitLoadingFrame({
    cols: 62,
    rows: 28,
    time: 0.5,
    variant: 'stage',
    status: 'error',
  });
  assert.equal(errFrame.lines.length, 28);
  assert.ok(errFrame.lines.join('').replace(/\s/g, '').length > 20);
});

test('computeMaterializeProgress ramps smoothly and skips delay under reduced motion', () => {
  assert.equal(computeMaterializeProgress(0, false), 0);
  const mid = computeMaterializeProgress(0.21, false);
  assert.ok(mid > 0.5 && mid < 1, `Expected ease-out curve in mid transition, got ${mid}`);
  assert.equal(computeMaterializeProgress(1.0, false), 1);
  assert.equal(computeMaterializeProgress(0, true), 1);
});

test('blendLoadingToPortraitFrame smoothly transitions from loading frame to real portrait frame', () => {
  const cols = 20;
  const rows = 8;
  const loading = renderPortraitLoadingFrame({ cols, rows, time: 0.3, variant: 'hero' });
  const portrait = {
    cols,
    rows,
    lines: Array.from({ length: rows }, () => '⣿'.repeat(cols)),
    cells: new Uint8Array(cols * rows).fill(240),
  };

  const atStart = blendLoadingToPortraitFrame(loading, portrait, 0);
  assert.equal(atStart.lines.join('\n'), loading.lines.join('\n'));

  const atMid = blendLoadingToPortraitFrame(loading, portrait, 0.5);
  assert.notEqual(atMid.lines.join('\n'), loading.lines.join('\n'));
  assert.notEqual(atMid.lines.join('\n'), portrait.lines.join('\n'));

  const atEnd = blendLoadingToPortraitFrame(loading, portrait, 1);
  assert.equal(atEnd.lines.join('\n'), portrait.lines.join('\n'));
});
