import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ORDERS_QUEUE_CELL_INSET,
  ORDERS_QUEUE_COLUMNS,
  ORDERS_QUEUE_RESIZABLE_KEYS,
  ordersQueueColVar,
  ordersQueueColumnVars,
  ordersQueueGridCell,
  ordersQueueGridTemplate,
  ordersQueueRowShellClass,
} from '@/lib/dashboard-order-row-layout';

/**
 * The orders-queue grid is one shared cell-chrome SoT (`ordersQueueGridCell`)
 * composed identically by the sticky header, every row, and the multi-product
 * group summary. These lock the helper's contract so the three renderers can
 * never drift into ragged/inconsistent gridlines.
 */
describe('ordersQueueGridCell — shared spreadsheet cell chrome', () => {
  it('default cell: horizontal inset + a right column rule, vertically centered', () => {
    const cls = ordersQueueGridCell();
    assert.ok(cls.includes(ORDERS_QUEUE_CELL_INSET), 'carries the horizontal inset');
    assert.ok(cls.includes('border-r border-border-hairline'), 'draws the vertical column rule');
    assert.ok(cls.includes('items-center'), 'centers content in the stretched track');
  });

  it('last column drops the trailing rule (rule: false)', () => {
    assert.ok(!ordersQueueGridCell({ rule: false }).includes('border-r'), 'no rule when rule=false');
  });

  it('control gutter drops the horizontal inset (inset: none)', () => {
    assert.ok(
      !ordersQueueGridCell({ inset: 'none' }).includes(ORDERS_QUEUE_CELL_INSET),
      'inset:none omits the px inset for narrow select/status gutters',
    );
    // still gets a rule unless explicitly suppressed
    assert.ok(ordersQueueGridCell({ inset: 'none' }).includes('border-r'), 'inset:none keeps the rule by default');
  });

  it('uses a Tier-1 density-aware step, not an inset-* intent', () => {
    // An inset-* intent also sets paddingBlock, which would fight the
    // density-owned row height — the helper must stay horizontal-only.
    assert.doesNotMatch(ordersQueueGridCell(), /\binset-(chip|field|cozy|card|empty)\b/);
  });
});

describe('ordersQueueRowShellClass / grid template', () => {
  it('desktop shell stretches cells and drops the inter-cell gap', () => {
    const desktop = ordersQueueRowShellClass(false);
    assert.ok(desktop.includes('items-stretch'), 'cells stretch so column rules run full-height');
    assert.ok(!desktop.includes('gap-x'), 'no inter-cell gap — cells butt together (spreadsheet)');
    assert.ok(desktop.includes('grid'), 'desktop is a CSS grid');
  });

  it('mobile shell stays a stacked flex column', () => {
    assert.ok(ordersQueueRowShellClass(true).includes('flex-col'), 'mobile stacks');
  });

  it('grid template flexes only title + notes', () => {
    // one minmax() flex track each for title + notes; the rest are fixed rem tracks
    const template = ordersQueueGridTemplate();
    assert.equal((template.match(/minmax\(/g) ?? []).length, 2, 'only title + notes flex');
  });
});

describe('ORDERS_QUEUE_COLUMNS — the column model header + template share', () => {
  it('is the 10-column scan order and derives the CSS-var template (no drift)', () => {
    assert.deepEqual(
      ORDERS_QUEUE_COLUMNS.map((c) => c.key),
      ['select', 'status', 'title', 'qty', 'condition', 'age', 'notes', 'platform', 'order', 'tracking'],
    );
    // Each track = its width CSS var with the model width as the fallback, so a
    // persisted/resized width overrides with zero template rebuild.
    assert.equal(
      ordersQueueGridTemplate(),
      ORDERS_QUEUE_COLUMNS.map((c) => `var(--cf-col-${c.key}, ${c.width})`).join(' '),
      'template drives each track from its width CSS var',
    );
  });

  it('resize helpers: only data columns resize; widths → CSS vars', () => {
    assert.deepEqual(
      [...ORDERS_QUEUE_RESIZABLE_KEYS],
      ['title', 'qty', 'condition', 'age', 'notes', 'platform', 'order', 'tracking'],
      'select + status control gutters are not resizable',
    );
    assert.equal(ordersQueueColVar('title'), '--cf-col-title');
    assert.deepEqual(ordersQueueColumnVars({ title: 320, qty: 60 }), {
      '--cf-col-title': '320px',
      '--cf-col-qty': '60px',
    });
    assert.deepEqual(ordersQueueColumnVars({}), {}, 'no widths → no vars (all default)');
  });

  it('control gutters carry no label/type; every data column is typed + labelled', () => {
    const byKey = Object.fromEntries(ORDERS_QUEUE_COLUMNS.map((c) => [c.key, c]));
    assert.equal(byKey.select.label, undefined, 'select is a control gutter');
    assert.equal(byKey.status.type, undefined, 'status is a control gutter');
    for (const k of ['title', 'qty', 'condition', 'age', 'notes', 'platform', 'order', 'tracking']) {
      assert.ok(byKey[k].type, `${k} has a data-type glyph`);
      assert.ok(byKey[k].label, `${k} has a header label`);
    }
  });

  it('hideable columns map to their TableColumnConfig keys (order → orderid)', () => {
    const hide = Object.fromEntries(
      ORDERS_QUEUE_COLUMNS.filter((c) => c.hideKey).map((c) => [c.key, c.hideKey]),
    );
    assert.deepEqual(hide, {
      qty: 'qty',
      condition: 'condition',
      platform: 'platform',
      order: 'orderid',
      tracking: 'tracking',
    });
  });
});
