export type ThreadTasksDockMode = 'split' | 'overlay';

export type CanvasPopoverAlign = 'left' | 'center' | 'right';

export type StageHeaderSize = 'full' | 'compact' | 'strip';

/**
 * Threshold in px of the center workspace stage (`ascii-stage`) needed
 * to dock the 312–328px Thread Tasks sidebar side-by-side without
 * squishing the transcript column below ~560px.
 */
export const THREAD_SPLIT_MIN_STAGE_WIDTH = 900;

export function resolveThreadTasksLayoutMode(
  stageWidthPx: number | null | undefined,
  isDesktopLg: boolean
): ThreadTasksDockMode {
  if (!isDesktopLg) return 'overlay';
  if (typeof stageWidthPx !== 'number' || !Number.isFinite(stageWidthPx) || stageWidthPx <= 0) {
    return 'overlay';
  }
  return stageWidthPx >= THREAD_SPLIT_MIN_STAGE_WIDTH ? 'split' : 'overlay';
}

/**
 * Computes horizontal alignment for a Dot's floating 308px popover on `sm+`
 * spatial canvases so dots placed near the left or right edge never clip
 * outside the canvas container.
 */
export function computeCanvasPopoverAlignment(xPct: number): CanvasPopoverAlign {
  if (!Number.isFinite(xPct)) return 'center';
  if (xPct < 24) return 'left';
  if (xPct > 76) return 'right';
  return 'center';
}

/**
 * Chooses how tall the desktop top-center portrait header should be so
 * Thread, Queue, and CLI views keep generous vertical scroll space on
 * shorter screens (e.g. 1024x768 or 1280x720) without sacrificing
 * character presence on taller monitors.
 */
export function resolveStageHeaderSize(params: {
  panelView: 'home' | 'canvas' | 'voice' | 'queue' | 'cli';
  viewportHeightPx: number;
}): StageHeaderSize {
  const { panelView, viewportHeightPx } = params;
  if (panelView === 'home') return 'full';
  if (panelView === 'canvas') return 'strip';
  if (panelView === 'queue' || panelView === 'cli') {
    return viewportHeightPx >= 860 ? 'compact' : 'strip';
  }
  // Thread view: keep compact portrait on >=780px height, slim strip on very short windows
  return viewportHeightPx >= 700 ? 'compact' : 'strip';
}
