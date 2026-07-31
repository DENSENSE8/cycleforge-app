/**
 * Lightweight, dependency-free inline markdown for the support console.
 *
 * Supports the small grammar staff actually use in replies/notes:
 *   **bold**   *italic*   `code`   ![alt](url)   bare URLs (autolinked)   line breaks.
 *
 * Two outputs from one grammar:
 *   - `renderInlineMarkdown(text)` → safe React nodes for the chat thread.
 *   - `markdownToHtml(text)`       → sanitized HTML string for the Zendesk
 *                                    `html_body` so the customer's email is formatted.
 *
 * Both escape first, then tokenize — there is no `dangerouslySetInnerHTML` and no
 * user input ever reaches the DOM/HTML un-escaped.
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render inline markdown to a sanitized HTML string (used for Zendesk html_body). */
export function markdownToHtml(text: string): string {
  const lines = String(text ?? '').split(/\r?\n/);
  const htmlLines = lines.map((line) =>
    tokenizeLine(line)
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
      .join(''),
  );
  return htmlLines.join('<br>');
}
