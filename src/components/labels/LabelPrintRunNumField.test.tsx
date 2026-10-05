/** LabelPrintRunNumField — scrub face can omit duplicate visible copy without losing its name. */
import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LabelPrintRunNumField } from '@/components/labels/LabelPrintRunNumField';

test('compact scrub fields keep their accessible name without rendering a duplicate label', () => {
  const html = renderToStaticMarkup(
    <LabelPrintRunNumField label="Label quantity" value={8} onChange={() => {}} showLabel={false} />,
  );

  assert.match(html, /role="spinbutton"/);
  assert.match(html, /aria-label="Label quantity"/);
  assert.doesNotMatch(html, />Label quantity<\/span>/, 'the visual label is intentionally omitted');
  assert.match(html, /cursor-ew-resize/, 'the at-rest face is drag-scrubbable');
  assert.doesNotMatch(html, /type="number"/, 'the compact drag face has no browser spinner');
});
