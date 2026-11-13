import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calcSceneNormal,
  evaluateSceneSdf,
  projectBasisAxes,
  renderAscii3DFrame,
  vec3,
  type Ascii3DParams,
} from './ascii3dEngine';

const BASE_PARAMS: Ascii3DParams = {
  cols: 72,
  rows: 34,
  time: 1.2,
  yaw: 0.2,
  pitch: 0.05,
  zoom: 1,
  mood: 'happy',
  viseme: 'wide',
  eyeState: 'open',
  energy: 0.7,
  isSpeaking: true,
  isListening: false,
  shaderMode: 'solid',
};

test('renderAscii3DFrame outputs exact grid dimensions and hits 3D geometry with edge contours', () => {
  const frame = renderAscii3DFrame(BASE_PARAMS);
  assert.equal(frame.cells.length, BASE_PARAMS.cols * BASE_PARAMS.rows);

  const nonBg = frame.cells.filter((c) => c.material !== 'bg' && c.ch !== ' ');
  assert.ok(nonBg.length > 300, 'Expected 3D raymarcher to shade over 300 character cells');

  assert.ok(frame.cells.some((c) => c.material === 'body'), 'Expected 3D head/torso SDF hit');
  assert.ok(frame.cells.some((c) => c.material === 'wing'), 'Expected 3D messenger wing SDF hit');
  assert.ok(frame.cells.some((c) => c.material === 'grid'), 'Expected 3D perspective floor grid hit');
  assert.ok(frame.cells.some((c) => c.material === 'pillar'), 'Expected 3D audio pillar hit');
  assert.ok(frame.cells.some((c) => c.material === 'orb'), 'Expected 3D orbital octahedron prism hit');
  assert.ok(frame.cells.some((c) => c.material === 'pulse'), 'Expected 3D acoustic pulse wave hit');
  assert.ok(frame.cells.some((c) => c.isEdge), 'Expected Pass 2 screen-space 3D contour edges');
});

test('evaluateSceneSdf and calcSceneNormal return unit-length surface normals', () => {
  const n = calcSceneNormal(vec3(0, 0.1, 0.6), BASE_PARAMS);
  const len = Math.hypot(n.x, n.y, n.z);
  assert.ok(Math.abs(len - 1) < 0.05, `Expected unit normal, got length ${len}`);

  const centerHit = evaluateSceneSdf(vec3(0, 0.1, 0), BASE_PARAMS);
  assert.ok(centerHit.dist < 0, 'Origin inside head should have negative SDF distance');
});

test('renderAscii3DFrame supports solid, wire, depth, holo, and norm shader modes', () => {
  const wire = renderAscii3DFrame({ ...BASE_PARAMS, shaderMode: 'wire' });
  const depth = renderAscii3DFrame({ ...BASE_PARAMS, shaderMode: 'depth' });
  const holo = renderAscii3DFrame({ ...BASE_PARAMS, shaderMode: 'holo' });
  const norm = renderAscii3DFrame({ ...BASE_PARAMS, shaderMode: 'norm' });

  assert.equal(wire.cells.length, BASE_PARAMS.cols * BASE_PARAMS.rows);
  assert.equal(depth.cells.length, BASE_PARAMS.cols * BASE_PARAMS.rows);
  assert.equal(holo.cells.length, BASE_PARAMS.cols * BASE_PARAMS.rows);
  assert.equal(norm.cells.length, BASE_PARAMS.cols * BASE_PARAMS.rows);
  assert.ok(depth.cells.some((c) => c.ch === '█' || c.ch === '▓' || c.ch === '▒'));
  assert.ok(holo.cells.some((c) => c.material === 'body' && c.ch !== ' '));
  assert.ok(norm.cells.some((c) => Boolean(c.rgb)), 'Expected RGB normal colors in norm mode');
});

test('projectBasisAxes projects unit X/Y/Z tripod vectors for orientation gizmo', () => {
  const axes = projectBasisAxes(0.25, 0.1);
  assert.equal(axes.length, 3);
  const labels = axes.map((a) => a.label).sort();
  assert.deepEqual(labels, ['X', 'Y', 'Z']);
  for (const ax of axes) {
    const len = Math.hypot(ax.x, ax.y, ax.z);
    assert.ok(Math.abs(len - 1) < 1e-4, `Expected unit axis vector for ${ax.label}, got ${len}`);
  }
});
