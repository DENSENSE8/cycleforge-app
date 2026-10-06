/** StopSlider — shared discrete-slider visual and accessibility contract. */
import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { StopSlider } from '@/design-system/primitives/StopSlider';

test('uses the shared blue rail, inset increment dots, and a gray grab target', () => {
  const html = renderToStaticMarkup(
    <StopSlider stops={[1, 2, 5]} value={2} onChange={() => {}} ariaLabel="Label quantity" formatValue={(value) => `${value} labels`} />,
  );

  assert.match(html, /bg-fill-info\/35/, 'unfilled rail is the quieter semantic blue');
  assert.match(html, /bg-fill-info/, 'completed rail and selected chip use the semantic blue');
  assert.match(html, /h-5/, 'default rail is 20px high');
  assert.match(html, /size-1\.5/, 'default increment dots are 6px, not rail-height');
  assert.match(html, /bg-text-inverse\/70/, 'reached increments remain legible over blue');
  assert.match(html, /bg-surface-strong shadow-sm/, 'the thumb is a lifted, high-contrast gray surface');
  assert.match(html, /aria-valuetext="2 labels"/);
  assert.doesNotMatch(html, /\b(bg|text|border|ring)-(blue|sky|indigo)-\d/, 'uses theme tokens rather than raw palette colours');
});

test('keeps compact increment dots smaller than its compact rail', () => {
  const html = renderToStaticMarkup(
    <StopSlider compact stops={[1, 2]} value={1} onChange={() => {}} ariaLabel="Quantity" />,
  );

  assert.match(html, /h-3/, 'compact rail is 12px high');
  assert.match(html, /size-1/, 'compact increment dots are 4px');
});
