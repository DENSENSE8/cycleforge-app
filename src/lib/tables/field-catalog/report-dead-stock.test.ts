/** Dead-stock catalog guards, materialization and adapter behaviour — the family that replaced `/reports`' `DEAD_COLUMNS`. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import {
  REPORT_DEAD_STOCK_COMPOUND_COLUMNS,
  reportDeadStockCompoundColumnsFor,
  reportDeadStockSortFactFor,
} from '@/components/reports/report-dead-stock-grid/report-dead-stock-grid-layout';
import { reportDeadStockCompoundView } from '@/components/reports/report-dead-stock-grid/report-dead-stock-row-view';
import type { DeadStockReportRow } from '@/lib/reports/report-rows';
import {
  REPORT_DEAD_STOCK_FIELD_CATALOG,
  REPORT_DEAD_STOCK_PRODUCT_LAYOUT,
} from './report-dead-stock';
import { resolveReportDeadStockSlotValue } from './report-dead-stock-resolve';

import { MAX_DEFAULT_VISIBLE_TRACKS } from '../table-definition';

/** The skeleton's six non-gutter chrome tracks leave this many status slots. */
const STATUS_SLOT_BUDGET = MAX_DEFAULT_VISIBLE_TRACKS - 6;

function row(overrides: Partial<DeadStockReportRow> = {}): DeadStockReportRow {
  return {
    sku: 'AMP-CHASSIS-77',
    product_title: 'Amp chassis, 77 series',
    stock: 4,
    last_move_at: '2026-03-02T09:15:00.000Z',
    days_dormant: 184,
    ...overrides,
  };
}

describe('report-dead-stock catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = REPORT_DEAD_STOCK_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of REPORT_DEAD_STOCK_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'report-dead-stock', `${field.id} is not a dead-stock fact`);
      assert.ok(field.id.startsWith('report-dead-stock.'), `${field.id} is not qualified`);
    }
  });

  it('names the four painted facts plus the ONE chrome-carried stamp', () => {
    assert.deepEqual(
      REPORT_DEAD_STOCK_FIELD_CATALOG.map((f) => f.id),
      [
        'report-dead-stock.sku',
        'report-dead-stock.product',
        'report-dead-stock.stock',
        'report-dead-stock.days_dormant',
        // Painted by NO retired cell, and a fact because the mandatory Dates
        // chrome paints it — see the catalog docblock.
        'report-dead-stock.last_move',
      ],
    );
  });

  it('product default parses, and the SKU is the identity', () => {
    const parsed = REPORT_DEAD_STOCK_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'report-dead-stock.sku');
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['report-dead-stock.stock'],
    );
    assert.deepEqual(parsed.subtitleBindings, []);
    // The route selects no price, so there is no money fact to bind.
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('stays inside the FOUR status slots the whole skeleton leaves', () => {
    assert.equal(STATUS_SLOT_BUDGET, 4);
    assert.ok(
      REPORT_DEAD_STOCK_PRODUCT_LAYOUT.statusBindings.length <= STATUS_SLOT_BUDGET,
      'a fifth status binding fails parseTableDefinition at module load',
    );
  });

  it('leaves the chrome-painted facts UNBOUND but still bindable', () => {
    const bound = new Set([
      REPORT_DEAD_STOCK_PRODUCT_LAYOUT.identityFieldId,
      ...REPORT_DEAD_STOCK_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...REPORT_DEAD_STOCK_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = REPORT_DEAD_STOCK_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map(
      (f) => f.id,
    );
    // Title, state pill and Dates chrome paint these three.
    assert.deepEqual(unbound, [
      'report-dead-stock.product',
      'report-dead-stock.days_dormant',
      'report-dead-stock.last_move',
    ]);
    for (const id of unbound) {
      const field = REPORT_DEAD_STOCK_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('report-dead-stock materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = REPORT_DEAD_STOCK_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    assert.equal(
      REPORT_DEAD_STOCK_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:'))
        .length,
      0,
    );
    assert.equal(
      REPORT_DEAD_STOCK_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:')).length,
      REPORT_DEAD_STOCK_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const col = (key: string) => REPORT_DEAD_STOCK_COMPOUND_COLUMNS.find((c) => c.key === key);
    assert.equal(col('item')?.label, 'Product');
    assert.equal(col('dates')?.label, 'Last move');
    assert.equal(col('state')?.label, 'Dormant');
    const identity = col('fulfillment');
    assert.equal(identity?.fieldId, 'report-dead-stock.sku');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`data-table-family.ts`). "SKU" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('types the dormancy pill NUMERICALLY without binding a slot to it', () => {
    const state = REPORT_DEAD_STOCK_COMPOUND_COLUMNS.find((c) => c.key === 'state');
    assert.equal(state?.slotDisplayType, 'number');
    // No `fieldId`, or the engine would resolve a slot value for a cell that
    // paints `view.stateLabel`.
    assert.equal(state?.fieldId, undefined);
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = reportDeadStockCompoundColumnsFor({
      ...REPORT_DEAD_STOCK_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'report-dead-stock.days_dormant' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'report-dead-stock.days_dormant');
  });

  it('every painted DATA header sorts; chrome stays dead', () => {
    for (const col of REPORT_DEAD_STOCK_COMPOUND_COLUMNS) {
      if (isDataTableChromeColumn(col.key)) {
        assert.equal(reportDeadStockSortFactFor(col), null, `${col.key} is chrome`);
        continue;
      }
      assert.ok(
        reportDeadStockSortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(reportDeadStockSortFactFor({ key: 'fulfillment' }), 'report-dead-stock.sku');
    assert.equal(reportDeadStockSortFactFor({ key: 'item' }), 'report-dead-stock.product');
    assert.equal(
      reportDeadStockSortFactFor({ key: 'state' }),
      'report-dead-stock.days_dormant',
    );
    assert.equal(reportDeadStockSortFactFor({ key: 'dates' }), 'report-dead-stock.last_move');
  });
});

describe('report-dead-stock resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of REPORT_DEAD_STOCK_FIELD_CATALOG) {
      assert.notEqual(
        resolveReportDeadStockSlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it('resolves the dormancy count as BARE DIGITS, never with a `d` suffix', () => {
    assert.deepEqual(
      resolveReportDeadStockSlotValue(row(), 'report-dead-stock.days_dormant'),
      { kind: 'value', text: '184' },
    );
    assert.deepEqual(resolveReportDeadStockSlotValue(row(), 'report-dead-stock.stock'), {
      kind: 'value',
      text: '4',
    });
  });

  it('a never-moved SKU resolves to BLANK, never to 0 and never to NaN', () => {
    const never = row({ days_dormant: null, last_move_at: null });
    assert.deepEqual(
      resolveReportDeadStockSlotValue(never, 'report-dead-stock.days_dormant'),
      { kind: 'value', text: null },
    );
    assert.deepEqual(resolveReportDeadStockSlotValue(never, 'report-dead-stock.last_move'), {
      kind: 'value',
      text: null,
    });
  });

  it('resolves `last_move` to the absolute instant, not a face', () => {
    assert.deepEqual(resolveReportDeadStockSlotValue(row(), 'report-dead-stock.last_move'), {
      kind: 'value',
      text: '2026-03-02T09:15:00.000Z',
    });
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveReportDeadStockSlotValue(row(), 'report-velocity.out_qty'), null);
  });
});

describe('report-dead-stock row view', () => {
  it('paints the product as the title and the dormancy as the pill', () => {
    const view = reportDeadStockCompoundView(row());
    assert.equal(view.id, 'AMP-CHASSIS-77');
    assert.equal(view.title, 'Amp chassis, 77 series');
    assert.equal(view.titleHref, '/inventory/health/sku/AMP-CHASSIS-77');
    assert.equal(view.identityFace?.value, 'AMP-CHASSIS-77');
    assert.equal(view.stateLabel, '184d');
    assert.equal(view.stateTone, 'neutral');
    assert.equal(view.stateTip, '184 days since the last ledger write');
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });

  it('names the never-moved row instead of printing NaN', () => {
    const view = reportDeadStockCompoundView(row({ days_dormant: null, last_move_at: null }));
    assert.equal(view.stateLabel, 'Never moved');
    assert.equal(view.stateTip, '4 in stock with no ledger write on this SKU');
    assert.equal(view.orderedAt, null);
    assert.equal(view.startedHover, undefined);
  });

  it('puts the last-move stamp on the Dates Hash line and no deadline below', () => {
    const view = reportDeadStockCompoundView(row());
    assert.equal(view.orderedAt?.dateKey, '2026-03-02');
    assert.ok(view.orderedAt?.label && !view.orderedAt.label.includes(':'));
    assert.equal(view.startedHover, `Last move ${view.orderedAt?.label}`);
    assert.equal(view.delay, null);
  });

  it('names a titleless SKU by its handle', () => {
    const view = reportDeadStockCompoundView(row({ product_title: null }));
    assert.equal(view.title, 'AMP-CHASSIS-77');
  });
});
