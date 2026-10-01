/** SKU-velocity catalog guards, materialization and adapter behaviour — the family that replaced `/reports`' `VELOCITY_COLUMNS`. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isDataTableChromeColumn } from '@/lib/tables/data-table-header-sort';
import {
  REPORT_VELOCITY_COMPOUND_COLUMNS,
  reportVelocityCompoundColumnsFor,
  reportVelocitySortFactFor,
} from '@/components/reports/report-velocity-grid/report-velocity-grid-layout';
import { reportVelocityCompoundView } from '@/components/reports/report-velocity-grid/report-velocity-row-view';
import type { VelocityReportRow } from '@/lib/reports/report-rows';
import {
  REPORT_VELOCITY_FIELD_CATALOG,
  REPORT_VELOCITY_PRODUCT_LAYOUT,
} from './report-velocity';
import { resolveReportVelocitySlotValue } from './report-velocity-resolve';

import { MAX_DEFAULT_VISIBLE_TRACKS } from '../table-definition';

/** The skeleton's six non-gutter chrome tracks leave this many status slots. */
const STATUS_SLOT_BUDGET = MAX_DEFAULT_VISIBLE_TRACKS - 6;

function row(overrides: Partial<VelocityReportRow> = {}): VelocityReportRow {
  return {
    sku: 'BOSE-901-TW',
    product_title: 'Bose 901 tweeter assembly',
    current_stock: 12,
    out_qty: 64,
    in_qty: 9,
    last_move_at: '2026-09-08T14:22:00.000Z',
    velocity_tier: 'A',
    ...overrides,
  };
}

describe('report-velocity catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = REPORT_VELOCITY_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of REPORT_VELOCITY_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'report-velocity', `${field.id} is not a velocity fact`);
      assert.ok(field.id.startsWith('report-velocity.'), `${field.id} is not qualified`);
    }
  });

  it('names the six painted facts plus the ONE chrome-carried stamp', () => {
    assert.deepEqual(
      REPORT_VELOCITY_FIELD_CATALOG.map((f) => f.id),
      [
        'report-velocity.sku',
        'report-velocity.product',
        'report-velocity.tier',
        'report-velocity.out_qty',
        'report-velocity.in_qty',
        'report-velocity.stock',
        // Painted by NO retired cell, and a fact because the mandatory Dates
        // chrome paints it — see the catalog docblock.
        'report-velocity.last_move',
      ],
    );
  });

  it('product default parses, and the SKU is the identity', () => {
    const parsed = REPORT_VELOCITY_PRODUCT_LAYOUT;
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'report-velocity.sku');
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['report-velocity.out_qty', 'report-velocity.in_qty', 'report-velocity.stock'],
    );
    assert.deepEqual(parsed.subtitleBindings, []);
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('stays inside the FOUR status slots the whole skeleton leaves', () => {
    assert.equal(STATUS_SLOT_BUDGET, 4);
    assert.ok(
      REPORT_VELOCITY_PRODUCT_LAYOUT.statusBindings.length <= STATUS_SLOT_BUDGET,
      'a fifth status binding fails parseTableDefinition at module load',
    );
  });

  it('leaves the chrome-painted facts UNBOUND but still bindable', () => {
    const bound = new Set([
      REPORT_VELOCITY_PRODUCT_LAYOUT.identityFieldId,
      ...REPORT_VELOCITY_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...REPORT_VELOCITY_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = REPORT_VELOCITY_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map((f) => f.id);
    // Title, state pill and Dates chrome paint these three.
    assert.deepEqual(unbound, [
      'report-velocity.product',
      'report-velocity.tier',
      'report-velocity.last_move',
    ]);
    for (const id of unbound) {
      const field = REPORT_VELOCITY_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('report-velocity materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = REPORT_VELOCITY_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    assert.equal(
      REPORT_VELOCITY_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:')).length,
      0,
    );
    assert.equal(
      REPORT_VELOCITY_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:')).length,
      REPORT_VELOCITY_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const col = (key: string) => REPORT_VELOCITY_COMPOUND_COLUMNS.find((c) => c.key === key);
    assert.equal(col('item')?.label, 'Product');
    assert.equal(col('dates')?.label, 'Last move');
    assert.equal(col('state')?.label, 'Tier');
    const identity = col('fulfillment');
    assert.equal(identity?.fieldId, 'report-velocity.sku');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`data-table-family.ts`). "SKU" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = reportVelocityCompoundColumnsFor({
      ...REPORT_VELOCITY_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'report-velocity.tier' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'report-velocity.tier');
  });

  it('every painted DATA header sorts; chrome stays dead', () => {
    for (const col of REPORT_VELOCITY_COMPOUND_COLUMNS) {
      if (isDataTableChromeColumn(col.key)) {
        assert.equal(reportVelocitySortFactFor(col), null, `${col.key} is chrome`);
        continue;
      }
      assert.ok(
        reportVelocitySortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(reportVelocitySortFactFor({ key: 'fulfillment' }), 'report-velocity.sku');
    assert.equal(reportVelocitySortFactFor({ key: 'item' }), 'report-velocity.product');
    assert.equal(reportVelocitySortFactFor({ key: 'state' }), 'report-velocity.tier');
    assert.equal(reportVelocitySortFactFor({ key: 'dates' }), 'report-velocity.last_move');
  });
});

describe('report-velocity resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of REPORT_VELOCITY_FIELD_CATALOG) {
      assert.notEqual(
        resolveReportVelocitySlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it('resolves counts as DIGITS so a number track sorts numerically', () => {
    assert.deepEqual(resolveReportVelocitySlotValue(row(), 'report-velocity.out_qty'), {
      kind: 'value',
      text: '64',
    });
    assert.deepEqual(resolveReportVelocitySlotValue(row(), 'report-velocity.in_qty'), {
      kind: 'value',
      text: '9',
    });
  });

  it('a SKU with no stock row resolves to null text, never to 0', () => {
    assert.deepEqual(
      resolveReportVelocitySlotValue(row({ current_stock: null }), 'report-velocity.stock'),
      { kind: 'value', text: null },
    );
  });

  it('resolves `last_move` to the absolute instant, not a face', () => {
    assert.deepEqual(resolveReportVelocitySlotValue(row(), 'report-velocity.last_move'), {
      kind: 'value',
      text: '2026-09-08T14:22:00.000Z',
    });
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveReportVelocitySlotValue(row(), 'report-dead-stock.stock'), null);
  });
});

describe('report-velocity row view', () => {
  it('paints the product as the title and the tier as the pill', () => {
    const view = reportVelocityCompoundView(row());
    assert.equal(view.id, 'BOSE-901-TW');
    assert.equal(view.title, 'Bose 901 tweeter assembly');
    assert.equal(view.titleHref, '/inventory/health/sku/BOSE-901-TW');
    assert.equal(view.identityFace?.value, 'BOSE-901-TW');
    assert.equal(view.stateLabel, 'A');
    assert.equal(view.stateTip, 'Tier A — 64 out in the last 30 days');
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });

  it('keeps EVERY row neutral — the retired rose/emerald was decoration', () => {
    for (const tier of ['A', 'B', 'C', 'D'] as const) {
      const view = reportVelocityCompoundView(row({ velocity_tier: tier }));
      assert.equal(view.stateTone, 'neutral', `tier ${tier} borrowed an urgency tone`);
    }
  });

  it('puts the last-move stamp on the Dates Hash line and no deadline below', () => {
    const view = reportVelocityCompoundView(row());
    assert.equal(view.orderedAt?.dateKey, '2026-09-08');
    assert.ok(view.orderedAt?.label && !view.orderedAt.label.includes(':'));
    assert.equal(view.startedHover, `Last move ${view.orderedAt?.label}`);
    assert.equal(view.delay, null);
  });

  it('names a titleless SKU by its handle and drops an unusable stamp', () => {
    const view = reportVelocityCompoundView(row({ product_title: null, last_move_at: null }));
    assert.equal(view.title, 'BOSE-901-TW');
    assert.equal(view.orderedAt, null);
    assert.equal(view.startedHover, undefined);
  });
});
