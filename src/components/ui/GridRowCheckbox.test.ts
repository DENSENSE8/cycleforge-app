import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GridClickSelectFace, GridRowCheckbox } from './GridRowCheckbox';

/**
 * Select chrome — every variant uses a full-cell hit plane; only the painted
 * face differs. `'always'` always paints the bordered 16px square; `'selected-only'`
 * paints it only when checked/mixed; `'sheets'` paints {@link GridClickSelectFace}
 * when checked/mixed (header select-all) and stays blank while unchecked. Body
 * click-select rows mount GridClickSelectFace separately.
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

  it('sheets chrome is blank while unchecked (full-cell hit, no face)', () => {
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
    assert.doesNotMatch(html, /border-border-default/);
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
  it('is blank while unchecked (no accent wash)', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridClickSelectFace, { checked: false }),
    );
    assert.match(html, /data-click-select-face="off"/);
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
