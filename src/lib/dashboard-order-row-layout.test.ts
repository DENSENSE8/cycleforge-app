import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ORDERS_QUEUE_CELL_INSET,
  ORDERS_QUEUE_COLUMNS,
  ORDERS_QUEUE_LOCKED_KEYS,
  ORDERS_QUEUE_RESIZABLE_KEYS,
  orderedOrdersQueueColumns,
  ordersQueueColVar,
  ordersQueueColumnTrackRem,
  ordersQueueColumnVars,
  ordersQueueContentMinWidthRem,
  ordersQueueGridCell,
  ordersQueueGridTemplate,
  ordersQueueGridWidthVarValue,
  ordersQueueHeaderShowsLabel,
  ordersQueueRowShellClass,
  ordersQueueViewportForceHidden,
  sanitizeOrdersQueueColumnOrder,
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

  it('grid template flexes ONLY title (purposeful-cell doctrine)', () => {
    // Fact tracks are content-hard minmax(X,X); only title carries 1fr.
    const template = ordersQueueGridTemplate();
    assert.equal((template.match(/1fr/g) ?? []).length, 1, 'only title flexes');
    assert.ok(template.includes('minmax(12rem, 1fr)'), 'title is minmax(12rem, 1fr)');
  });
});

describe('ORDERS_QUEUE_COLUMNS — the column model header + template share', () => {
  it('is the 8-column scan order and derives the CSS-var template (no drift)', () => {
    assert.deepEqual(
      ORDERS_QUEUE_COLUMNS.map((c) => c.key),
      ['select', 'title', 'date', 'age', 'qty', 'condition', 'order', 'tracking'],
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
      ['title', 'date', 'age', 'qty', 'condition', 'order', 'tracking'],
      'select control gutter is not resizable',
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
    for (const k of ['title', 'date', 'age', 'qty', 'condition', 'order', 'tracking']) {
      assert.ok(byKey[k].type, `${k} has a data-type glyph`);
      assert.ok(byKey[k].label, `${k} has a header label`);
    }
    assert.equal(byKey.date.label, 'Ship by');
  });

  it('hideable columns map to their TableColumnConfig keys (order → orderid)', () => {
    const hide = Object.fromEntries(
      ORDERS_QUEUE_COLUMNS.filter((c) => c.hideKey).map((c) => [c.key, c.hideKey]),
    );
    assert.deepEqual(hide, {
      qty: 'qty',
      condition: 'condition',
      order: 'orderid',
      tracking: 'tracking',
    });
  });
});

/**
 * Per-staff column-order sanitizer — the safety layer between
 * `staff_preferences.tableColumns['orders'].order` (untrusted, possibly stale)
 * and the rendered grid. Locked keys can never move; retired keys (the old
 * `notes` column) silently drop; new SoT columns ship at their canonical slot.
 */
describe('sanitizeOrdersQueueColumnOrder — persisted order → safe full order', () => {
  const CANONICAL = ORDERS_QUEUE_COLUMNS.map((c) => c.key);

  it('empty / missing order falls back to the canonical order', () => {
    assert.deepEqual(sanitizeOrdersQueueColumnOrder(undefined), CANONICAL);
    assert.deepEqual(sanitizeOrdersQueueColumnOrder(null), CANONICAL);
    assert.deepEqual(sanitizeOrdersQueueColumnOrder([]), CANONICAL);
  });

  it('locked keys are always first in canonical relative order — persisted order cannot displace them', () => {
    const out = sanitizeOrdersQueueColumnOrder(['tracking', 'title', 'select', 'qty']);
    assert.deepEqual(out.slice(0, ORDERS_QUEUE_LOCKED_KEYS.length), ORDERS_QUEUE_LOCKED_KEYS);
    assert.equal(out[0], 'select');
    assert.equal(out[1], 'title');
  });

  it('known movable keys keep their persisted relative order', () => {
    const out = sanitizeOrdersQueueColumnOrder([
      'tracking', 'order', 'condition', 'qty', 'age', 'date',
    ]);
    assert.deepEqual(out, [
      'select', 'title',
      'tracking', 'order', 'condition', 'qty', 'age', 'date',
    ]);
  });

  it('unknown keys (retired notes / stock / status / platform) are silently dropped', () => {
    const out = sanitizeOrdersQueueColumnOrder([
      'date', 'age', 'status', 'qty', 'condition', 'notes', 'stock', 'platform', 'order', 'tracking',
    ]);
    assert.ok(!(out as string[]).includes('notes'));
    assert.ok(!(out as string[]).includes('stock'));
    assert.ok(!(out as string[]).includes('status'));
    assert.ok(!(out as string[]).includes('platform'));
    assert.deepEqual(out, [
      'select', 'title', 'date', 'age', 'qty', 'condition', 'order', 'tracking',
    ]);
  });

  it('missing canonical keys are inserted at their canonical position', () => {
    const out = sanitizeOrdersQueueColumnOrder([
      'date', 'age', 'qty', 'condition', 'order', 'tracking',
    ]);
    assert.deepEqual(out, [
      'select', 'title', 'date', 'age', 'qty', 'condition', 'order', 'tracking',
    ]);
  });

  it('duplicate keys collapse to the first occurrence', () => {
    const out = sanitizeOrdersQueueColumnOrder(['qty', 'qty', 'date', 'qty']);
    assert.equal(out.filter((k) => k === 'qty').length, 1);
    assert.equal(out.length, CANONICAL.length);
  });

  it('every canonical column appears exactly once, for any input', () => {
    for (const input of [
      ['garbage'],
      ['tracking'],
      ['select', 'select', 'title'],
      [...CANONICAL].reverse(),
    ]) {
      const out = sanitizeOrdersQueueColumnOrder(input);
      assert.deepEqual([...out].sort(), [...CANONICAL].sort());
    }
  });

  it('orderedOrdersQueueColumns + ordersQueueGridTemplate respect the order', () => {
    const order = ['tracking', 'date', 'age', 'qty', 'condition', 'order'];
    const cols = orderedOrdersQueueColumns(order);
    assert.equal(cols[2].key, 'tracking', 'first movable column is the persisted first key');
    const template = ordersQueueGridTemplate(order);
    assert.ok(template.startsWith('var(--cf-col-select, minmax(2rem, 2rem)) var(--cf-col-title,'));
    assert.ok(
      template.indexOf('--cf-col-tracking') < template.indexOf('--cf-col-date'),
      'tracking track renders before date',
    );
    // No-arg call still yields the canonical template.
    assert.equal(ordersQueueGridTemplate(), ordersQueueGridTemplate(CANONICAL));
  });
});

describe('orders queue content mins + adaptive headers + viewport collapse', () => {
  it('fact tracks are hard minmax floors; title is the only flex track', () => {
    const byKey = Object.fromEntries(ORDERS_QUEUE_COLUMNS.map((c) => [c.key, c]));
    assert.ok(byKey.title.width.includes('1fr'), 'title flexes leftover space');
    for (const k of ['date', 'age', 'qty', 'condition', 'order', 'tracking'] as const) {
      assert.match(byKey[k].width, /^minmax\([\d.]+rem, [\d.]+rem\)$/, `${k} is content-hard`);
    }
  });

  it('header shows a visible label only when the track rem ≥ labelFitRem', () => {
    const byKey = Object.fromEntries(ORDERS_QUEUE_COLUMNS.map((c) => [c.key, c]));
    assert.equal(ordersQueueColumnTrackRem(byKey.age), 3);
    assert.equal(ordersQueueHeaderShowsLabel(byKey.age), false, 'Age is glyph-only');
    assert.equal(ordersQueueHeaderShowsLabel(byKey.tracking), false, 'Tracking is glyph-only');
    assert.equal(ordersQueueHeaderShowsLabel(byKey.date), true, 'By fits 4.5rem');
    assert.equal(ordersQueueHeaderShowsLabel(byKey.condition), true, 'Cond fits');
    assert.equal(ordersQueueHeaderShowsLabel(byKey.title), true, 'Product fits');
  });

  it('content min-width rem is the sum of track floors', () => {
    const sum = ORDERS_QUEUE_COLUMNS.reduce((s, c) => s + ordersQueueColumnTrackRem(c), 0);
    assert.equal(ordersQueueContentMinWidthRem(), sum);
    assert.ok(sum > 30, 'full grid needs a real horizontal min');
  });

  it('viewport force-hide collapses By → Qty → Cond as width tightens', () => {
    assert.deepEqual([...ordersQueueViewportForceHidden(800)], []);
    assert.deepEqual([...ordersQueueViewportForceHidden(700)], ['date']);
    assert.deepEqual([...ordersQueueViewportForceHidden(600)], ['date', 'qty']);
    assert.deepEqual([...ordersQueueViewportForceHidden(500)].sort(), ['condition', 'date', 'qty']);
  });

  it('scrollMinContent row shell shares --cf-orders-grid-w (locked columns)', () => {
    const cls = ordersQueueRowShellClass(false, { scrollMinContent: true });
    assert.ok(cls.includes('--cf-orders-grid-w'), 'shared width var locks tracks across rows');
    assert.ok(!cls.includes('w-max'), 'never w-max — that drifted columns per product title');
    assert.ok(!ordersQueueRowShellClass(false).includes('--cf-orders-grid-w'), 'board keeps w-full min-w-0');
    assert.equal(ordersQueueGridWidthVarValue(41.25), 'max(100%, 41.25rem)');
  });
});
