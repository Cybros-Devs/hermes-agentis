import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_BOUNDS,
  CANVAS_ZOOM_BOUNDS,
  DEFAULT_CANVAS_VIEWPORT,
  DOT_STARTER_TEMPLATES,
  arrangeSessionsFormation,
  autoArrangeSessions,
  clampCanvasPan,
  clampCanvasPosition,
  clampCanvasZoom,
  createHermesSessionId,
  createSeedCanvasPins,
  createSeedCanvasSessions,
  filterCanvasSessions,
  findOpenCanvasSpot,
  findOpenPinSpot,
  formatAutonomyLabel,
  formatSandboxLabel,
  isDotAutonomous,
  normalizeCanvasPins,
  normalizeCanvasSessions,
  slugifySessionName,
  zoomViewportAroundPoint,
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

test('findOpenCanvasSpot maximizes distance from existing sessions without overlapping input bars', () => {
  const first = findOpenCanvasSpot([]);
  assert.deepEqual(first, { xPct: 50, yPct: 46 });

  const next = findOpenCanvasSpot([first]);
  const dist = Math.hypot(next.xPct - first.xPct, next.yPct - first.yPct);
  assert.ok(dist >= 15, `expected open spot well separated from existing session, got dist=${dist}`);

  const seeded = createSeedCanvasSessions(INITIAL_CHANNELS);
  const extraSpot = findOpenCanvasSpot(seeded);
  for (const item of seeded) {
    const clearance = Math.hypot(
      (extraSpot.xPct - item.xPct) / 24,
      (extraSpot.yPct - item.yPct) / 26
    );
    assert.ok(
      clearance >= 0.9,
      `expected extra spot (${extraSpot.xPct}, ${extraSpot.yPct}) clear of #${item.channelId} (${item.xPct}, ${item.yPct}), got clearance=${clearance.toFixed(2)}`
    );
  }
});

test('createSeedCanvasSessions assigns distinct hermes-agent sessions, personas, and Dots autonomy', () => {
  const seeded = createSeedCanvasSessions(INITIAL_CHANNELS);
  assert.ok(seeded.length >= 4);
  const sessionIds = new Set(seeded.map((s) => s.hermesSessionId));
  assert.equal(sessionIds.size, seeded.length, 'each shape must have a unique hermesSessionId');
  for (const s of seeded) {
    assert.ok(s.hermesSessionId.startsWith('hermes-'));
    assert.ok(s.agentPersona.length > 10);
    assert.ok(Array.isArray(s.skills) && s.skills.length > 0);
    assert.ok(s.workspaceDir.startsWith('~/'));
  }

  for (const preset of ['constellation', 'orbit', 'grid'] as const) {
    const arranged = arrangeSessionsFormation(seeded, preset);
    assert.equal(arranged.length, seeded.length);
    for (const s of arranged) {
      assert.ok(s.xPct >= CANVAS_BOUNDS.minX && s.xPct <= CANVAS_BOUNDS.maxX);
      assert.ok(s.yPct >= CANVAS_BOUNDS.minY && s.yPct <= CANVAS_BOUNDS.maxY);
    }
  }

  const legacyArranged = autoArrangeSessions(seeded);
  assert.equal(legacyArranged.length, seeded.length);
});

test('normalizeCanvasSessions backfills legacy localStorage entries cleanly including Dots fields', () => {
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
  assert.equal(normalized[0].autonomyMode, 'manual');
  assert.equal(normalized[0].sandboxEnv, 'cloud-sandbox');
  assert.ok(normalized[0].skills.length > 0);

  const migrated = normalizeCanvasSessions([
    {
      id: 'legacy-duet-1',
      channelId: 'what-being-done-2',
      hermesSessionId: 'duet-channel-what-being-done-2',
      name: 'what-being-done-2',
      autonomyMode: 'watch',
      scheduleLabel: 'Continuous watch',
    },
  ]);
  assert.equal(migrated[0].hermesSessionId, 'hermes-what-being-done-2');
  assert.equal(migrated[0].autonomyMode, 'watch');
  assert.equal(isDotAutonomous(migrated[0]), true);
});

test('viewport zoom and pan helpers clamp cleanly and preserve cursor anchor point', () => {
  assert.equal(clampCanvasZoom(0.1), CANVAS_ZOOM_BOUNDS.min);
  assert.equal(clampCanvasZoom(4.2), CANVAS_ZOOM_BOUNDS.max);
  assert.equal(clampCanvasZoom(NaN), 1);

  const panClamped = clampCanvasPan(2000, -2000, 1);
  assert.equal(panClamped.panX, 420);
  assert.equal(panClamped.panY, -420);

  // Zooming around stage center should keep pan at (0, 0)
  const centerZoom = zoomViewportAroundPoint(DEFAULT_CANVAS_VIEWPORT, 1.3, 500, 300, 1000, 600);
  assert.equal(centerZoom.zoom, 1.3);
  assert.equal(centerZoom.panX, 0);
  assert.equal(centerZoom.panY, 0);

  // Zooming around top-left should shift pan positive to keep top-left content anchored
  const cornerZoom = zoomViewportAroundPoint(DEFAULT_CANVAS_VIEWPORT, 1.2, 100, 100, 1000, 600);
  assert.ok(cornerZoom.panX > 0 && cornerZoom.panY > 0);
});

test('filterCanvasSessions, formatters, templates, and Berd workspace pins behave deterministically', () => {
  const seeded = createSeedCanvasSessions(INITIAL_CHANNELS);
  const autoOnly = filterCanvasSessions(seeded, 'autonomous', {});
  assert.ok(autoOnly.every((s) => s.autonomyMode !== 'manual'));
  assert.ok(autoOnly.length >= 1);

  const liveOnly = filterCanvasSessions(seeded, 'live', { [seeded[0].channelId]: true });
  assert.equal(liveOnly.length, 1);
  assert.equal(liveOnly[0].channelId, seeded[0].channelId);

  assert.equal(formatAutonomyLabel('manual', 'On-demand'), 'On-demand');
  assert.equal(formatAutonomyLabel('scheduled', 'Every 15m', true), 'Every 15m (paused)');
  assert.equal(formatSandboxLabel('local-repo'), 'Local Repo');
  assert.ok(DOT_STARTER_TEMPLATES.length >= 4);

  const pins = createSeedCanvasPins();
  assert.ok(pins.length >= 2);
  const normPins = normalizeCanvasPins([
    ...pins,
    { id: 'custom-note', kind: 'note', title: 'Audit', xPct: 2, yPct: 99 },
  ]);
  assert.equal(normPins.length, pins.length + 1);
  const lastPin = normPins[normPins.length - 1];
  assert.equal(lastPin.xPct, 10);
  assert.equal(lastPin.yPct, 82);

  const pinSpot = findOpenPinSpot(seeded, pins);
  assert.ok(pinSpot.xPct >= 10 && pinSpot.xPct <= 90);
});
