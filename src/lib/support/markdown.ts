/**
 * Lightweight, dependency-free markdown for the support console.
 *
 * Supports the small grammar staff actually use in replies/notes:
 *   **bold**   *italic*   `code`   ![alt](url)   bare URLs (autolinked)   line breaks,
 *   plus the BLOCK grammar a customer-facing reply actually arrives in —
 *   `#`/`##`/`###` headings, `-`/`*`/`1.` lists, `>` blockquotes, `---` rules.
 *
 * Three outputs from one grammar:
 *   - `renderInlineMarkdown(text)` → safe React nodes, one line at a time.
 *   - `renderBlockMarkdown(text)`  → safe React nodes with block structure, on the
 *                                    house type scale (there is no Tailwind
 *                                    typography plugin in this repo, so the block
 *                                    scale is defined ONCE here — never per call
 *                                    site, and never as a `prose` class).
 *   - `markdownToHtml(text)`       → sanitized HTML string for the Zendesk
 *                                    `html_body`, with the SAME block structure, so
 *                                    the customer's email is formatted rather than
 *                                    carrying a literal `###`.
 *
 * All three escape first, then tokenize — there is no `dangerouslySetInnerHTML` and
 * no user input ever reaches the DOM/HTML un-escaped.
 */

import React from 'react';

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'image'; alt: string; url: string }
  | { kind: 'link'; value: string };

type RenderInlineMarkdownOptions = {
  /** When set, image markdown opens the in-app photo viewer instead of a new tab. */
  onOpenPhoto?: (url: string) => void;
};

// Order matters: code first (so ** inside `code` is literal), then images
// (before bare URLs so `![alt](https://…)` is not split), then bold before
// italic (so ** isn't eaten as two * ), then autolinked URLs.
// Optional whitespace after `]` covers paste quirks like `![] (url)`.
const INLINE_RE =
  /(`[^`\n]+`)|(!\[([^\]]*)\]\s*\(([^)\s]+)\))|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)])/g;

/** Split one line of source text into typed inline tokens. */
function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(line)) !== null) {
    if (m.index > last) tokens.push({ kind: 'text', value: line.slice(last, m.index) });
    if (m[1]) tokens.push({ kind: 'code', value: m[1].slice(1, -1) });
    else if (m[2]) tokens.push({ kind: 'image', alt: m[3] ?? '', url: m[4] ?? '' });
    else if (m[5]) tokens.push({ kind: 'bold', value: m[5].slice(2, -2) });
    else if (m[6]) tokens.push({ kind: 'italic', value: m[6].slice(1, -1) });
    else if (m[7]) tokens.push({ kind: 'link', value: m[7] });
    last = m.index + m[0].length;
  }
  if (last < line.length) tokens.push({ kind: 'text', value: line.slice(last) });
  return tokens;
}

function linkHref(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function looksLikeImageUrl(url: string): boolean {
  return /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.test(url) || /\/attachments\//i.test(url);
}

function imageLabel(alt: string): string {
  const trimmed = alt.trim();
  return trimmed || 'Image';
}

/** Render inline markdown to safe React nodes (used in the chat thread). */
export function renderInlineMarkdown(
  text: string,
  options?: RenderInlineMarkdownOptions,
): React.ReactNode {
  const onOpenPhoto = options?.onOpenPhoto;
  const lines = String(text ?? '').split(/\r?\n/);
  return lines.map((line, li) => {
    const nodes = tokenizeLine(line).map((t, ti) => {
      const key = `${li}-${ti}`;
      switch (t.kind) {
        case 'bold':
          return React.createElement('strong', { key }, t.value);
        case 'italic':
          return React.createElement('em', { key }, t.value);
        case 'code':
          return React.createElement(
            'code',
            { key, className: 'rounded bg-scrim/10 px-1 py-0.5 text-[0.9em]' },
            t.value,
          );
        case 'image': {
          const href = linkHref(t.url);
          const label = imageLabel(t.alt);
          if (onOpenPhoto && looksLikeImageUrl(href)) {
            return React.createElement(
              'button',
              {
                key,
                type: 'button',
                onClick: () => onOpenPhoto(href),
                className:
                  'ds-raw-button inline underline underline-offset-2 break-all text-left font-semibold',
              },
              label,
            );
          }
          return React.createElement(
            'a',
            {
              key,
              href,
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'underline underline-offset-2 break-all',
            },
            label,
          );
        }
        case 'link':
          return React.createElement(
            'a',
            {
              key,
              href: linkHref(t.value),
              target: '_blank',
              rel: 'noopener noreferrer',
              className: 'break-all underline underline-offset-2',
            },
            t.value,
          );
        default:
          return React.createElement(React.Fragment, { key }, t.value);
      }
    });
    // Re-join lines with <br/> so blank lines and wraps survive.
    return React.createElement(
      React.Fragment,
      { key: li },
      ...nodes,
      li < lines.length - 1 ? React.createElement('br', { key: `br-${li}` }) : null,
    );
  });
}

/* ------------------------------------------------------------------ blocks */

/**
 * One block of a message body. Pure data — the parser has no React dependency so
 * the grammar can be unit-tested without a renderer.
 */
type MarkdownBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'rule' };

const HEADING_RE = /^(#{1,3})\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const BULLET_RE = /^[-*•]\s+(.*)$/;
const ORDERED_RE = /^\d+[.)]\s+(.*)$/;
const RULE_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

/**
 * Split a message body into blocks.
 *
 * Deliberately line-based and forgiving: staff paste from email, so a paragraph
 * is a run of consecutive non-blank lines (its own soft line breaks preserved)
 * and a list does not need a blank line before it.
 */
export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = String(text ?? '').split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (RULE_RE.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoted.push(QUOTE_RE.exec(lines[i])![1]);
        i += 1;
      }
      blocks.push({ kind: 'quote', lines: quoted });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    const ordered = ORDERED_RE.exec(line);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (i < lines.length) {
        const m = isOrdered ? ORDERED_RE.exec(lines[i]) : BULLET_RE.exec(lines[i]);
        if (!m) break;
        items.push(m[1]);
        i += 1;
      }
      blocks.push({ kind: 'list', ordered: isOrdered, items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (
        !l.trim() ||
        RULE_RE.test(l) ||
        HEADING_RE.test(l) ||
        QUOTE_RE.test(l) ||
        BULLET_RE.test(l) ||
        ORDERED_RE.test(l)
      ) {
        break;
      }
      para.push(l);
      i += 1;
    }
    blocks.push({ kind: 'paragraph', lines: para });
  }

  return blocks;
}

/**
 * The block type scale, defined exactly once.
 *
 * There is no Tailwind typography plugin in this repo, so `prose` does not
 * exist — a block scale invented at a call site would be the drift this map
 * prevents. Body stays `text-role-data` (the ledger row's own body role, which
 * the wrapper sets); headings step UP from it and the weight ceiling is 600.
 */
const BLOCK_CLASS = {
  h1: 'text-role-title text-text-default',
  h2: 'text-role-body font-semibold text-text-default',
  h3: 'text-role-data font-semibold text-text-default',
  list: 'stack-tight pl-4',
  quote: 'border-l-2 border-border-soft pl-3 text-text-soft',
  rule: 'border-t border-border-hairline',
} as const;

/** Inline nodes for one source line (no trailing `<br/>` — blocks own spacing). */
function inlineNodes(line: string, key: string, onOpenPhoto?: (url: string) => void) {
  return React.createElement(React.Fragment, { key }, renderInlineMarkdown(line, { onOpenPhoto }));
}

/** Join a run of soft-wrapped lines with `<br/>` inside one paragraph. */
function softWrapped(lines: string[], keyPrefix: string, onOpenPhoto?: (url: string) => void) {
  return lines.flatMap((l, idx) => {
    const node = inlineNodes(l, `${keyPrefix}-${idx}`, onOpenPhoto);
    return idx < lines.length - 1
      ? [node, React.createElement('br', { key: `${keyPrefix}-br-${idx}` })]
      : [node];
  });
}

/**
 * Render a message body with block structure — headings, lists, blockquotes and
 * rules — on the house type scale.
 *
 * The caller supplies the body role on the wrapper (`text-role-data`); this only
 * emits structure and the per-block overrides above.
 */
export function renderBlockMarkdown(
  text: string,
  options?: RenderInlineMarkdownOptions,
): React.ReactNode {
  const onOpenPhoto = options?.onOpenPhoto;
  const blocks = parseMarkdownBlocks(text);
  if (!blocks.length) return null;

  return React.createElement(
    'div',
    { className: 'stack-row' },
    ...blocks.map((b, bi) => {
      const key = `b-${bi}`;
      switch (b.kind) {
        case 'rule':
          return React.createElement('hr', { key, className: BLOCK_CLASS.rule });
        case 'heading':
          return React.createElement(
            `h${b.level}`,
            { key, className: BLOCK_CLASS[`h${b.level}` as 'h1' | 'h2' | 'h3'] },
            inlineNodes(b.text, `${key}-t`, onOpenPhoto),
          );
        case 'quote':
          return React.createElement(
            'blockquote',
            { key, className: BLOCK_CLASS.quote },
            ...softWrapped(b.lines, `${key}-q`, onOpenPhoto),
          );
        case 'list':
          return React.createElement(
            b.ordered ? 'ol' : 'ul',
            { key, className: `${BLOCK_CLASS.list} ${b.ordered ? 'list-decimal' : 'list-disc'}` },
            ...b.items.map((item, ii) =>
              React.createElement(
                'li',
                { key: `${key}-i-${ii}` },
                inlineNodes(item, `${key}-i-${ii}-t`, onOpenPhoto),
              ),
            ),
          );
        default:
          return React.createElement(
            'p',
            { key },
            ...softWrapped(b.lines, `${key}-p`, onOpenPhoto),
          );
      }
    }),
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One source line → sanitized inline HTML. Tokenize, then escape every value. */
function inlineHtml(line: string): string {
  return tokenizeLine(line)
    .map((t) => {
      switch (t.kind) {
        case 'bold':
          return `<strong>${escapeHtml(t.value)}</strong>`;
        case 'italic':
          return `<em>${escapeHtml(t.value)}</em>`;
        case 'code':
          return `<code>${escapeHtml(t.value)}</code>`;
        case 'image': {
          const href = escapeHtml(linkHref(t.url));
          const label = escapeHtml(imageLabel(t.alt));
          return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
        }
        case 'link': {
          const href = escapeHtml(linkHref(t.value));
          return `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.value)}</a>`;
        }
        default:
          return escapeHtml(t.value);
      }
    })
    .join('');
}

/**
 * Render markdown to a sanitized HTML string (used for the Zendesk `html_body`).
 *
 * Same block grammar as `renderBlockMarkdown` — one parser, two renderers — so a
 * staffer who writes `### Next steps` sees the same structure in the ledger and in
 * the customer's inbox. It emitted inline-only HTML until 2026-08-03, which meant a
 * heading, list or quote reached the customer as a literal `###` / `-` / `>`.
 *
 * Bare semantic tags, no classes: an email client has no stylesheet of ours.
 */
export function markdownToHtml(text: string): string {
  return parseMarkdownBlocks(text)
    .map((b) => {
      switch (b.kind) {
        case 'rule':
          return '<hr>';
        case 'heading':
          return `<h${b.level}>${inlineHtml(b.text)}</h${b.level}>`;
        case 'quote':
          return `<blockquote>${b.lines.map(inlineHtml).join('<br>')}</blockquote>`;
        case 'list': {
          const tag = b.ordered ? 'ol' : 'ul';
          return `<${tag}>${b.items.map((i) => `<li>${inlineHtml(i)}</li>`).join('')}</${tag}>`;
        }
        default:
          return `<p>${b.lines.map(inlineHtml).join('<br>')}</p>`;
      }
    })
    .join('');
}
