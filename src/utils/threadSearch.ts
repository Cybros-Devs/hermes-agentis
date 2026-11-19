import type { TerminalEntry } from '../types/hermes';
import type { ClassifiedTraceStep } from './threadTrace';

/**
 * Returns ordered matching entry IDs for an in-thread search query.
 */
export function findMatchingThreadEntryIds(
  entries: readonly TerminalEntry[],
  rawQuery: string
): string[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  const matches: string[] = [];
  for (const entry of entries) {
    if (entry.role === 'activity') continue;
    if (entry.text.toLowerCase().includes(query)) {
      matches.push(entry.id);
    }
  }
  return matches;
}

/**
 * Wraps match index navigation forward or backward through search hits.
 */
export function stepMatchIndex(
  current: number,
  total: number,
  direction: 'next' | 'prev'
): number {
  if (total <= 0) return -1;
  if (current < 0 || current >= total) {
    return direction === 'next' ? 0 : total - 1;
  }
  return direction === 'next' ? (current + 1) % total : (current - 1 + total) % total;
}

/**
 * Produces a concise, high-signal single-line summary for a collapsed
 * ThreadTraceTree header so users see live tool activity without expanding.
 */
export function summarizeTraceHeader(
  items: readonly ClassifiedTraceStep[],
  isLive: boolean
): string {
  if (items.length === 0) {
    return isLive ? 'Running' : '';
  }

  const latest = items[items.length - 1];
  const countLabel = `${items.length} ${items.length === 1 ? 'step' : 'steps'}`;

  if (isLive && latest) {
    const cleanLatest = latest.label.length > 26 ? `${latest.label.slice(0, 25)}…` : latest.label;
    return `${countLabel} · ${cleanLatest}`;
  }

  const toolCount = items.filter((s) => s.icon === 'tool').length;
  const hasReasoning = items.some((s) => s.icon === 'reasoning' || s.isReasoning);
  const parts = [countLabel];
  if (toolCount > 0) {
    parts.push(`${toolCount} ${toolCount === 1 ? 'tool' : 'tools'}`);
  }
  if (hasReasoning) {
    parts.push('reasoning');
  }
  return parts.join(' · ');
}

/**
 * Formats the active Thread conversation as clean Markdown for clipboard export.
 */
export function formatThreadTranscriptMarkdown(params: {
  title: string;
  sessionId: string;
  profile?: string;
  model?: string;
  entries: readonly TerminalEntry[];
}): string {
  const headerLines = [
    `# ${params.title || params.sessionId}`,
    `Session: \`${params.sessionId}\`${params.profile ? ` · @${params.profile}` : ''}${
      params.model ? ` · ${params.model}` : ''
    }`,
    '',
  ];

  const bodyLines: string[] = [];
  for (const entry of params.entries) {
    if (entry.role === 'activity') continue;
    const text = entry.text.trim();
    if (!text) continue;
    const speaker =
      entry.role === 'user'
        ? 'User'
        : entry.role === 'command'
        ? 'Command'
        : entry.role === 'hermes'
        ? 'Hermes'
        : 'System';
    const stamp = entry.timestamp ? ` (${entry.timestamp})` : '';
    bodyLines.push(`### ${speaker}${stamp}`);
    bodyLines.push(entry.role === 'command' ? `\`${text}\`` : text);
    bodyLines.push('');
  }

  return [...headerLines, ...bodyLines].join('\n').trim() + '\n';
}

/**
 * Finds the nearest preceding user prompt text for a given assistant reply
 * index so users can retry any specific turn directly from the thread.
 */
export function findPrecedingUserPrompt(
  entries: readonly TerminalEntry[],
  entryId: string
): string {
  const idx = entries.findIndex((e) => e.id === entryId);
  if (idx <= 0) return '';
  for (let i = idx - 1; i >= 0; i -= 1) {
    const candidate = entries[i];
    if ((candidate.role === 'user' || candidate.role === 'command') && candidate.text.trim()) {
      return candidate.text.trim();
    }
  }
  return '';
}
