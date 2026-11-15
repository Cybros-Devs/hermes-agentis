import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { buildPortraitSourceFromRgba } from '../../src/utils/asciiPortraitEngine';
import {
  COMPONENT_EVALUATORS,
  evaluateExtendedComponents,
} from './eval-uphill';

function makeSyntheticPortraitField(size = 64) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5;
      const dy = y / size - 0.5;
      const r = Math.hypot(dx, dy);
      const lum = r < 0.35 ? Math.round(210 - r * 300) : 12;
      const idx = (y * size + x) * 4;
      rgba[idx] = lum;
      rgba[idx + 1] = lum;
      rgba[idx + 2] = lum;
      rgba[idx + 3] = 255;
    }
  }
  return buildPortraitSourceFromRgba(rgba, size, size);
}

test('COMPONENT_EVALUATORS covers all registered component evaluators cleanly', () => {
  const ids = COMPONENT_EVALUATORS.map((ev) => ev.id);
  assert.deepEqual(ids, [
    'brailleShapesAll9',
    'brailleIdleLoops36',
    'ascii3dEngine',
    'portraitLoading',
    'textDecode',
    'cssAndComponentAudit',
  ]);

  const out = evaluateExtendedComponents({
    repoRoot: path.resolve(process.cwd()),
    sourceField: makeSyntheticPortraitField(64),
  });

  assert.equal(out.maxExtendedScore, 100);
  assert.ok(out.extendedScore >= 85 && out.extendedScore <= 100, `Expected high extendedScore, got ${out.extendedScore}`);

  const byId = new Map(out.results.map((r) => [r.id, r]));
  const cssAudit = byId.get('cssAndComponentAudit');
  assert.ok(cssAudit);
  assert.equal(cssAudit.score, cssAudit.maxScore, `Expected clean cssAndComponentAudit score=20, got ${cssAudit.score}: ${JSON.stringify(cssAudit.metrics)}`);

  const shapesAll9 = byId.get('brailleShapesAll9');
  assert.ok(shapesAll9);
  assert.equal(shapesAll9.metrics.shapeCount, 9);
  assert.equal(shapesAll9.metrics.distinctPairs, shapesAll9.metrics.pairCount);

  const idle36 = byId.get('brailleIdleLoops36');
  assert.ok(idle36);
  assert.equal(idle36.metrics.actionCount, 36);
  assert.equal(idle36.score, idle36.maxScore);
});
