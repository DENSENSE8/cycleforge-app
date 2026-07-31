/**
 * Inline markdown grammar for support chat bodies.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { markdownToHtml, renderInlineMarkdown } from './markdown';

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
});
