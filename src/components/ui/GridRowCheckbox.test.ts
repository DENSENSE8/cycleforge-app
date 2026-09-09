import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GridRowCheckbox, GridSelectSquareFace } from './GridRowCheckbox';

/**
 * Select chrome — every variant uses a full-cell hit plane; only the painted
 * face differs. `'always'` always paints the bordered 16px square;
 * `'selected-only'` paints it only when checked/mixed; `'hover'` paints it on
 * row hover (and whenever checked/mixed).
 *
 * `'sheets'` / `'flush'` and the full-bleed `GridClickSelectFace` were removed
 * on 2026-09-04 — see {@link GridSelectSquareFace}'s docblock for the two
 * operator rulings that emptied them.
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
    // Face at the TOP of the row cell, not vertically centered.
    assert.match(html, /items-start justify-center/);
    assert.match(html, /\bpt-1\b/);
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

  it('hover chrome is a real checkbox with a full-cell hit plane', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridRowCheckbox, {
        checked: false,
        onToggle: () => {},
        label: 'Select row',
        chrome: 'hover',
      }),
    );
    assert.match(html, /data-select-chrome="hover"/);
    assert.match(html, /role="checkbox"/);
    assert.match(html, /aria-checked="false"/);
    // The operator's explicit carve-out: the box shrank, the click point did
    // not. Never make an operator aim at 16px.
    assert.match(html, /h-full/);
    assert.match(html, /w-full/);
    assert.match(html, /items-start justify-center/);
    assert.match(html, /\bpt-1\b/);
    // …and nothing paints across the cell any more.
    assert.doesNotMatch(html, /absolute inset-0/);
    assert.match(html, /group\/select/);
  });
});

/**
 * {@link GridSelectSquareFace} — the compound row's body face.
 *
 * Three states, and OFF is empty. Both halves of the old face went in one
 * operator pass on 2026-09-04: no full-bleed block ("not a full width or full
 * height display") and no resting mark ("remove the faded checkmark throughout
 * the entire slot data table"). That reverses the 2026-08-21 faded-check
 * ruling deliberately — these pin it so it is not quietly restored.
 */
describe('GridSelectSquareFace', () => {
  const paint = (checked: boolean | 'mixed') =>
    renderToStaticMarkup(React.createElement(GridSelectSquareFace, { checked }));

  it('paints NOTHING at rest — no mark, no box', () => {
    const html = paint(false);
    assert.match(html, /data-select-square-face="off"/);
    assert.doesNotMatch(html, /<svg/, 'no resting checkmark');
    assert.doesNotMatch(html, /text-text-faint/);
    assert.match(html, /border-transparent/);
    assert.match(html, /bg-transparent/);
  });

  it('reveals an empty box on ROW hover, not on its own hover', () => {
    // Scoped to `group/row`, which `ledgerGridRowShellClass` declares on every
    // LedgerGrid row — a cell-local `hover:` would only fire over 16px.
    const html = paint(false);
    assert.match(html, /group-hover\/row:border-border-default/);
    assert.match(html, /group-hover\/row:bg-surface-card/);
  });

  it('reveals the empty box on keyboard focus and on devices with no hover', () => {
    const html = paint(false);
    assert.match(html, /group-focus-visible\/select:border-border-default/);
    assert.match(html, /\[@media\(hover:none\)\]:border-border-default/);
    assert.doesNotMatch(html, /text-text-faint/);
  });

  it('is the 16px rounded square, never a full-cell wash', () => {
    for (const state of [false, true, 'mixed'] as const) {
      const html = paint(state);
      assert.match(html, /h-4 w-4/, String(state));
      assert.match(html, /rounded-sm/, String(state));
      assert.doesNotMatch(html, /absolute inset-0/, String(state));
    }
  });

  it('paints membership without hover — checked and mixed are always visible', () => {
    const on = paint(true);
    assert.match(on, /data-select-square-face="on"/);
    assert.match(on, /bg-accent-bg/);
    assert.match(on, /text-text-inverse/);
    assert.match(on, /<svg/);

    const mixed = paint('mixed');
    assert.match(mixed, /data-select-square-face="mixed"/);
    assert.match(mixed, /bg-accent-bg\/20/);
    assert.doesNotMatch(mixed, /<svg/, 'mixed is a bar, not a check');
  });
});

describe('GridRowCheckbox hover chrome (the compound gutter)', () => {
  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      React.createElement(GridRowCheckbox, {
        onToggle: () => {},
        label: 'Select row',
        chrome: 'hover',
        ...props,
      } as never),
    );

  it('stays a REAL checkbox when disabled, so the row still explains itself', () => {
    // Tasks disables an archived row's check-off. A disabled control keeps its
    // place in the a11y tree; omitting it would drop the column's affordance on
    // exactly the rows that most need explaining.
    const html = render({ checked: false, disabled: true });
    assert.match(html, /role="checkbox"/);
    assert.match(html, /disabled/);
    assert.match(html, /cursor-not-allowed/);
  });

  it('carries the indeterminate bar, not a check, when mixed', () => {
    const html = render({ checked: 'mixed' });
    assert.match(html, /data-select-square-face="mixed"/);
    assert.match(html, /aria-checked="mixed"/);
  });

  it('keeps the face at the top of the cell on a full-height hit plane', () => {
    const html = render({ checked: true });
    assert.match(html, /h-full w-full shrink-0 items-start justify-center/);
    assert.match(html, /\bpt-1\b/);
  });
});
