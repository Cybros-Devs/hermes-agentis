import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasRichMarkdownSyntax,
  parseInlineMarkdown,
  parseThreadMarkdown,
  sanitizeHref,
} from './threadMarkdown';

test('parseThreadMarkdown parses headings, lists, code fences, and blockquotes', () => {
  const sample = [
    '### Deployment Status',
    '',
    '- PR #395: **group rooms** failing `abortMemberTurn`',
    '- PR #392: green & mergeable',
    '',
    '1. Fix abort test',
    '2. Run `npm run gate`',
    '',
    '```bash',
    'gh run view 44009826',
    '```',
    '',
    '> Ready when you say the word.',
  ].join('\n');

  const blocks = parseThreadMarkdown(sample);
  assert.equal(blocks.length, 5);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[1].type, 'ul');
  if (blocks[1].type === 'ul') {
    assert.equal(blocks[1].items.length, 2);
  }
  assert.equal(blocks[2].type, 'ol');
  if (blocks[2].type === 'ol') {
    assert.equal(blocks[2].start, 1);
    assert.equal(blocks[2].items.length, 2);
  }
  assert.equal(blocks[3].type, 'code');
  if (blocks[3].type === 'code') {
    assert.equal(blocks[3].language, 'bash');
    assert.equal(blocks[3].code, 'gh run view 44009826');
  }
  assert.equal(blocks[4].type, 'blockquote');
});

test('parseThreadMarkdown handles unclosed streaming code fences gracefully', () => {
  const blocks = parseThreadMarkdown('```ts\nconst ok = true;');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'code');
  if (blocks[0].type === 'code') {
    assert.equal(blocks[0].language, 'ts');
    assert.equal(blocks[0].code, 'const ok = true;');
  }
});

test('parseInlineMarkdown parses code, bold, italic, links, and strips unsafe schemes', () => {
  const tokens = parseInlineMarkdown(
    'Check `src/App.tsx`, **important** note, and [docs](https://example.com/hermes).'
  );
  assert.ok(tokens.some((t) => t.type === 'code' && t.text === 'src/App.tsx'));
  assert.ok(tokens.some((t) => t.type === 'strong'));
  assert.ok(
    tokens.some(
      (t) => t.type === 'link' && t.label === 'docs' && t.href === 'https://example.com/hermes'
    )
  );
  assert.equal(sanitizeHref('javascript:alert(1)'), null);
  assert.equal(sanitizeHref('https://hermes.local/docs'), 'https://hermes.local/docs');
});

test('hasRichMarkdownSyntax distinguishes simple prose from structured replies', () => {
  assert.equal(hasRichMarkdownSyntax('Checked everything and we are green.'), false);
  assert.equal(hasRichMarkdownSyntax('Line one\n\nLine two'), true);
  assert.equal(hasRichMarkdownSyntax('- PR #395 ready'), true);
  assert.equal(hasRichMarkdownSyntax('Run `npm test` now'), true);
});
