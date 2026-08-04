import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GridRowCheckbox } from './GridRowCheckbox';

/**
 * Select chrome — `'always'` paints the bordered square; `'selected-only'`
 * paints it only when checked/mixed; `'sheets'` never paints a face (row wash
 * is the select signal).
 */
describe('GridRowCheckbox chrome', () => {
  it('always chrome paints a bordered face while unchecked', () => {
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
    assert.doesNotMatch(html, /border-border-default/);
    assert.doesNotMatch(html, /border-accent-bg/);
  });

  it('sheets chrome paints no face when checked', () => {
    const html = renderToStaticMarkup(
      React.createElement(GridRowCheckbox, {
        checked: true,
        onToggle: () => {},
        label: 'Select row',
        chrome: 'sheets',
      }),
    );
    assert.match(html, /data-select-chrome="sheets"/);
    assert.match(html, /aria-checked="true"/);
    assert.doesNotMatch(html, /border-accent-bg/);
    assert.doesNotMatch(html, /border-border-default/);
  });

  it('sheets chrome paints no face when mixed', () => {
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
    assert.doesNotMatch(html, /border-accent-bg/);
    assert.doesNotMatch(html, /border-border-default/);
  });
});
