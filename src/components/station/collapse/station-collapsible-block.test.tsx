import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StationBlockLabel, StationCollapsibleBlock } from './StationCollapsibleBlock';

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

/**
 * `StationBlockLabel` — the header alone.
 *
 * These exist because the retirement of `CartonInspectionPage`'s `SectionLabel`
 * was PROSE-ONLY for months (pattern-evolution law 6): this component's docblock
 * said it had been promoted out of that file while a byte-identical fork stayed
 * behind, because nothing anywhere could notice. Each test below pins one of the
 * three things that fork could do and this one could not — which is what the
 * fork's continued existence was actually buying.
 */
function renderLabel(props: Partial<React.ComponentProps<typeof StationBlockLabel>> = {}) {
  return renderToStaticMarkup(<StationBlockLabel label="Activity" {...props} />);
}

test('label-only: no toggle prop means no button at all, not a dead one', () => {
  const html = renderLabel();
  assert.doesNotMatch(
    html,
    /<button/,
    'six carton sections are plain labels — a disclosure control with nothing to disclose is a lie',
  );
  assert.match(html, /Activity/);
});

test('the toggle may be CONDITIONAL — carton Activity offers it only past one event', () => {
  assert.doesNotMatch(renderLabel({ onToggle: undefined }), /<button/);
  assert.match(renderLabel({ onToggle: () => {}, open: false }), /aria-expanded="false"/);
});

test('count is a ReactNode, so a header can count in words', () => {
  // `12 events` and a totals summary string are both real carton headers. A
  // `number`-typed prop dropped them silently — the fork existed to carry them.
  assert.match(renderLabel({ count: '12 events' }), /12 events/);
  assert.match(renderLabel({ count: 42 }), /42/);
  assert.doesNotMatch(renderLabel({ count: null }), /tabular-nums/);
});

test('the header bar paints a full-width bottom hairline', () => {
  const html = renderLabel();
  assert.match(html, /after:bg-border-hairline/, html);
  assert.match(html, /after:inset-x-0/, html);
});

test('the block composes the label — one header face, not two', () => {
  // If these ever diverge, the promotion has been undone again.
  const blockHeader = render({ collapsed: false, count: 7 });
  const labelHtml = renderLabel({ label: 'Status & timeline', count: 7, open: true, onToggle: () => {} });
  assert.ok(
    blockHeader.includes(labelHtml),
    'StationCollapsibleBlock must RENDER StationBlockLabel, not re-implement its markup',
  );
});
