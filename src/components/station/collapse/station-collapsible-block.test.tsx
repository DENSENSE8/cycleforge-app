import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StationCollapsibleBlock } from './StationCollapsibleBlock';

function render(props: Partial<React.ComponentProps<typeof StationCollapsibleBlock>> = {}) {
  return renderToStaticMarkup(
    <StationCollapsibleBlock
      label="Status & timeline"
      collapsed={false}
      onToggle={() => {}}
      testId="block"
      {...props}
    >
      <p>AUDIT_BODY_MARKER</p>
    </StationCollapsibleBlock>,
  );
}

test('expanded renders the body and reports aria-expanded=true', () => {
  const html = render({ collapsed: false });
  assert.match(html, /AUDIT_BODY_MARKER/);
  assert.match(html, /aria-expanded="true"/);
});

test('collapsed removes the body from the markup, not just from view', () => {
  const html = render({ collapsed: true });
  assert.doesNotMatch(
    html,
    /AUDIT_BODY_MARKER/,
    'a collapsed block must not keep its body in the tree — the whole point is giving the column back to the thread',
  );
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /data-collapsed="true"/);
});

test('the header is always reachable so a collapsed block can be re-opened', () => {
  for (const collapsed of [true, false]) {
    const html = render({ collapsed });
    assert.match(html, /<button/, 'the disclosure toggle is a real button');
    assert.match(html, /Status &amp; timeline/);
  }
});

test('a count paints only when given — never a decoded zero', () => {
  assert.doesNotMatch(render({ count: null }), /tabular-nums/);
  assert.match(render({ count: 12 }), /12/);
  // Zero is a real, meaningful audit depth and must still paint.
  assert.match(render({ count: 0 }), /tabular-nums/);
});

test('the block carries no outer padding — it is a structural wrapper', () => {
  const html = render();
  const root = html.slice(0, html.indexOf('>') + 1);
  assert.doesNotMatch(root, /\sp-\d|\spx-\d|\spy-\d|\sm-\d/, root);
});
