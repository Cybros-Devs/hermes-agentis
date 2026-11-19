export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'strong'; children: InlineToken[] }
  | { type: 'em'; children: InlineToken[] }
  | { type: 'strike'; children: InlineToken[] }
  | { type: 'link'; label: string; href: string };

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; tokens: InlineToken[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'ul'; items: InlineToken[][] }
  | { type: 'ol'; start: number; items: InlineToken[][] }
  | { type: 'blockquote'; lines: InlineToken[][] }
  | { type: 'hr' }
  | { type: 'paragraph'; lines: InlineToken[][] };

const SAFE_LINK_RE = /^https?:\/\/[^\s<>()]+$/i;

export function sanitizeHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!SAFE_LINK_RE.test(trimmed)) return null;
  return trimmed;
}

const INLINE_PATTERN_SOURCE =
  '(`[^`\\n]+`)|(\\[([^\\]\\n]+)\\]\\((https?:\\/\\/[^\\s)]+)\\))|(\\*\\*([^*\\n]+)\\*\\*)|(~~([^~\\n]+)~~)|(\\*([^*\\n]+)\\*)|(https?:\\/\\/[^\\s<>()]+)';

export function parseInlineMarkdown(input: string, depth = 0): InlineToken[] {
  if (!input) return [];
  if (depth > 3) return [{ type: 'text', text: input }];

  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  const pattern = new RegExp(INLINE_PATTERN_SOURCE, 'g');

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: input.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      tokens.push({ type: 'code', text: match[1].slice(1, -1) });
    } else if (match[2] && match[3] && match[4]) {
      const safe = sanitizeHref(match[4]);
      if (safe) {
        tokens.push({ type: 'link', label: match[3], href: safe });
      } else {
        tokens.push({ type: 'text', text: match[0] });
      }
    } else if (match[5] && match[6]) {
      tokens.push({
        type: 'strong',
        children: parseInlineMarkdown(match[6], depth + 1),
      });
    } else if (match[7] && match[8]) {
      tokens.push({
        type: 'strike',
        children: parseInlineMarkdown(match[8], depth + 1),
      });
    } else if (match[9] && match[10]) {
      tokens.push({
        type: 'em',
        children: parseInlineMarkdown(match[10], depth + 1),
      });
    } else if (match[11]) {
      const cleaned = match[11].replace(/[.,;:!?]+$/, '');
      const trailing = match[11].slice(cleaned.length);
      const safe = sanitizeHref(cleaned);
      if (safe) {
        tokens.push({ type: 'link', label: cleaned, href: safe });
        if (trailing) {
          tokens.push({ type: 'text', text: trailing });
        }
      } else {
        tokens.push({ type: 'text', text: match[0] });
      }
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < input.length) {
    tokens.push({ type: 'text', text: input.slice(lastIndex) });
  }

  return tokens;
}

const HEADING_RE = /^(#{1,4})\s+(.+)$/;
const FENCE_RE = /^```([a-zA-Z0-9_+#.-]*)\s*$/;
const HR_RE = /^(-{3,}|\*{3,}|_{3,})\s*$/;
const UL_RE = /^\s*[-*•]\s+(.+)$/;
const OL_RE = /^\s*(\d+)[.)]\s+(.+)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;

function isBlockBoundary(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  return (
    FENCE_RE.test(trimmed) ||
    HEADING_RE.test(trimmed) ||
    HR_RE.test(trimmed) ||
    UL_RE.test(line) ||
    OL_RE.test(line) ||
    QUOTE_RE.test(line)
  );
}

/**
 * Parses Hermes Agent assistant replies into structured blocks (headings,
 * fenced code blocks, bullet/numbered lists, blockquotes, paragraphs) while
 * gracefully handling unclosed streaming fences.
 */
export function parseThreadMarkdown(raw: string): MarkdownBlock[] {
  const normalized = raw.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: MarkdownBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const fenceMatch = FENCE_RE.exec(trimmed);
    if (fenceMatch) {
      const language = fenceMatch[1] || '';
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && /^```\s*$/.test(lines[i].trim())) {
        i += 1;
      }
      blocks.push({
        type: 'code',
        language,
        code: codeLines.join('\n'),
      });
      continue;
    }

    if (HR_RE.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    const headingMatch = HEADING_RE.exec(trimmed);
    if (headingMatch) {
      const level = Math.min(4, Math.max(1, headingMatch[1].length)) as 1 | 2 | 3 | 4;
      blocks.push({
        type: 'heading',
        level,
        tokens: parseInlineMarkdown(headingMatch[2].trim()),
      });
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoteLines: InlineToken[][] = [];
      while (i < lines.length) {
        const qm = QUOTE_RE.exec(lines[i]);
        if (!qm) break;
        quoteLines.push(parseInlineMarkdown(qm[1]));
        i += 1;
      }
      blocks.push({ type: 'blockquote', lines: quoteLines });
      continue;
    }

    if (UL_RE.test(line)) {
      const items: InlineToken[][] = [];
      while (i < lines.length) {
        const um = UL_RE.exec(lines[i]);
        if (!um) break;
        items.push(parseInlineMarkdown(um[1]));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    const firstOl = OL_RE.exec(line);
    if (firstOl) {
      const start = Math.max(1, Number.parseInt(firstOl[1], 10) || 1);
      const items: InlineToken[][] = [];
      while (i < lines.length) {
        const om = OL_RE.exec(lines[i]);
        if (!om) break;
        items.push(parseInlineMarkdown(om[2]));
        i += 1;
      }
      blocks.push({ type: 'ol', start, items });
      continue;
    }

    const paraLines: InlineToken[][] = [];
    while (i < lines.length && !isBlockBoundary(lines[i])) {
      paraLines.push(parseInlineMarkdown(lines[i]));
      i += 1;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', lines: paraLines });
    } else {
      i += 1;
    }
  }

  return blocks;
}

const RICH_SYNTAX_RE =
  /(^|\n)\s*(#{1,4}\s|```|[-*•]\s|\d+[.)]\s|>\s|---)|`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/|https?:\/\/[^\s<>()]+/;

/**
 * Returns true when an assistant reply contains structured Markdown syntax
 * (code fences, lists, headings, inline code, bold, links, or multi-paragraph breaks).
 */
export function hasRichMarkdownSyntax(text: string): boolean {
  if (!text) return false;
  if (text.includes('\n\n')) return true;
  return RICH_SYNTAX_RE.test(text);
}
