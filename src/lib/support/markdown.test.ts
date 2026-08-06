/**
 * Inline markdown grammar for support chat bodies.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  markdownToHtml,
  parseMarkdownBlocks,
  renderBlockMarkdown,
  renderInlineMarkdown,
} from './markdown';

function html(text: string, opts?: Parameters<typeof renderInlineMarkdown>[1]): string {
  return renderToStaticMarkup(React.createElement(React.Fragment, null, renderInlineMarkdown(text, opts)));
}

describe('renderInlineMarkdown', () => {
  it('renders bold, italic, code, and autolinks', () => {
    const out = html('**hi** *there* `x` https://example.com/path');
    assert.match(out, /<strong>hi<\/strong>/);
    assert.match(out, /<em>there<\/em>/);
    assert.match(out, /<code[^>]*>x<\/code>/);
    assert.match(out, /href="https:\/\/example\.com\/path"/);
    assert.match(out, /break-all/);
  });

  it('renders ![alt](url) as a short Image link, not raw markdown', () => {
    const out = html('Found\n![](https://usav.zendesk.com/attachments/token/abc/?name=image.png)');
    assert.doesNotMatch(out, /!\[/);
    assert.match(out, />Image</);
    assert.match(out, /href="https:\/\/usav\.zendesk\.com\/attachments\/token\/abc\/\?name=image\.png"/);
  });

  it('allows optional whitespace after ] in image markdown', () => {
    const out = html('![] (https://cdn.example.com/a.png)');
    assert.match(out, />Image</);
    assert.doesNotMatch(out, /!\[/);
  });

  it('uses onOpenPhoto button for image urls when provided', () => {
    const out = html('![shot](https://cdn.example.com/a.png)', {
      onOpenPhoto: () => {},
    });
    // ds-raw-button — assertion regex matching generated HTML, not a JSX element
    assert.match(out, /<button[^>]*>shot<\/button>/);
    assert.doesNotMatch(out, /href=/);
  });
});

describe('markdownToHtml', () => {
  it('emits escaped image anchors', () => {
    const out = markdownToHtml('See ![pic](https://ex.com/a.png)');
    assert.match(out, /<a href="https:\/\/ex\.com\/a\.png"[^>]*>pic<\/a>/);
    assert.doesNotMatch(out, /!\[/);
  });

  it('escapes HTML in text', () => {
    const out = markdownToHtml('<script>x</script>');
    assert.match(out, /&lt;script&gt;/);
    assert.doesNotMatch(out, /<script>/);
  });

  it('emits block elements, never a literal ###', () => {
    const out = markdownToHtml('### Next steps\n- refund\n- return label\n\n> they replied\n---');
    assert.match(out, /<h3>Next steps<\/h3>/);
    assert.match(out, /<ul><li>refund<\/li><li>return label<\/li><\/ul>/);
    assert.match(out, /<blockquote>they replied<\/blockquote>/);
    assert.match(out, /<hr>/);
    assert.doesNotMatch(out, /###/);
  });

  it('numbers an ordered list rather than shipping "1."', () => {
    const out = markdownToHtml('1. issue label\n2. ship replacement');
    assert.match(out, /<ol><li>issue label<\/li><li>ship replacement<\/li><\/ol>/);
    assert.doesNotMatch(out, /1\./);
  });

  it('keeps inline grammar inside a block', () => {
    assert.match(markdownToHtml('- **bold** item'), /<li><strong>bold<\/strong> item<\/li>/);
  });

  it('escapes inside a heading — structure never bypasses the escape', () => {
    const out = markdownToHtml('# <script>x</script>');
    assert.match(out, /<h1>&lt;script&gt;/);
    assert.doesNotMatch(out, /<script>/);
  });

  it('wraps prose in a paragraph and keeps its soft wraps', () => {
    const out = markdownToHtml('We received it\non Tuesday.');
    assert.equal(out, '<p>We received it<br>on Tuesday.</p>');
  });

  it('separates paragraphs instead of emitting an empty <br>', () => {
    const out = markdownToHtml('first\n\nsecond');
    assert.equal(out, '<p>first</p><p>second</p>');
  });

  it('renders nothing for an empty body', () => {
    assert.equal(markdownToHtml(''), '');
  });
});

describe('parseMarkdownBlocks', () => {
  it('splits headings, lists, quotes, rules and paragraphs', () => {
    const blocks = parseMarkdownBlocks(
      [
        '## Refund status',
        'We received it',
        'on Tuesday.',
        '',
        '- checked serial',
        '- opened claim',
        '',
        '> customer said it arrived crushed',
        '---',
        '1. issue label',
        '2. ship replacement',
      ].join('\n'),
    );

    assert.deepEqual(
      blocks.map((b) => b.kind),
      ['heading', 'paragraph', 'list', 'quote', 'rule', 'list'],
    );
    assert.equal(blocks[0].kind === 'heading' && blocks[0].level, 2);
    // A paragraph keeps its own soft wraps rather than being split per line.
    assert.equal(blocks[1].kind === 'paragraph' && blocks[1].lines.length, 2);
    assert.equal(blocks[2].kind === 'list' && blocks[2].ordered, false);
    assert.equal(blocks[5].kind === 'list' && blocks[5].ordered, true);
  });

  it('does not require a blank line before a list', () => {
    const blocks = parseMarkdownBlocks('Here is what we found:\n- a\n- b');
    assert.deepEqual(blocks.map((b) => b.kind), ['paragraph', 'list']);
  });

  it('treats a plain body as one paragraph', () => {
    const blocks = parseMarkdownBlocks('just a sentence');
    assert.deepEqual(blocks.map((b) => b.kind), ['paragraph']);
  });
});

describe('renderBlockMarkdown', () => {
  const render = (text: string) =>
    renderToStaticMarkup(React.createElement(React.Fragment, null, renderBlockMarkdown(text)));

  it('renders real block elements, never a literal ###', () => {
    const out = render('### Next steps\n- refund\n- return label\n\n> they replied');
    assert.match(out, /<h3[^>]*>Next steps<\/h3>/);
    assert.match(out, /<ul[^>]*><li>refund<\/li><li>return label<\/li><\/ul>/);
    assert.match(out, /<blockquote[^>]*>they replied<\/blockquote>/);
    assert.doesNotMatch(out, /###/);
  });

  it('keeps inline grammar inside blocks', () => {
    const out = render('- **bold** item');
    assert.match(out, /<li><strong>bold<\/strong> item<\/li>/);
  });

  it('escapes rather than injecting HTML', () => {
    const out = render('# <script>x</script>');
    assert.doesNotMatch(out, /<script>/);
    assert.match(out, /&lt;script&gt;/);
  });

  it('renders nothing for an empty body', () => {
    assert.equal(render(''), '');
  });
});
