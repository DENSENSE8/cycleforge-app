import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueueGroupRow } from '@/components/dashboard/orders-queue/QueueGroupRow';
import type { RowGroup } from '@/lib/group-rows';
import type { ShippedOrder } from '@/types/orders';

const COLUMNS = [
  { key: 'select', width: 'minmax(1.5rem, 1.5rem)', frozen: true },
  { key: 'fulfillment', width: 'minmax(6.5rem, 6.5rem)', frozen: true },
  { key: 'thumb', width: 'minmax(3rem, 3rem)', frozen: true },
  { key: 'item', width: 'minmax(18rem, 18rem)' },
  { key: '_fill', width: 'minmax(0rem, 1fr)' },
] as const;

function line(over: Partial<ShippedOrder> = {}): ShippedOrder {
  return {
    id: 1,
    order_id: '111-2222222-3333333',
    product_title: 'Widget',
    shipping_tracking_number: '1ZAAA',
    tracking_numbers: ['1ZAAA'],
    account_source: 'amazon',
    ...over,
  } as ShippedOrder;
}

function paint(rows: ShippedOrder[]) {
  const quiet: boolean[] = [];
  const group: RowGroup<ShippedOrder> = {
    key: rows[0]!.order_id,
    rows,
  };
  const html = renderToStaticMarkup(
    React.createElement(QueueGroupRow, {
      group,
      baseStripeIndex: 0,
      columns: COLUMNS,
      selectedIds: new Set<number>(),
      onToggleGroup: () => {},
      renderRow: (record, _stripe, _rowIndex, quietIdentity) => {
        quiet.push(quietIdentity === true);
        return React.createElement('div', {
          key: record.id,
          'data-leaf': String(record.id),
        });
      },
    }),
  );
  return { html, quiet };
}

describe('QueueGroupRow — always-open parent chrome', () => {
  it('paints a parent above a multi-line fold and quiets the leaf ids', () => {
    const { html, quiet } = paint([
      line({ id: 1, tracking_numbers: ['1ZAAA'] }),
      line({ id: 2, tracking_numbers: ['1ZBBB'] }),
    ]);
    assert.match(html, /data-order-group-parent/);
    // BOXES, not lines — a tracking number is a box (operator 2026-09-05).
    assert.match(html, /2 boxes/);
    assert.doesNotMatch(html, /\d+ lines?/);
    assert.doesNotMatch(html, /\d+ tracking/);
    // The numbers themselves are no longer chips on the parent; they survive as
    // the dot cluster's accessible name so nothing is lost to a screen reader.
    assert.match(html, /aria-label="[^"]*1ZAAA, 1ZBBB[^"]*"/);
    assert.doesNotMatch(html, /data-col="actions"/);
    assert.deepEqual(quiet, [true, true]);
  });

  /**
   * The regression the chip stack caused: a parent taller than its leaves.
   * Every cell is pinned to COMPOUND_ROW_PX and the row carries the same
   * min-height, so no amount of tracking can grow the band.
   */
  it('stays exactly one row tall no matter how many boxes it carries', () => {
    const { html } = paint([
      line({ id: 1, tracking_numbers: ['1ZAAA', '1ZBBB', '1ZCCC'] }),
      line({ id: 2, tracking_numbers: ['1ZDDD', '1ZEEE', '1ZFFF'] }),
    ]);
    assert.match(html, /min-height:48px/);
    assert.doesNotMatch(html, /min-height:(?!48px)/);
    // Every painted cell on the parent is height-locked; none may auto-size.
    const cellHeights = html.match(/height:48px/g) ?? [];
    assert.ok(cellHeights.length >= 5, `expected every cell height-locked, saw ${cellHeights.length}`);
  });

  /** One dot per DISTINCT carrier — USPS blue beside UPS brown, not six chips. */
  it('paints one carrier dot per carrier, not one per tracking number', () => {
    const { html } = paint([
      line({ id: 1, tracking_numbers: ['1Z999AA10123456784', '1Z999AA10123456795'] }),
      line({ id: 2, tracking_numbers: ['9400111899223197428490'] }),
    ]);
    assert.match(html, /3 boxes/);
    const dots = html.match(/-webkit-mask-image:radial-gradient/g) ?? [];
    assert.equal(dots.length, 2, 'two carriers → two ring dots');
    assert.match(html, /#351C15/i); // UPS Pullman Brown
    assert.match(html, /#4A9FE5/i); // USPS postal blue
  });

  it('skips the parent on a singleton — the leaf is the order', () => {
    const { html, quiet } = paint([line()]);
    assert.doesNotMatch(html, /data-order-group-parent/);
    assert.match(html, /data-leaf="1"/);
    assert.deepEqual(quiet, [false]);
  });
});
