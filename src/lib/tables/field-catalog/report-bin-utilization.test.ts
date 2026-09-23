/**
 * Bin-utilization catalog guards, materialization and adapter behaviour — the
 * family that replaced `/reports`' `UTILIZATION_COLUMNS`.
 *
 * Three assertions here are load-bearing beyond the usual shape checks:
 *
 * - the DERIVED FILL. `fill_ratio` is a ratio on the wire and a percentage on
 *   the desk. A `paths: { value: 'fill_ratio' }` entry would promise the engine
 *   a column it can read straight off the row, and `0.88` is not the number
 *   the desk shows. This test fails the day the derivation turns into a path.
 * - the UNPAINTED LOCATION columns. `row_label` / `col_label` are selected by
 *   the route and painted by nothing; a future agent reading "the row already
 *   has the data" will be tempted to bind them.
 * - the FACTLESS `dates` CHROME. This report has no temporal column at all, so
 *   the mandatory Dates track is declared inert rather than cut from the shared
 *   skeleton. That is the one exception to "every painted DATA header sorts"
 *   in this family, and it has to be pinned as a decision so it cannot decay
 *   into a dead header nobody noticed — or be quietly widened to a second
 *   track.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import {
  REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS,
  reportBinUtilizationCompoundColumnsFor,
  reportBinUtilizationSortFactFor,
} from '@/components/reports/report-bin-utilization-grid/report-bin-utilization-grid-layout';
import { reportBinUtilizationCompoundView } from '@/components/reports/report-bin-utilization-grid/report-bin-utilization-row-view';
import type { BinUtilizationReportRow } from '@/lib/reports/report-rows';
import {
  REPORT_BIN_UTILIZATION_FIELD_CATALOG,
  REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT,
} from './report-bin-utilization';
import {
  binFillPercent,
  resolveReportBinUtilizationSlotValue,
} from './report-bin-utilization-resolve';
import { parseSlotLayout } from '../slot-layout';
import { MAX_DEFAULT_VISIBLE_TRACKS } from '../table-definition';

/** Selected by the route, painted by nothing, and not a fact until one paints it. */
const UNPAINTED_LOCATION_COLUMNS = ['row_label', 'col_label'] as const;

/**
 * The one chrome track this family paints no fact into — `mv_bin_utilization`
 * carries no timestamp in the route's SELECT.
 */
const FACTLESS_CHROME_KEYS = ['dates'] as const;

/**
 * The compound skeleton leaves exactly this many status slots under
 * `MAX_DEFAULT_VISIBLE_TRACKS`: fulfillment · thumb · item · dates · state ·
 * _fill are six, and `select` is the structural gutter the ceiling excludes.
 */
const STATUS_SLOT_BUDGET = MAX_DEFAULT_VISIBLE_TRACKS - 6;

function row(overrides: Partial<BinUtilizationReportRow> = {}): BinUtilizationReportRow {
  return {
    bin_id: 4821,
    bin_name: 'A-12-3',
    barcode: 'BIN-A123',
    room: 'Main floor',
    capacity: 40,
    in_bin: 35,
    fill_ratio: 0.875,
    sku_count: 6,
    ...overrides,
  };
}

describe('report-bin-utilization catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = REPORT_BIN_UTILIZATION_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of REPORT_BIN_UTILIZATION_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'report-bin-utilization', `${field.id} is not a bin fact`);
      assert.ok(field.id.startsWith('report-bin-utilization.'), `${field.id} is not qualified`);
    }
  });

  it('names the SIX facts the six retired cells painted, and no others', () => {
    assert.deepEqual(
      REPORT_BIN_UTILIZATION_FIELD_CATALOG.map((f) => f.id),
      [
        'report-bin-utilization.bin',
        'report-bin-utilization.room',
        'report-bin-utilization.fill',
        'report-bin-utilization.in_bin',
        'report-bin-utilization.capacity',
        'report-bin-utilization.sku_count',
      ],
    );
  });

  it('DERIVES fill rather than pathing it at `fill_ratio`', () => {
    const fill = REPORT_BIN_UTILIZATION_FIELD_CATALOG.find(
      (f) => f.id === 'report-bin-utilization.fill',
    );
    // The ratio is an INPUT, named so a reader can find it — never a `value`
    // path the engine could read as the painted number.
    assert.deepEqual(fill?.paths, { ratio: 'fill_ratio' });
    assert.equal(fill?.paths?.value, undefined);
    // And what the resolver answers is the PERCENTAGE, not the ratio.
    assert.deepEqual(resolveReportBinUtilizationSlotValue(row(), 'report-bin-utilization.fill'), {
      kind: 'value',
      text: '88',
    });
    assert.equal(binFillPercent(row({ fill_ratio: 0.875 })), 88);
    assert.equal(binFillPercent(row({ fill_ratio: 1.2 })), 120);
    assert.equal(binFillPercent(row({ fill_ratio: null })), null);
  });

  it('does NOT name the row/col labels — no cell painted either', () => {
    for (const field of REPORT_BIN_UTILIZATION_FIELD_CATALOG) {
      const paths = Object.values(field.paths ?? {});
      for (const unpainted of UNPAINTED_LOCATION_COLUMNS) {
        assert.ok(
          !paths.includes(unpainted),
          `${field.id} reads '${unpainted}', a column no cell paints`,
        );
      }
      assert.ok(
        !UNPAINTED_LOCATION_COLUMNS.some((c) => field.id.endsWith(`.${c}`)),
        `${field.id} names an unpainted location column`,
      );
    }
    for (const unpainted of UNPAINTED_LOCATION_COLUMNS) {
      assert.equal(
        resolveReportBinUtilizationSlotValue(row(), `report-bin-utilization.${unpainted}`),
        null,
      );
    }
  });

  it('product default parses, and the BIN handle is the identity', () => {
    const parsed = parseSlotLayout(
      REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT,
      REPORT_BIN_UTILIZATION_FIELD_CATALOG,
    );
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'report-bin-utilization.bin');
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      [
        'report-bin-utilization.in_bin',
        'report-bin-utilization.capacity',
        'report-bin-utilization.sku_count',
      ],
    );
    // Compound paints subtitles inside the item cell; this desk has none.
    assert.deepEqual(parsed.subtitleBindings, []);
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('stays inside the FOUR status slots the whole skeleton leaves', () => {
    assert.equal(STATUS_SLOT_BUDGET, 4);
    assert.ok(
      REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT.statusBindings.length <= STATUS_SLOT_BUDGET,
      'a fifth status binding fails parseTableDefinition at module load',
    );
  });

  it('leaves the chrome-painted facts UNBOUND but still bindable', () => {
    const bound = new Set([
      REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT.identityFieldId,
      ...REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = REPORT_BIN_UTILIZATION_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map(
      (f) => f.id,
    );
    // The title and the state pill paint these two — a bound track beside
    // each would print the same fact twice.
    assert.deepEqual(unbound, ['report-bin-utilization.room', 'report-bin-utilization.fill']);
    for (const id of unbound) {
      const field = REPORT_BIN_UTILIZATION_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('report-bin-utilization materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    // No geometry cut: COMPOUND_SKELETON_FILTER_DEBT is shrink-only, so a
    // mount may relabel chrome but never drop it.
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    assert.equal(
      REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS.filter((c) =>
        String(c.key).startsWith('subtitle:'),
      ).length,
      0,
    );
    assert.equal(
      REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:'))
        .length,
      REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT.statusBindings.length,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const col = (key: string) =>
      REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS.find((c) => c.key === key);
    assert.equal(col('item')?.label, 'Room');
    assert.equal(col('state')?.label, 'Fill');
    const identity = col('fulfillment');
    assert.equal(identity?.fieldId, 'report-bin-utilization.bin');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`slot-table-id-header-law.ts`). "Bin" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('types the state pill NUMERICALLY without binding a slot to it', () => {
    const state = REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS.find((c) => c.key === 'state');
    // The engine types its sort comparator from `slotDisplayType`, so 100 must
    // beat 88 rather than losing to it under text collation…
    assert.equal(state?.slotDisplayType, 'number');
    // …and it must carry no `fieldId`, or the engine would resolve a slot value
    // for a cell that paints `view.stateLabel`.
    assert.equal(state?.fieldId, undefined);
  });

  it('declares the factless `dates` chrome inert rather than cutting it', () => {
    const dates = REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS.find((c) => c.key === 'dates');
    assert.ok(dates, 'the Dates track must still MOUNT — the skeleton is never cut');
    // `gridLabel: ''` is the engine's own instruction for "print nothing here"
    // (`select` and `_fill` already use it) — not a label that slipped through.
    assert.equal(dates?.gridLabel, '');
    assert.equal(dates?.sortable, false);
    assert.equal(reportBinUtilizationSortFactFor({ key: 'dates', sortable: false }), null);
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = reportBinUtilizationCompoundColumnsFor({
      ...REPORT_BIN_UTILIZATION_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'report-bin-utilization.fill' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'report-bin-utilization.fill');
  });

  it('every painted DATA header sorts, except the declared factless chrome', () => {
    for (const col of REPORT_BIN_UTILIZATION_COMPOUND_COLUMNS) {
      if (isSlotTableChromeTrack(col.key)) {
        assert.equal(reportBinUtilizationSortFactFor(col), null, `${col.key} is chrome`);
        continue;
      }
      if ((FACTLESS_CHROME_KEYS as readonly string[]).includes(col.key)) {
        assert.equal(reportBinUtilizationSortFactFor(col), null, `${col.key} is factless`);
        continue;
      }
      assert.ok(
        reportBinUtilizationSortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(
      reportBinUtilizationSortFactFor({ key: 'fulfillment' }),
      'report-bin-utilization.bin',
    );
    assert.equal(reportBinUtilizationSortFactFor({ key: 'item' }), 'report-bin-utilization.room');
    assert.equal(reportBinUtilizationSortFactFor({ key: 'state' }), 'report-bin-utilization.fill');
  });
});

describe('report-bin-utilization resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of REPORT_BIN_UTILIZATION_FIELD_CATALOG) {
      assert.notEqual(
        resolveReportBinUtilizationSlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it('resolves the bin handle as barcode, falling back to the label', () => {
    assert.deepEqual(
      resolveReportBinUtilizationSlotValue(row(), 'report-bin-utilization.bin'),
      { kind: 'value', text: 'BIN-A123' },
    );
    assert.deepEqual(
      resolveReportBinUtilizationSlotValue(
        row({ barcode: null }),
        'report-bin-utilization.bin',
      ),
      { kind: 'value', text: 'A-12-3' },
    );
  });

  it('resolves counts as DIGITS so a number track sorts numerically', () => {
    assert.deepEqual(
      resolveReportBinUtilizationSlotValue(row(), 'report-bin-utilization.in_bin'),
      { kind: 'value', text: '35' },
    );
    assert.deepEqual(
      resolveReportBinUtilizationSlotValue(row(), 'report-bin-utilization.sku_count'),
      { kind: 'value', text: '6' },
    );
  });

  it('a bin with no declared capacity resolves to null text, never to 0', () => {
    assert.deepEqual(
      resolveReportBinUtilizationSlotValue(
        row({ capacity: null, fill_ratio: null }),
        'report-bin-utilization.capacity',
      ),
      { kind: 'value', text: null },
    );
    assert.deepEqual(
      resolveReportBinUtilizationSlotValue(
        row({ fill_ratio: null }),
        'report-bin-utilization.fill',
      ),
      { kind: 'value', text: null },
    );
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveReportBinUtilizationSlotValue(row(), 'orders.picked'), null);
  });
});

describe('report-bin-utilization row view', () => {
  it('paints the room as the title and the fill percentage as the pill', () => {
    const view = reportBinUtilizationCompoundView(row());
    assert.equal(view.id, '4821');
    assert.equal(view.title, 'Main floor');
    assert.equal(view.identityFace?.value, 'BIN-A123');
    assert.equal(view.stateLabel, '88%');
    assert.equal(view.stateTone, 'neutral');
    assert.equal(view.stateTip, '35 of 40');
    // No carrier, no marketplace, no money, no photo on a bin row.
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });

  it('says NOTHING on either Dates line — this report has no temporal fact', () => {
    const view = reportBinUtilizationCompoundView(row());
    assert.equal(view.orderedAt, null);
    assert.equal(view.delay, null);
  });

  it('never invents a room, and never claims a fill it cannot compute', () => {
    const view = reportBinUtilizationCompoundView(
      row({ room: null, capacity: null, fill_ratio: null }),
    );
    assert.equal(view.title, 'Bin #4821');
    assert.equal(view.stateLabel, 'Fill unknown');
    assert.equal(view.stateTip, '35 in bin · no capacity set');
  });
});
