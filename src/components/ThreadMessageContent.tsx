import { Fragment, useState, type ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import {
  hasRichMarkdownSyntax,
  parseThreadMarkdown,
  type InlineToken,
} from '../utils/threadMarkdown';
import { DecodedText } from './DecodedText';

interface ThreadMessageContentProps {
  text: string;
  animateDecode?: boolean;
  isErrorDiagnostic?: boolean;
  highlightQuery?: string;
}

export function renderHighlightedText(text: string, query: string): ReactNode {
  const clean = query.trim();
  if (!clean) return text;
  const lowerText = text.toLowerCase();
  const lowerQuery = clean.toLowerCase();
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let matchIdx = lowerText.indexOf(lowerQuery, cursor);
  let keyIdx = 0;

  while (matchIdx !== -1) {
    if (matchIdx > cursor) {
      nodes.push(text.slice(cursor, matchIdx));
    }
    nodes.push(
      <mark
        key={`hl-${keyIdx++}`}
        className="rounded px-0.5 bg-amber-300/25 text-amber-100 border border-amber-300/35"
      >
        {text.slice(matchIdx, matchIdx + clean.length)}
      </mark>
    );
    cursor = matchIdx + clean.length;
    matchIdx = lowerText.indexOf(lowerQuery, cursor);
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return nodes.length > 0 ? nodes : text;
}

function renderInlineTokens(tokens: InlineToken[], highlightQuery: string): ReactNode {
  return tokens.map((token, idx) => {
    switch (token.type) {
      case 'text':
        return (
          <Fragment key={idx}>
            {renderHighlightedText(token.text, highlightQuery)}
          </Fragment>
        );
      case 'code':
        return (
          <code
            key={idx}
            className="font-mono text-[12.5px] px-1.5 py-0.5 rounded-md bg-white/[0.07] border border-white/[0.09] text-zinc-100 break-words"
          >
            {renderHighlightedText(token.text, highlightQuery)}
          </code>
        );
      case 'strong':
        return (
          <strong key={idx} className="font-semibold text-white">
            {renderInlineTokens(token.children, highlightQuery)}
          </strong>
        );
      case 'em':
        return (
          <em key={idx} className="italic text-zinc-200">
            {renderInlineTokens(token.children, highlightQuery)}
          </em>
        );
      case 'strike':
        return (
          <del key={idx} className="line-through text-zinc-400">
            {renderInlineTokens(token.children, highlightQuery)}
          </del>
        );
      case 'link':
        return (
          <a
            key={idx}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--ui-accent-soft)] hover:text-white underline underline-offset-4 decoration-white/30 break-all transition-colors"
          >
            {renderHighlightedText(token.label, highlightQuery)}
          </a>
        );
      default:
        return null;
    }
  });
}

function CodeBlockCard({
  language,
  code,
  highlightQuery,
}: {
  language: string;
  code: string;
  highlightQuery: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(code).catch(() => {});
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      data-testid="thread-code-block"
      className="my-2 rounded-xl border border-white/[0.10] bg-[#0C0E14]/92 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/[0.07] bg-white/[0.025]">
        <span className="font-mono text-[10.5px] text-zinc-400">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code block"
          className="ui-tactile inline-flex items-center gap-1 font-mono text-[10.5px] text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-[var(--ui-accent-soft)]" />
              <span className="text-[var(--ui-accent-soft)]">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto cyber-scroll font-mono text-[12px] leading-[1.6] text-zinc-100">
        <code>{renderHighlightedText(code, highlightQuery)}</code>
      </pre>
    </div>
  );
}

export function ThreadMessageContent({
  text,
  animateDecode = false,
  isErrorDiagnostic = false,
  highlightQuery = '',
}: ThreadMessageContentProps) {
  const cleanQuery = highlightQuery.trim();
  const useStructured = !isErrorDiagnostic && (hasRichMarkdownSyntax(text) || cleanQuery.length > 0);

  if (!useStructured) {
    return (
      <p
        className={`text-[14.5px] sm:text-[15px] leading-[1.68] font-normal whitespace-pre-wrap break-words ${
          isErrorDiagnostic ? 'text-rose-100/95' : 'text-[#F1F5F9]'
        }`}
      >
        {cleanQuery ? (
          renderHighlightedText(text, cleanQuery)
        ) : (
          <DecodedText text={text} animate={animateDecode} />
        )}
      </p>
    );
  }

  const blocks = parseThreadMarkdown(text);

  return (
    <div
      data-testid="thread-markdown-content"
      className="space-y-2.5 text-[14.5px] sm:text-[15px] leading-[1.68] font-normal text-[#F1F5F9] break-words"
    >
      {blocks.map((block, bIdx) => {
        if (block.type === 'heading') {
          const headingClass =
            block.level === 1
              ? 'text-[17px] font-semibold text-white tracking-tight pt-1'
              : block.level === 2
              ? 'text-[15.5px] font-semibold text-white tracking-tight pt-1'
              : 'text-[14.5px] font-semibold text-zinc-100 pt-0.5';
          return (
            <div key={bIdx} className={headingClass}>
              {renderInlineTokens(block.tokens, cleanQuery)}
            </div>
          );
        }

        if (block.type === 'code') {
          return (
            <CodeBlockCard
              key={bIdx}
              language={block.language}
              code={block.code}
              highlightQuery={cleanQuery}
            />
          );
        }

        if (block.type === 'hr') {
          return <hr key={bIdx} className="border-white/[0.08] my-2" />;
        }

        if (block.type === 'blockquote') {
          return (
            <div
              key={bIdx}
              className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[13.5px] text-zinc-300 space-y-1"
            >
              {block.lines.map((lineTokens, lIdx) => (
                <p key={lIdx}>{renderInlineTokens(lineTokens, cleanQuery)}</p>
              ))}
            </div>
          );
        }

        if (block.type === 'ul') {
          return (
            <ul key={bIdx} className="space-y-1.5 pl-4 list-disc marker:text-zinc-500">
              {block.items.map((itemTokens, iIdx) => (
                <li key={iIdx} className="pl-1">
                  {renderInlineTokens(itemTokens, cleanQuery)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol
              key={bIdx}
              start={block.start}
              className="space-y-1.5 pl-5 list-decimal marker:text-zinc-400 marker:font-mono marker:text-[12.5px] tabular-nums"
            >
              {block.items.map((itemTokens, iIdx) => (
                <li key={iIdx} className="pl-1">
                  {renderInlineTokens(itemTokens, cleanQuery)}
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={bIdx} className="whitespace-pre-wrap">
            {block.lines.map((lineTokens, lIdx) => (
              <Fragment key={lIdx}>
                {lIdx > 0 && <br />}
                {renderInlineTokens(lineTokens, cleanQuery)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
