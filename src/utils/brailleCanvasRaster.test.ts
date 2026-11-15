import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHexRgb,
  rasterizeDotBucketsToSurface,
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
