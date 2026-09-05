import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CompoundRow } from '@/components/tables/compound/CompoundRow';
import { CART_COMPOUND_COLUMNS } from './cart-grid-layout';
import { cartLineCompoundView } from './cart-compound-view';
import type { KioskCartLine } from './cart-line';

/**
 * The kiosk cart on the shared row.
 *
 * `counter_session_lines` is the first compound family with MONEY and the one
 * that made the shared model grow an `amount` track. These pin what a cart
 * line must read as — including the two cases the hand-rolled `<li>` it
 * replaced could not express at all: bulk selection, and more than one verb
 * per line (those verbs ride the title hover, not a standing ⋮ column).
 *
 * Rendered through `CompoundRow` rather than asserted on the view object, so it
 * measures what a cashier would actually see.
 */

const RETAIL: KioskCartLine = {
  id: 'l1',
  type: 'RETAIL',
  title: 'iPhone 12 128GB',
  quantity: 3,
  unitAmountCents: 4999,
  payload: { variationId: 'VAR-9', sku: 'SKU-771' },
};

const REPAIR: KioskCartLine = {
  id: 'l2',
  type: 'REPAIR',
  title: 'Screen repair',
  quantity: 1,
  unitAmountCents: 8900,
  payload: {
    productModel: 'iPhone 12',
    serialNumber: 'SN-4471',
    repairReasons: ['Cracked glass', 'Touch dead zone'],
    price: '$89.00',
  },
};

const BUYBACK: KioskCartLine = {
  id: 'l3',
  type: 'BUYBACK',
  title: 'Trade-in: Pixel 6',
  quantity: 1,
  unitAmountCents: -12000,
  payload: { imei: '359" 8890', grade: 'B' },
};

const paint = (line: KioskCartLine, opts: { voided?: boolean } = {}) =>
  renderToStaticMarkup(
    React.createElement(CompoundRow, {
      columns: CART_COMPOUND_COLUMNS,
      capabilities: { rowTriageFlags: false },
      selected: false,
      view: cartLineCompoundView(line, { voided: opts.voided }),
      select: { checked: false, onToggle: () => {}, label: `Select ${line.title}` },
      onOpen: () => {},
      actions: [
        { key: 'void', label: 'Void line', tone: 'danger', onSelect: () => {} },
      ],
    } as never),
  );

describe('kiosk cart line → the shared compound row', () => {
  it('totals the line and shows the working only when it adds something', () => {
    const html = paint(RETAIL);
    assert.match(html, /\$149\.97/, '3 × $49.99');
    assert.match(html, />3</, 'qty under the title');

    // A single-unit line must NOT restate unit arithmetic under the total.
    assert.doesNotMatch(paint(REPAIR), /×1 @/);
  });

  it('marks a trade-in as a CREDIT, not just a negative number', () => {
    const html = paint(BUYBACK);
    assert.match(html, /-\$120\.00/);
    // Reading a −$120 credit as a $120 sale is the expensive direction to be
    // wrong in, so the sign is carried by the paint as well as the character.
    assert.match(html, /text-text-success/);
  });

  it('puts the line IDENTIFIERS in the ids track, per type', () => {
    // A cart line genuinely has identifiers — which is why this family fills a
    // column Tasks and Daily leave empty.
    assert.match(paint(RETAIL), /SKU-771/, 'retail identifies by SKU');
    assert.match(paint(REPAIR), /SN-4471/, 'a repair identifies by device serial');
  });

  it('shows what makes THIS line different under the title', () => {
    assert.match(paint(REPAIR), /Cracked glass · Touch dead zone/);
    assert.match(paint(BUYBACK), /Grade B/);
  });

  it('lets a VOID outrank the line type — a void is evidence, not a delete', () => {
    const html = paint(RETAIL, { voided: true });
    assert.match(html, /Voided/);
    // `alert` tone: the one loud state, because a struck line still being shown
    // is exactly the row a cashier must not skim past.
    assert.match(html, /rose/);
    assert.doesNotMatch(html, /Retail/);
  });

  it('carries a selection checkbox — the hand-rolled row had none', () => {
    // Without it there was no way to void or discount several lines at once.
    const html = paint(RETAIL);
    assert.match(html, /data-col="select"/);
    assert.match(html, /role="checkbox"/);
    assert.match(html, /data-select-chrome="hover"/);
  });

  it('puts row verbs on the title hover — not a standing ⋮ track', () => {
    const html = paint(RETAIL);
    assert.doesNotMatch(html, /data-col="actions"/);
    assert.doesNotMatch(html, /data-row-actions/);
    assert.match(html, /iPhone 12 128GB/);
  });

  it('mounts the identical tracks every other table mounts', () => {
    const html = paint(RETAIL);
    for (const key of ['select', 'fulfillment', 'thumb', 'item', 'dates', 'state']) {
      assert.match(html, new RegExp(`data-col="${key}"`), `${key} track`);
    }
  });
});
