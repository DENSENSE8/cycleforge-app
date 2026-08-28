import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LEDGER_GRID_CELL_INSET,
  ledgerGridCell,
} from '@/design-system/components/grid/grid-cell-chrome';
import { gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import {
  ORDERS_QUEUE_CELL_INSET,
  ORDERS_QUEUE_COLUMNS,
  ORDERS_QUEUE_RESIZABLE_KEYS,
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
} from '@/lib/dashboard-order-row-layout';

/**
 * Cell-chrome contract lives in
 * `src/design-system/components/grid/grid-cell-chrome.test.ts`. These assert the
 * Orders layout still re-exports the DS SoT under the legacy names.
 */
describe('ordersQueueGridCell — thin alias onto ledgerGridCell', () => {
  it('re-exports the DS chrome helper', () => {
    assert.equal(ordersQueueGridCell, ledgerGridCell);
    assert.equal(ORDERS_QUEUE_CELL_INSET, LEDGER_GRID_CELL_INSET);
    assert.ok(ordersQueueGridCell().includes(ORDERS_QUEUE_CELL_INSET));
    assert.ok(!ordersQueueGridCell().includes('border-r'), 'no vertical column rule (1B)');
  });

  it('preserves inset / rule options through the alias', () => {
    assert.ok(!ordersQueueGridCell({ rule: false }).includes('border-r'));
    assert.ok(ordersQueueGridCell({ inset: 'grid' }).includes('overflow-hidden'));
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

  it('grid template flexes ONLY trailing _fill (Product is hard + resizable)', () => {
    // Fact + Product tracks are content-hard minmax(X,X); `_fill` owns 1fr.
    const template = ordersQueueGridTemplate();
    assert.equal((template.match(/1fr/g) ?? []).length, 1, 'only _fill flexes');
    assert.ok(
      template.includes('var(--cf-col-title, calc(12rem * var(--cf-density, 1)))'),
      'Product hard track uses the density-scaled width CSS var',
    );
    assert.ok(
      template.includes(
        'minmax(var(--cf-col-_fill, calc(0rem * var(--cf-density, 1))), 1fr)',
      ),
      '_fill flex track absorbs leftover sheet width',
    );
  });
});

describe('ORDERS_QUEUE_COLUMNS — the column model header + template share', () => {
  it('is the triage scan order and derives the CSS-var template (no drift)', () => {
    assert.deepEqual(
      ORDERS_QUEUE_COLUMNS.map((c) => c.key),
      [
        'select',
        'order',
        'age',
        'title',
        'stage',
        'tester',
        'testedAt',
        'packer',
        'packedAt',
        'packStation',
        'urgent',
        'condition',
        'qty',
        'tracking',
        '_fill',
      ],
    );
    // Each track = its width CSS var with the model width as the fallback, so a
    // persisted/resized width overrides with zero template rebuild. Flex tracks
    // wrap only the min in the var (`minmax(var(...), 1fr)`).
    assert.equal(
      ordersQueueGridTemplate(),
      gridTemplate(ORDERS_QUEUE_COLUMNS),
      'template drives each track from its width CSS var',
    );
  });

  it('resize helpers: Product-only; widths → CSS vars', () => {
    assert.deepEqual(
      [...ORDERS_QUEUE_RESIZABLE_KEYS],
      ['title'],
      'only Product exposes a drag-resize grip',
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
    for (const k of ['title', 'age', 'condition', 'qty', 'order', 'tracking']) {
      assert.ok(byKey[k].type, `${k} has a data-type glyph`);
      assert.ok(byKey[k].label, `${k} has a header label`);
    }
    assert.equal(byKey.age.label, 'Late');
    assert.equal(byKey.condition.label, 'Cond');
    assert.equal(byKey.tracking.label, 'Tracking');
    assert.equal(byKey.tracking.gridLabel, undefined, 'no Track short-label — full Tracking when it fits');
    assert.equal(
      byKey.order.width,
      'minmax(5.5rem, 5.5rem)',
      'ORDER track matches Unbox History so last-8 + brand dot does not ellipsis',
    );
  });

  it('hideable columns map to their TableColumnConfig keys', () => {
    const hide = Object.fromEntries(
      ORDERS_QUEUE_COLUMNS.filter((c) => c.hideKey).map((c) => [c.key, c.hideKey]),
    );
    assert.deepEqual(hide, {
      tester: 'tester',
      testedAt: 'testedAt',
      packer: 'packer',
      packedAt: 'packedAt',
      packStation: 'packStation',
      urgent: 'urgent',
      condition: 'condition',
      qty: 'qty',
      tracking: 'tracking',
    });
  });
});

describe('orders queue content mins + adaptive headers + viewport collapse', () => {
  it('fact + Product tracks are hard minmax; _fill is the only flex track', () => {
    const byKey = Object.fromEntries(ORDERS_QUEUE_COLUMNS.map((c) => [c.key, c]));
    assert.match(byKey.title.width, /^minmax\(12rem, 12rem\)$/, 'Product is hard + resizable');
    assert.ok(byKey._fill.width.includes('1fr'), '_fill absorbs leftover space');
    for (const k of ['age', 'condition', 'qty', 'order', 'tracking'] as const) {
      assert.match(byKey[k].width, /^minmax\([\d.]+rem, [\d.]+rem\)$/, `${k} is content-hard`);
    }
  });

  it('header shows a visible label only when the track rem ≥ labelFitRem', () => {
    const byKey = Object.fromEntries(ORDERS_QUEUE_COLUMNS.map((c) => [c.key, c]));
    assert.equal(ordersQueueColumnTrackRem(byKey.qty), 3.5);
    assert.equal(ordersQueueHeaderShowsLabel(byKey.qty), true, 'Qty fits its label floor');
    assert.equal(ordersQueueHeaderShowsLabel(byKey.tracking), true, 'Tracking fits its label floor');
    assert.equal(ordersQueueHeaderShowsLabel(byKey.age), true, 'Late fits');
    assert.equal(ordersQueueHeaderShowsLabel(byKey.title), true, 'Product fits');
  });

  it('content min-width rem is the sum of track floors', () => {
    const sum = ORDERS_QUEUE_COLUMNS.reduce((s, c) => s + ordersQueueColumnTrackRem(c), 0);
    assert.equal(ordersQueueContentMinWidthRem(), sum);
    assert.ok(sum > 20, 'full grid needs a real horizontal min');
  });

  it('viewport force-hide collapses Qty as width tightens (age stays visible)', () => {
    assert.deepEqual([...ordersQueueViewportForceHidden(800)], []);
    assert.deepEqual([...ordersQueueViewportForceHidden(700)], []);
    assert.deepEqual([...ordersQueueViewportForceHidden(600)], ['qty']);
    assert.deepEqual([...ordersQueueViewportForceHidden(500)], ['qty']);
  });

  it('scrollMinContent row shell shares --cf-orders-grid-w (locked columns)', () => {
    const cls = ordersQueueRowShellClass(false, { scrollMinContent: true });
    assert.ok(cls.includes('--cf-orders-grid-w'), 'shared width var locks tracks across rows');
    assert.ok(!cls.includes('w-max'), 'never w-max — that drifted columns per product title');
    assert.ok(!ordersQueueRowShellClass(false).includes('--cf-orders-grid-w'), 'board keeps w-full min-w-0');
    assert.equal(
      ordersQueueGridWidthVarValue(41.25),
      'max(100%, calc(41.25rem * var(--cf-density, 1)))',
    );
  });
});
