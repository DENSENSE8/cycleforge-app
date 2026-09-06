/**
 * Gate A — MarkdownRenderer hierarchy vocabulary.
 *
 * The canonical display-language fixture must render exactly the shapes the
 * contract promises: one H2, H3 sections, a two-tier bullet hierarchy with
 * DISTINCT class vocabularies per tier, and no raw markdown syntax leaking
 * into the DOM. The bubble face flattens headings to styled paragraphs.
 *
 * Run: node --import tsx --test src/components/ai/markdown-renderer.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MarkdownRenderer from './MarkdownRenderer';

/** The canonical display-language fixture (task ground truth). */
const FIXTURE = [
  '## Packing exceptions — Tuesday',
  '### Received never listed',
  '- **12 units · 9 days** — lane 3',
  '  - `SKU-4821` ×4, carton C-112',
  '  - `SKU-9903` ×8, no carton',
  '### Dead stock',
  '- **91 SKUs** — oldest 141 days',
].join('\n');

/** Exact class names introduced by the hierarchy vocabulary. */
const PARENT_LI = 'pl-1 text-role-caption [&>p]:mb-0';
const CHILD_LI = 'pl-1 text-role-micro text-text-muted [&>p]:mb-0';
const CHILD_UL_MARKER = "list-['–']";

function render(content: string, variant?: 'prose' | 'bubble'): string {
  return renderToStaticMarkup(createElement(MarkdownRenderer, { content, variant }));
}

/** Undo React's attribute escaping so assertions use literal class names. */
function unescapeHtml(html: string): string {
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function liClasses(html: string): string[] {
  const unescaped = unescapeHtml(html);
  return [...unescaped.matchAll(/<li class="([^"]*)"/g)].map((m) => m[1]);
}

describe('MarkdownRenderer — prose fixture (canonical display language)', () => {
  const html = render(FIXTURE);

  it('renders exactly one h2 and two h3 sections', () => {
    assert.equal((html.match(/<h2/g) ?? []).length, 1);
    assert.equal((html.match(/<h3/g) ?? []).length, 2);
  });

  it('renders bold entities and inline identifier code', () => {
    assert.ok(html.includes('<strong'));
    assert.ok(html.includes('<code'));
    assert.match(html, /SKU-4821/);
  });

  it('renders the nested ul > li > ul hierarchy', () => {
    assert.ok((html.match(/<ul/g) ?? []).length >= 3);
    // A parent li that itself contains a ul is the nested-list shape.
    assert.match(unescapeHtml(html), /<li class="[^"]*"[^>]*>(?:(?!<\/li>)[\s\S])*<ul/);
  });

  it('gives parent and child li distinguishable depth classes', () => {
    const classes = liClasses(html);
    // Fixture order: parent li, child li, child li, parent li.
    assert.equal(classes.length, 4);
    assert.equal(classes[0], PARENT_LI);
    assert.equal(classes[1], CHILD_LI);
    assert.equal(classes[2], CHILD_LI);
    assert.equal(classes[3], PARENT_LI);
    assert.notEqual(classes[0], classes[1]);
  });

  it('uses a filled marker for parent lists and a dash marker for child lists', () => {
    const unescaped = unescapeHtml(html);
    assert.match(unescaped, /<ul class="[^"]*list-disc[^"]*"/);
    assert.ok(
      unescaped.includes(`<ul class="mb-1 ml-4 ${CHILD_UL_MARKER} space-y-0.5 leading-5 marker:text-text-faint">`),
      'child ul carries the exact dash-marker class string',
    );
  });

  it('leaves no literal ** or backtick pairs in the HTML', () => {
    assert.ok(!html.includes('**'));
    assert.ok(!html.includes('`'));
  });

  it('keeps tight/loose list paragraphs from inflating (p directly inside li)', () => {
    const loose = unescapeHtml(render('- a\n\n- b'));
    assert.match(loose, new RegExp(`<li class="[^"]*\\[&>p\\]:mb-0[^"]*"[^>]*>\\s*<p`));
  });
});

describe('MarkdownRenderer — bubble face (operator messages)', () => {
  it('renders ## x as a <p> containing <strong>, with no heading tags', () => {
    const html = render('## x', 'bubble');
    assert.ok(!html.includes('<h1'));
    assert.ok(!html.includes('<h2'));
    assert.ok(!html.includes('<h3'));
    assert.match(html, /<p class="[^"]*font-semibold[^"]*"/);
    assert.ok(html.includes('<strong'));
  });

  it('keeps real heading scale in the prose face (default variant)', () => {
    const html = render('## x');
    assert.ok(html.includes('<h2'));
    assert.ok(!html.includes('<h1'));
  });

  it('applies the same hierarchy vocabulary inside bubbles', () => {
    const html = render(FIXTURE, 'bubble');
    assert.ok(!html.includes('<h2'));
    const classes = liClasses(html);
    assert.equal(classes.length, 4);
    assert.equal(classes[1], CHILD_LI);
  });
});
