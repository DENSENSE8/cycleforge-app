import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GridClickSelectFace, GridRowCheckbox } from './GridRowCheckbox';

/**
 * Select chrome — every variant uses a full-cell hit plane; only the painted
 * face differs. `'always'` always paints the bordered 16px square;
 * `'selected-only'` paints it only when checked/mixed; `'sheets'` and
 * `'flush'` paint {@link GridClickSelectFace}, which since 2026-08-21 shows a
 * FADED check when unselected instead of nothing — so a gutter reads as a
 * checkmark column at rest. Body click-select rows mount the face separately.
 */
describe('GridRowCheckbox chrome', () => {
  it('always chrome paints a bordered face while unchecked on a full-cell hit plane', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridRowCheckbox, {
        checked: false,
        onToggle: () => {},
        label: 'Select row',
        chrome: 'always',
      }),
    );
    assert.match(html, /data-select-chrome="always"/);
    assert.match(html, /border-border-default/);
    assert.match(html, /role="checkbox"/);
    assert.match(html, /aria-checked="false"/);
    // Hit plane fills the select track — not only the 16px face.
    assert.match(html, /h-full/);
    assert.match(html, /w-full/);
    assert.match(html, /h-4 w-4/);
  });

  it('selected-only chrome is blank while unchecked (full-cell hit, no face)', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridRowCheckbox, {
        checked: false,
        onToggle: () => {},
        label: 'Select row',
        chrome: 'selected-only',
      }),
    );
    assert.match(html, /data-select-chrome="selected-only"/);
    assert.match(html, /aria-checked="false"/);
    assert.doesNotMatch(html, /border-border-default/);
    assert.doesNotMatch(html, /border-accent-bg/);
  });

  it('selected-only chrome paints the accent face when checked', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridRowCheckbox, {
        checked: true,
        onToggle: () => {},
        label: 'Select row',
        chrome: 'selected-only',
      }),
    );
    assert.match(html, /data-select-chrome="selected-only"/);
    assert.match(html, /aria-checked="true"/);
    assert.match(html, /border-accent-bg/);
  });

  it('selected-only chrome paints mixed state', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridRowCheckbox, {
        checked: 'mixed',
        onToggle: () => {},
        label: 'Select group',
        chrome: 'selected-only',
      }),
    );
    assert.match(html, /aria-checked="mixed"/);
    assert.match(html, /border-accent-bg/);
  });

  it('sheets chrome shows a faded check while unchecked (full-cell hit, no square)', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridRowCheckbox, {
        checked: false,
        onToggle: () => {},
        label: 'Select row',
        chrome: 'sheets',
      }),
    );
    assert.match(html, /data-select-chrome="sheets"/);
    assert.match(html, /role="checkbox"/);
    assert.match(html, /aria-checked="false"/);
    assert.match(html, /data-click-select-face="off"/);
    // The mark is PRESENT but quiet — this is what stops the leftmost column
    // reading as dead space, which is what it did on Incoming.
    assert.match(html, /text-text-faint/);
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /border-border-default/);
    // No ground while off: selection stays the only thing that paints a band.
    assert.doesNotMatch(html, /bg-accent-bg(?!\/)/);
  });

  it('sheets chrome paints GridClickSelectFace when checked (select-all)', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridRowCheckbox, {
        checked: true,
        onToggle: () => {},
        label: 'Select all',
        chrome: 'sheets',
      }),
    );
    assert.match(html, /data-select-chrome="sheets"/);
    assert.match(html, /aria-checked="true"/);
    assert.match(html, /data-click-select-face="on"/);
    assert.match(html, /bg-accent-bg/);
    assert.match(html, /absolute inset-0/);
    // Flush cell fill — not the inset 16px checklist square.
    assert.doesNotMatch(html, /h-4 w-4/);
    assert.doesNotMatch(html, /rounded border/);
  });

  it('sheets chrome paints GridClickSelectFace when mixed', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridRowCheckbox, {
        checked: 'mixed',
        onToggle: () => {},
        label: 'Select group',
        chrome: 'sheets',
      }),
    );
    assert.match(html, /data-select-chrome="sheets"/);
    assert.match(html, /aria-checked="mixed"/);
    assert.match(html, /data-click-select-face="mixed"/);
    assert.match(html, /bg-accent-bg\/20/);
  });
});

describe('GridClickSelectFace', () => {
  it('shows a FADED check while unchecked — never nothing', () => {
    // This painted nothing until 2026-08-21, which made the leftmost column of
    // Incoming indistinguishable from empty space: an operator could not tell
    // it was a selection column, and "nothing" could equally have meant not
    // loaded or not selectable. The mark is the column's identity.
    const html = renderToStaticMarkup(
      React.createElement(GridClickSelectFace, { checked: false }),
    );
    assert.match(html, /data-click-select-face="off"/);
    assert.match(html, /<svg/, 'the checkmark must render at rest');
    assert.match(html, /text-text-faint/);
    // Still no GROUND while off — selection is the only thing that paints a
    // band down the column, which is what keeps a 40-row list readable.
    assert.doesNotMatch(html, /bg-accent-bg/);
    assert.doesNotMatch(html, /border-border-default/);
  });

  it('paints accent wash + check when checked (caller supplies absolute inset-0)', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridClickSelectFace, {
        checked: true,
        className: 'absolute inset-0',
      }),
    );
    assert.match(html, /data-click-select-face="on"/);
    assert.match(html, /absolute inset-0/);
    assert.match(html, /bg-accent-bg/);
    assert.match(html, /text-text-inverse/);
    // Flush cell fill — not the inset 16px checklist square.
    assert.doesNotMatch(html, /h-4 w-4/);
    assert.doesNotMatch(html, /rounded border/);
  });

  it('paints mixed state as accent wash', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridClickSelectFace, {
        checked: 'mixed',
        className: 'absolute inset-0',
      }),
    );
    assert.match(html, /data-click-select-face="mixed"/);
    assert.match(html, /bg-accent-bg\/20/);
    assert.doesNotMatch(html, /h-4 w-4/);
  });
});

/**
 * `'flush'` — the COMPOUND row's gutter face.
 *
 * The compound row has ONE display method by rule, so `CompoundSelect`
 * hardcodes this chrome rather than accepting it from a mount. These pin the
 * three things the operator asked for: the mark is always visible, it is edge
 * to edge, and the hit plane is the whole 48px cell.
 */
describe('GridRowCheckbox flush chrome (the compound gutter)', () => {
  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      React.createElement(GridRowCheckbox, {
        onToggle: () => {},
        label: 'Select row',
        chrome: 'flush',
        ...props,
      } as never),
    );

  it('paints a faded check when the row is NOT selected', () => {
    const html = render({ checked: false });
    assert.match(html, /data-select-chrome="flush"/);
    assert.match(html, /data-click-select-face="off"/);
    assert.match(html, /text-text-faint/);
    assert.match(html, /<svg/, 'the checkmark itself must render');
    assert.doesNotMatch(html, /bg-accent-bg(?!\/)/);
  });

  it('fills the cell with the accent ground when selected', () => {
    const html = render({ checked: true });
    assert.match(html, /data-click-select-face="on"/);
    assert.match(html, /bg-accent-bg/);
    assert.match(html, /text-text-inverse/);
    assert.match(html, /aria-checked="true"/);
  });

  it('goes edge to edge — the face is absolutely inset to the whole cell', () => {
    const html = render({ checked: false });
    assert.match(html, /absolute inset-0/);
    // …and the button itself is the full track, so an operator never aims.
    assert.match(html, /h-full/);
    assert.match(html, /w-full/);
  });

  it('carries the indeterminate bar, not a check, when mixed', () => {
    const html = render({ checked: 'mixed' });
    assert.match(html, /data-click-select-face="mixed"/);
    assert.match(html, /bg-accent-bg\/20/);
    assert.match(html, /aria-checked="mixed"/);
  });

  it('stays a REAL checkbox when disabled, so the row still explains itself', () => {
    // Tasks disables an archived row's check-off. A disabled control keeps its
    // place in the a11y tree; omitting it would drop the column's affordance on
    // exactly the rows that most need explaining.
    const html = render({ checked: false, disabled: true });
    assert.match(html, /role="checkbox"/);
    assert.match(html, /disabled/);
    assert.match(html, /cursor-not-allowed/);
  });
});
