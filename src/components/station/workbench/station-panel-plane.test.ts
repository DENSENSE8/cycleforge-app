import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StationPanelRoot } from './StationPanelRoot';
import { StationWorkbench } from './StationWorkbench';

/** The station plane is FLAT WHITE — no grey anywhere (operator ruling, 2026-08-30). */
describe('station panel plane', () => {
  const render = (props: Partial<React.ComponentProps<typeof StationPanelRoot>> = {}) =>
    renderToStaticMarkup(
      React.createElement(
        StationPanelRoot,
        props,
        React.createElement('p', null, 'PANEL_BODY'),
      ),
    );

  it('defaults to white — no grey plane under any station', () => {
    const html = render();
    assert.match(html, /bg-surface-card/);
    assert.doesNotMatch(html, /bg-surface-sunken/);
    assert.doesNotMatch(html, /bg-surface-canvas/);
    assert.match(html, /data-station-surface="card"/);
    assert.match(html, /PANEL_BODY/);
  });

  it('paints no gradient — the plane is one exact token', () => {
    // The wash is three tinted blobs; its fingerprint lives in StationAmbientWash.
    assert.doesNotMatch(render(), /bg-blue-400/);
  });

  it('still gives a recessed ground when one is explicitly asked for', () => {
    // The variant survives for a surface that can say what its grey separates.
    const html = render({ surface: 'well' });
    assert.match(html, /bg-surface-canvas/);
    assert.match(html, /data-station-surface="well"/);
  });

  it('never hard-codes a hex or a raw palette grey', () => {
    const html = render();
    assert.doesNotMatch(html, /#[0-9a-fA-F]{6}/);
    assert.doesNotMatch(html, /bg-(gray|slate|zinc|neutral|stone)-\d/);
  });

  it('carries no padding of its own — the plane runs edge to edge', () => {
    const root = render().slice(0, render().indexOf('>') + 1);
    assert.doesNotMatch(root, /\s(p|px|py|pt|pb|pl|pr)-\d/, root);
  });
});

describe('the workbench inside it paints nothing', () => {
  it('is transparent, so the white root is what shows', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        StationWorkbench,
        {},
        React.createElement('p', null, 'WORKBENCH_BODY'),
      ),
    );
    assert.match(html, /bg-transparent/);
    assert.doesNotMatch(
      html,
      /bg-surface-(sunken|canvas|card)/,
      'a workbench that paints anything is a second plane over the root',
    );
    assert.match(html, /WORKBENCH_BODY/);
  });
});
