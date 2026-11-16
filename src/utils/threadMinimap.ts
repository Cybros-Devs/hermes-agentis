import type { TerminalEntry } from '../types/hermes';
import type { ThreadTimelineBlock } from './threadTrace';

export type MinimapTurnStatus = 'done' | 'live' | 'error' | 'cancelled' | 'budget';

export interface ThreadMinimapTurn {
  id: string;
  anchorId: string;
  turnNumber: number;
  title: string;
  snippet: string;
  timestamp: string;
  stepCount: number;
  hasReasoning: boolean;
  status: MinimapTurnStatus;
}

export interface MinimapAnchorRect {
  id: string;
  top: number;
  height: number;
}

/**
 * Strips light markdown syntax and collapses whitespace into a crisp, readable
 * single-paragraph preview suitable for floating turn cards.
 */
export function cleanMarkdownSnippet(raw: string, maxChars = 190): string {
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim()
    )
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;

  const slice = cleaned.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  const cutoff = lastSpace >= Math.floor(maxChars * 0.6) ? lastSpace : maxChars;
  return `${slice.slice(0, cutoff).trimEnd()}…`;
}

function resolveStatusFromEntry(
  entry: TerminalEntry,
  prevStatus: MinimapTurnStatus
): MinimapTurnStatus {
  if (entry.terminalOutcome === 'iteration_budget_exhausted') return 'budget';
  if (entry.terminalOutcome === 'cancelled' || entry.terminalOutcome === 'interrupted') {
    return 'cancelled';
  }
  if (
    entry.errorCode === 'gateway_offline' ||
    entry.terminalOutcome === 'failed' ||
    entry.terminalOutcome === 'admission_conflict'
  ) {
    return 'error';
  }
  if (entry.streaming) return 'live';
  return prevStatus === 'error' || prevStatus === 'cancelled' || prevStatus === 'budget'
    ? prevStatus
    : 'done';
}

function finalizeTurn(draft: {
  id: string;
  anchorId: string;
  turnNumber: number;
  title: string;
  replyParts: string[];
  timestamp: string;
  stepCount: number;
  hasReasoning: boolean;
  status: MinimapTurnStatus;
}): ThreadMinimapTurn {
  const joinedReply = cleanMarkdownSnippet(draft.replyParts.join(' '), 190);
  let snippet = joinedReply;
  if (!snippet) {
    if (draft.status === 'live') {
      snippet =
        draft.stepCount > 0
          ? `Running · ${draft.stepCount} ${draft.stepCount === 1 ? 'step' : 'steps'}`
          : 'Thinking…';
    } else if (draft.status === 'cancelled') {
      snippet = 'Run cancelled before final output.';
    } else if (draft.status === 'error') {
      snippet = 'Turn ended with an error.';
    } else if (draft.stepCount > 0) {
      snippet = `${draft.stepCount} activity ${draft.stepCount === 1 ? 'step' : 'steps'}`;
    } else {
      snippet = 'Awaiting response';
    }
  }

  return {
    id: draft.id,
    anchorId: draft.anchorId,
    turnNumber: draft.turnNumber,
    title: draft.title,
    snippet,
    timestamp: draft.timestamp,
    stepCount: draft.stepCount,
    hasReasoning: draft.hasReasoning,
    status: draft.status,
  };
}

/**
 * Extracts navigable conversation turns from grouped timeline blocks so the
 * left-edge minimap rail mirrors every prompt/response turn 1:1.
 */
export function extractThreadMinimapTurns(
  blocks: ThreadTimelineBlock[]
): ThreadMinimapTurn[] {
  if (blocks.length === 0) return [];

  const hasUserPrompt = blocks.some(
    (b) => b.kind === 'entry' && (b.entry.role === 'user' || b.entry.role === 'command')
  );

  // When a thread has no user prompts yet, skip bare initial greeting cards unless
  // real activity, streaming output, diagnostics, or multi-message history is present.
  if (!hasUserPrompt) {
    const hasSubstantiveStream = blocks.some(
      (b) =>
        b.kind === 'trace' ||
        (b.kind === 'entry' &&
          (!b.entry.id.startsWith('init-') || Boolean(b.entry.streaming)))
    );
    if (!hasSubstantiveStream) return [];

    const firstAnchor =
      blocks[0].kind === 'entry' ? blocks[0].entry.id : blocks[0].id;
    let stepCount = 0;
    let hasReasoning = false;
    let status: MinimapTurnStatus = 'done';
    let timestamp = '';
    const replyParts: string[] = [];

    for (const block of blocks) {
      if (block.kind === 'trace') {
        stepCount += block.items.length;
        if (block.items.some((s) => s.isReasoning || s.icon === 'reasoning')) {
          hasReasoning = true;
        }
        if (block.isLive) status = 'live';
        if (!timestamp && block.items.length > 0) {
          timestamp = block.items[block.items.length - 1]?.timestamp ?? '';
        }
      } else {
        if (block.entry.text.trim()) replyParts.push(block.entry.text);
        if (block.entry.timestamp) timestamp = block.entry.timestamp;
        status = resolveStatusFromEntry(block.entry, status);
      }
    }

    return [
      finalizeTurn({
        id: `turn-${firstAnchor}`,
        anchorId: firstAnchor,
        turnNumber: 1,
        title: 'Active session',
        replyParts,
        timestamp,
        stepCount,
        hasReasoning,
        status,
      }),
    ];
  }

  const turns: ThreadMinimapTurn[] = [];
  let current: {
    id: string;
    anchorId: string;
    turnNumber: number;
    title: string;
    replyParts: string[];
    timestamp: string;
    stepCount: number;
    hasReasoning: boolean;
    status: MinimapTurnStatus;
  } | null = null;

  for (const block of blocks) {
    if (block.kind === 'entry' && (block.entry.role === 'user' || block.entry.role === 'command')) {
      if (current) {
        turns.push(finalizeTurn(current));
      }
      const nextNum = turns.length + 1;
      current = {
        id: `turn-${block.entry.id}`,
        anchorId: block.entry.id,
        turnNumber: nextNum,
        title: cleanMarkdownSnippet(block.entry.text, 84) || `Turn ${nextNum}`,
        replyParts: [],
        timestamp: block.entry.timestamp,
        stepCount: 0,
        hasReasoning: false,
        status: 'done',
      };
      continue;
    }

    if (!current) continue;

    if (block.kind === 'trace') {
      current.stepCount += block.items.length;
      if (block.items.some((s) => s.isReasoning || s.icon === 'reasoning')) {
        current.hasReasoning = true;
      }
      if (block.isLive) {
        current.status = 'live';
      }
    } else {
      if (block.entry.text.trim()) {
        current.replyParts.push(block.entry.text);
      }
      if (block.entry.timestamp) {
        current.timestamp = block.entry.timestamp;
      }
      current.status = resolveStatusFromEntry(block.entry, current.status);
    }
  }

  if (current) {
    turns.push(finalizeTurn(current));
  }

  return turns;
}

/**
 * Determines which turn tick should appear active given measured DOM offsets and
 * current scroll position inside the Thread scroll container.
 */
export function determineActiveMinimapTurn(
  anchors: MinimapAnchorRect[],
  scrollTop: number,
  viewportHeight: number,
  maxScrollTop: number
): string | null {
  if (anchors.length === 0) return null;
  if (anchors.length === 1) return anchors[0].id;

  if (maxScrollTop > 12 && scrollTop >= maxScrollTop - 24) {
    return anchors[anchors.length - 1].id;
  }
  if (scrollTop <= 8) {
    return anchors[0].id;
  }

  const probeY = scrollTop + Math.min(140, Math.max(48, viewportHeight * 0.28));
  let matched = anchors[0].id;
  for (const anchor of anchors) {
    if (anchor.top <= probeY) {
      matched = anchor.id;
    } else {
      break;
    }
  }
  return matched;
}
