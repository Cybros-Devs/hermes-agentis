import type { TerminalEntry } from '../types/hermes';
import { dedupeActivityEntries } from './taskInsights';

export type TraceStepIcon = 'reasoning' | 'commentary' | 'spawn' | 'tool' | 'link' | 'status';

export interface ClassifiedTraceStep {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  icon: TraceStepIcon;
  isReasoning?: boolean;
}

export type ThreadTimelineBlock =
  | { kind: 'entry'; id: string; entry: TerminalEntry }
  | {
      kind: 'trace';
      id: string;
      items: ClassifiedTraceStep[];
      isLive: boolean;
    };

export function classifyTraceStep(entry: TerminalEntry): ClassifiedTraceStep {
  const raw = entry.text.trim();
  const lower = raw.toLowerCase();

  if (entry.activityKind === 'reasoning') {
    const detail = (entry.reasoningDetail ?? raw.replace(/^reasoning\s*[:—-]\s*/i, '')).trim();
    return {
      id: entry.id,
      label: 'Reasoning',
      detail,
      timestamp: entry.timestamp,
      icon: 'reasoning',
      isReasoning: true,
    };
  }

  if (entry.activityKind === 'commentary') {
    const detail = raw.replace(/^commentary\s*[:—-]\s*/i, '').trim();
    return {
      id: entry.id,
      label: 'Commentary',
      detail,
      timestamp: entry.timestamp,
      icon: 'commentary',
    };
  }

  let icon: TraceStepIcon = 'status';
  if (entry.activityKind === 'subagent') {
    icon = 'spawn';
  } else if (entry.activityKind === 'tool') {
    icon = 'tool';
  } else if (lower.startsWith('reasoning:') || lower.startsWith('reasoning —')) {
    icon = 'reasoning';
  } else if (lower.includes('spawn') || lower.includes('agent') || lower.includes('session')) {
    icon = 'spawn';
  } else if (
    lower.includes('link') ||
    lower.includes('http') ||
    lower.includes('tab') ||
    lower.includes('mcp') ||
    lower.includes('gateway')
  ) {
    icon = 'link';
  } else if (
    lower.includes('run') ||
    lower.includes('exec') ||
    lower.includes('tool') ||
    lower.includes('read') ||
    lower.includes('write') ||
    lower.includes('search') ||
    lower.includes('brief')
  ) {
    icon = 'tool';
  }

  // Split concise label vs trailing detail around colon or em-dash when present
  const colonIdx = raw.indexOf(':');
  const dashIdx = raw.indexOf(' — ');
  let label = raw;
  let detail = '';

  if (colonIdx > 2 && colonIdx < 28) {
    label = raw.slice(0, colonIdx).trim();
    detail = raw.slice(colonIdx + 1).trim();
  } else if (dashIdx > 2 && dashIdx < 28) {
    label = raw.slice(0, dashIdx).trim();
    detail = raw.slice(dashIdx + 3).trim();
  } else {
    const statusMatch = raw.match(
      /^(.+?)\s+(completed|complete|done|finished|running|started|failed|error|cancelled|interrupted)$/i
    );
    if (statusMatch) {
      label = statusMatch[1].trim();
      detail = statusMatch[2].toLowerCase();
    }
  }

  return {
    id: entry.id,
    label: label || 'Activity',
    detail,
    timestamp: entry.timestamp,
    icon,
    isReasoning: icon === 'reasoning',
  };
}

export function isTerminalDiagnosticActivity(entry: TerminalEntry): boolean {
  if (entry.role !== 'activity') return false;
  if (
    entry.activityKind === 'tool' ||
    entry.activityKind === 'reasoning' ||
    entry.activityKind === 'subagent' ||
    entry.activityKind === 'commentary'
  ) {
    return false;
  }
  return Boolean(
    entry.errorCode ||
      entry.terminalOutcome === 'failed' ||
      entry.terminalOutcome === 'cancelled' ||
      entry.terminalOutcome === 'admission_conflict' ||
      entry.activityStatus === 'error'
  );
}

export interface CoalescedTraceStep extends ClassifiedTraceStep {
  repeatCount: number;
}

/**
 * Collapses consecutive identical completed tool/link/status steps (such as
 * repeated "terminal completed" entries) into one row with a repeat count
 * and latest timestamp while leaving reasoning/commentary steps unmerged.
 */
export function coalesceConsecutiveSteps(
  steps: readonly ClassifiedTraceStep[]
): CoalescedTraceStep[] {
  const result: CoalescedTraceStep[] = [];
  for (const step of steps) {
    const prev = result[result.length - 1];
    const canMerge =
      prev &&
      !step.isReasoning &&
      !prev.isReasoning &&
      step.icon !== 'commentary' &&
      prev.icon !== 'commentary' &&
      prev.icon === step.icon &&
      prev.label.toLowerCase() === step.label.toLowerCase() &&
      prev.detail.toLowerCase() === step.detail.toLowerCase();

    if (canMerge) {
      prev.repeatCount += 1;
      if (step.timestamp) {
        prev.timestamp = step.timestamp;
      }
    } else {
      result.push({ ...step, repeatCount: 1 });
    }
  }
  return result;
}

function isTurnBoundaryEntry(entry: TerminalEntry): boolean {
  return (
    entry.role === 'user' ||
    entry.role === 'command' ||
    entry.role === 'system' ||
    isTerminalDiagnosticActivity(entry)
  );
}

/**
 * Groups consecutive `activity` entries into collapsible vertical trace trees
 * and optionally attaches the live thinking state to the trailing trace tree.
 *
 * Within each conversational turn (delimited by user/command/system/diagnostic
 * boundaries), non-diagnostic activity steps are always ordered before that turn's
 * assistant reply so streaming text is never rendered above its own tool activity.
 * Once the trailing turn already has non-empty streamed reply text, no dangling
 * "Activity · Running" placeholder is emitted below the streamed message.
 */
export function groupThreadTimeline(
  entries: TerminalEntry[],
  isThinking: boolean,
  includeLivePlaceholder = true
): ThreadTimelineBlock[] {
  const blocks: ThreadTimelineBlock[] = [];

  type TurnSegment = {
    boundary: TerminalEntry | null;
    activities: TerminalEntry[];
    replies: TerminalEntry[];
  };

  const segments: TurnSegment[] = [];
  let current: TurnSegment = { boundary: null, activities: [], replies: [] };

  for (const entry of entries) {
    if (isTurnBoundaryEntry(entry)) {
      if (
        current.boundary !== null ||
        current.activities.length > 0 ||
        current.replies.length > 0
      ) {
        segments.push(current);
      }
      current = { boundary: entry, activities: [], replies: [] };
    } else if (entry.role === 'activity') {
      current.activities.push(entry);
    } else {
      current.replies.push(entry);
    }
  }

  if (
    current.boundary !== null ||
    current.activities.length > 0 ||
    current.replies.length > 0
  ) {
    segments.push(current);
  }

  for (let idx = 0; idx < segments.length; idx++) {
    const seg = segments[idx];
    const isLastSegment = idx === segments.length - 1;
    if (seg.boundary) {
      blocks.push({
        kind: 'entry',
        id: seg.boundary.id,
        entry: seg.boundary,
      });
    }

    const deduped = dedupeActivityEntries(seg.activities);
    const hasNonEmptyReply = seg.replies.some((r) => r.text.trim().length > 0);
    const hasRunningTool = deduped.some((a) => a.activityStatus === 'running');
    const liveForSegment =
      isLastSegment && isThinking && (!hasNonEmptyReply || hasRunningTool);

    if (deduped.length > 0 || (liveForSegment && includeLivePlaceholder)) {
      blocks.push({
        kind: 'trace',
        id: deduped.length > 0 ? `trace-${deduped[0].id}` : 'trace-live',
        items: deduped.map(classifyTraceStep),
        isLive: liveForSegment,
      });
    }

    for (const reply of seg.replies) {
      blocks.push({
        kind: 'entry',
        id: reply.id,
        entry: reply,
      });
    }
  }

  if (segments.length === 0 && isThinking && includeLivePlaceholder) {
    blocks.push({
      kind: 'trace',
      id: 'trace-live',
      items: [],
      isLive: true,
    });
  }

  return blocks;
}
