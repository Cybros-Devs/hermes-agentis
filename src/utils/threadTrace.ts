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

/**
 * Groups consecutive `activity` entries into collapsible vertical trace trees
 * and optionally attaches the live thinking state to the trailing trace tree.
 * Terminal diagnostic entries (e.g. gateway_offline, cancelled, admission_conflict)
 * stay standalone entry blocks so failure badges remain visible even in Clean mode.
 */
export function groupThreadTimeline(
  entries: TerminalEntry[],
  isThinking: boolean,
  includeLivePlaceholder = true
): ThreadTimelineBlock[] {
  const blocks: ThreadTimelineBlock[] = [];
  let pendingRaw: TerminalEntry[] = [];
  let pendingFirstId = '';

  const flushTrace = (live: boolean) => {
    const deduped = dedupeActivityEntries(pendingRaw);
    if (deduped.length === 0 && !live) {
      pendingRaw = [];
      pendingFirstId = '';
      return;
    }
    blocks.push({
      kind: 'trace',
      id: pendingFirstId || 'trace-live',
      items: deduped.map(classifyTraceStep),
      isLive: live,
    });
    pendingRaw = [];
    pendingFirstId = '';
  };

  for (const entry of entries) {
    if (entry.role === 'activity' && !isTerminalDiagnosticActivity(entry)) {
      if (pendingRaw.length === 0) {
        pendingFirstId = `trace-${entry.id}`;
      }
      pendingRaw.push(entry);
    } else {
      flushTrace(false);
      blocks.push({
        kind: 'entry',
        id: entry.id,
        entry,
      });
    }
  }

  if (pendingRaw.length > 0 || (isThinking && includeLivePlaceholder)) {
    flushTrace(isThinking);
  }

  return blocks;
}
