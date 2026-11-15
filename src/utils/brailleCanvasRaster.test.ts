import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHexRgb,
  rasterizeDotBucketsToSurface,
  rasterizeTonalDotBucketsToSurface,
  type BrailleRasterSurface,
} from './brailleCanvasRaster';

function makeFakeSurface(width: number, height: number): BrailleRasterSurface {
  const bytes = new Uint8ClampedArray(width * height * 4);
  return {
    imageData: { data: bytes, width, height, colorSpace: 'srgb' } as ImageData,
    u32: new Uint32Array(bytes.buffer),
    bytes,
    width,
    height,
  };
}

test('parseHexRgb decodes 6-digit, 3-digit, and fallback colors cleanly', () => {
  assert.deepEqual(parseHexRgb('#34D399'), [52, 211, 153]);
  assert.deepEqual(parseHexRgb('#FFF'), [255, 255, 255]);
  assert.deepEqual(parseHexRgb('invalid'), [230, 240, 236]);
});

test('rasterizeDotBucketsToSurface clears prior pixels and stamps analytical subpixel coverage', () => {
  const surface = makeFakeSurface(10, 10);
  surface.u32.fill(0xffffffff);

  const xy = new Float32Array([2.0, 3.0]);
  rasterizeDotBucketsToSurface(
    surface,
    [{ xy, len: 2, hex: '#34D399', alpha: 1 }],
    1,
    1.5
  );

  // Pixel (0,0) must be cleared
  assert.equal(surface.bytes[3], 0);

  // Pixel (2,3) has full 1x1 coverage -> alpha 255, RGB (52, 211, 153)
  const p23 = (3 * 10 + 2) * 4;
  assert.equal(surface.bytes[p23], 52);
  assert.equal(surface.bytes[p23 + 1], 211);
  assert.equal(surface.bytes[p23 + 2], 153);
  assert.equal(surface.bytes[p23 + 3], 255);

  // Pixel (3,3) has 0.5 horizontal x 1.0 vertical coverage -> alpha ~128
  const p33 = (3 * 10 + 3) * 4;
  assert.ok(surface.bytes[p33 + 3] >= 126 && surface.bytes[p33 + 3] <= 129);
});

test('rasterizeTonalDotBucketsToSurface modulates dot coverage area by diameterScale with circular AA', () => {
  const surfaceSmall = makeFakeSurface(16, 16);
  const surfaceLarge = makeFakeSurface(16, 16);

  const countAlphaSum = (bytes: Uint8ClampedArray) => {
    let sum = 0;
    for (let i = 3; i < bytes.length; i += 4) sum += bytes[i];
    return sum;
  };

  rasterizeTonalDotBucketsToSurface(
    surfaceSmall,
    [{ xy: new Float32Array([6, 6]), len: 2, hex: '#8FA69E', alpha: 0.9, diameterScale: 0.65 }],
    1,
    3.0
  );
  rasterizeTonalDotBucketsToSurface(
    surfaceLarge,
    [{ xy: new Float32Array([6, 6]), len: 2, hex: '#FFFFFF', alpha: 0.9, diameterScale: 1.3 }],
    1,
    3.0
  );

  const smallCoverage = countAlphaSum(surfaceSmall.bytes);
  const largeCoverage = countAlphaSum(surfaceLarge.bytes);
  assert.ok(smallCoverage > 0 && largeCoverage > smallCoverage * 1.8,
    `Expected larger diameterScale to cover noticeably more alpha mass (${smallCoverage} vs ${largeCoverage})`
  );

  // Center of large dot should be brighter than outer corner pixel due to circular AA kernel
  const centerA = surfaceLarge.bytes[(7 * 16 + 7) * 4 + 3];
  const outerA = surfaceLarge.bytes[(5 * 16 + 5) * 4 + 3];
  assert.ok(centerA > outerA, `Expected circular falloff from center (${centerA}) to edge (${outerA})`);
});
