import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SearchEntityCentre } from './SearchEntityCentre';
import type { AutoCollapseController } from '@/components/station/collapse';

/**
 * The shape pin.
 *
 * Every entity `/search` can open renders the SAME two bands — Status, then
 * Items — and this is the test that makes a fork fail instead of ship. Before
 * it, a unit painted a single block of label/value rows while an order two
 * keystrokes away painted a record, and repair / FBA painted an EmptyState with
 * a button to go somewhere else. Nothing caught any of that, because nothing
 * asserted the shape.
 *
 * This mounts the component rather than reading source text: AGENTS.md is
 * explicit that an invariant is pinned where it can be OBSERVED, and a regex
 * over a `.tsx` cannot tell a rendered band from the word "Status" in a comment.
 */

const collapse: AutoCollapseController = {
  collapsed: false,
  toggle: () => {},
} as AutoCollapseController;

/** Every entity type the centre accepts — the union IS the coverage list. */
const ENTITIES = ['order', 'unit', 'receiving', 'repair', 'fba', 'sku'] as const;

function render(entity: (typeof ENTITIES)[number]) {
  return renderToStaticMarkup(
    React.createElement(SearchEntityCentre, {
      entity,
      collapse,
      status: React.createElement('div', null, 'STATUS BODY'),
      items: React.createElement('div', null, 'ITEMS BODY'),
    }),
  );
}

describe('every searchable entity paints the same two bands', () => {
  for (const entity of ENTITIES) {
    it(`${entity} renders a Status band and an Items band`, () => {
      const html = render(entity);
      assert.match(
        html,
        new RegExp(`data-testid="search-${entity}-status-block"`),
        `${entity} must paint the Status band`,
      );
      assert.match(
        html,
        new RegExp(`data-testid="search-${entity}-items-block"`),
        `${entity} must paint the Items band`,
      );
    });
  }

  it('Status comes before Items, on every entity', () => {
    // Order is part of the shape. An operator scanning six entity types should
    // never have to look in two places for "where is this".
    for (const entity of ENTITIES) {
      const html = render(entity);
      const status = html.indexOf(`search-${entity}-status-block`);
      const items = html.indexOf(`search-${entity}-items-block`);
      assert.ok(status >= 0 && items >= 0, `${entity} is missing a band`);
      assert.ok(status < items, `${entity} paints Items before Status`);
    }
  });

  it('both bands render their content — neither is a decorative shell', () => {
    const html = render('unit');
    assert.match(html, /STATUS BODY/);
    assert.match(html, /ITEMS BODY/);
  });

  it('open band bodies inherit the shared scan well', () => {
    const html = render('order');
    assert.match(html, /bg-surface-station-well/);
    assert.doesNotMatch(html, /bg-surface-sunken/);
  });

  it('a band with nothing to say still exists', () => {
    // "This record has no items" is a different claim from "this record has no
    // items band", and only the first one is ever true.
    const html = renderToStaticMarkup(
      React.createElement(SearchEntityCentre, {
        entity: 'sku',
        collapse,
        status: null,
        items: null,
      }),
    );
    assert.match(html, /data-testid="search-sku-status-block"/);
    assert.match(html, /data-testid="search-sku-items-block"/);
  });
});
