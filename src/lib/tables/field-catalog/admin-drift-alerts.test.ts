/**
 * Admin drift-alert catalog guards, materialization and adapter behaviour — the
 * family that replaced `_inventory-admin/TableSections.tsx`'s four hand-written
 * `AdminTableColumn` objects.
 *
 * Three assertions here are load-bearing beyond the usual shape checks:
 *
 * - the UNSELECTED-COLUMN NON-GOAL. `stock_alerts` carries `alert_type`,
 *   `resolved_at`, `threshold`, `bin_id` and `notified_at`; this desk's query
 *   pins the first two to constants and never selects the rest. A future agent
 *   reading "the table already has the data" will be tempted to bind it. The
 *   catalog must not name those columns until a cell paints them.
 * - the ZERO-BOUND-TRACK layout. All four facts ride the shared chrome, so the
 *   product default binds nothing — and every one of them still has to be
 *   bindable, or the Fields menu is a dead control on this desk.
 * - the CLOCK face. The retired cell printed `toLocaleString()`, so it carried
 *   the time of day; an alert feed rounded to the day has lost the fact two
 *   alerts in one run are a different story from two a day apart.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import { MAX_DEFAULT_VISIBLE_TRACKS } from '@/lib/tables/table-definition';
import {
  ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS,
  adminDriftAlertsCompoundColumnsFor,
  adminDriftAlertsSortFactFor,
} from '@/components/inventory/drift-grid/admin-drift-alerts-grid-layout';
import {
  adminDriftAlertsCompoundView,
  driftAlertClockFace,
} from '@/components/inventory/drift-grid/admin-drift-alerts-row-view';
import { toDriftAlertRow, type DriftAlertRow } from '@/lib/inventory/drift-rows';
import {
  ADMIN_DRIFT_ALERTS_FIELD_CATALOG,
  ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT,
} from './admin-drift-alerts';
import { resolveAdminDriftAlertsSlotValue } from './admin-drift-alerts-resolve';
import { parseSlotLayout } from '../slot-layout';

/** Columns `stock_alerts` HAS that this desk neither selects nor paints. */
const UNPAINTED_ALERT_COLUMNS = [
  'alert_type',
  'resolved_at',
  'threshold',
  'bin_id',
  'notified_at',
] as const;

function row(overrides: Partial<DriftAlertRow> = {}): DriftAlertRow {
  return {
    id: 4471,
    sku: 'DELL-7050-I5',
    qty_at_trigger: 12,
    triggered_at: '2026-09-11T18:42:07.000Z',
    notes: 'drift: warehouse stored=3 ledger=5 (Δ=-2) ; boxed stored=0 ledger=0 (Δ=0)',
    ...overrides,
  };
}

describe('admin-drift-alerts catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = ADMIN_DRIFT_ALERTS_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of ADMIN_DRIFT_ALERTS_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'admin-drift-alerts', `${field.id} is not a drift-alert fact`);
      assert.ok(field.id.startsWith('admin-drift-alerts.'), `${field.id} is not family-qualified`);
    }
  });

  it('names the FOUR facts the four retired cells painted, and no others', () => {
    assert.deepEqual(
      ADMIN_DRIFT_ALERTS_FIELD_CATALOG.map((f) => f.id),
      [
        'admin-drift-alerts.sku',
        'admin-drift-alerts.worst_delta',
        'admin-drift-alerts.triggered',
        'admin-drift-alerts.detail',
      ],
    );
  });

  it('does NOT name the columns this desk never selected', () => {
    for (const field of ADMIN_DRIFT_ALERTS_FIELD_CATALOG) {
      const paths = Object.values(field.paths ?? {});
      for (const unpainted of UNPAINTED_ALERT_COLUMNS) {
        assert.ok(
          !paths.includes(unpainted),
          `${field.id} reads '${unpainted}', a column no cell paints`,
        );
      }
      assert.ok(
        !UNPAINTED_ALERT_COLUMNS.some((c) => field.id.endsWith(`.${c}`)),
        `${field.id} names an unselected alert column`,
      );
    }
    // And the resolver has nothing to say about them either.
    for (const unpainted of UNPAINTED_ALERT_COLUMNS) {
      assert.equal(resolveAdminDriftAlertsSlotValue(row(), `admin-drift-alerts.${unpainted}`), null);
    }
    // The alert's own id is the row KEY and was painted by nothing.
    assert.equal(resolveAdminDriftAlertsSlotValue(row(), 'admin-drift-alerts.id'), null);
  });

  it('product default parses, binds NO track, and makes the SKU the identity', () => {
    const parsed = parseSlotLayout(
      ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT,
      ADMIN_DRIFT_ALERTS_FIELD_CATALOG,
    );
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'admin-drift-alerts.sku');
    // All four facts ride the shared chrome, so nothing is bound as a track —
    // a bound duplicate would print the same fact twice on one row.
    assert.deepEqual(parsed.statusBindings, []);
    assert.deepEqual(parsed.subtitleBindings, []);
    assert.equal(parsed.amountFieldId ?? null, null);
  });

  it('stays inside the FOUR-status-binding budget the whole skeleton leaves', () => {
    // select · fulfillment · thumb · item · dates · state · _fill, minus the
    // never-counted select gutter, is six of ten — so four status slots are
    // free and this desk must never bind more than that.
    const painted = ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS.filter((c) => c.key !== 'select');
    assert.ok(
      painted.length <= MAX_DEFAULT_VISIBLE_TRACKS,
      `${painted.length} default-visible tracks exceeds ${MAX_DEFAULT_VISIBLE_TRACKS}`,
    );
    const free = MAX_DEFAULT_VISIBLE_TRACKS - painted.length;
    assert.ok(
      ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT.statusBindings.length <= 4,
      'more than four status bindings cannot fit the dense ceiling',
    );
    assert.equal(free, 4);
  });

  it('leaves every chrome-painted fact UNBOUND but still bindable', () => {
    const bound = new Set([
      ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT.identityFieldId,
      ...ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = ADMIN_DRIFT_ALERTS_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map(
      (f) => f.id,
    );
    // Title, Dates chrome and state pill paint these three.
    assert.deepEqual(unbound, [
      'admin-drift-alerts.worst_delta',
      'admin-drift-alerts.triggered',
      'admin-drift-alerts.detail',
    ]);
    for (const id of unbound) {
      const field = ADMIN_DRIFT_ALERTS_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('admin-drift-alerts materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const chrome = ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS.map((c) => String(c.key)).filter(
      (k) => !k.startsWith('status:') && !k.startsWith('subtitle:'),
    );
    // No geometry cut: COMPOUND_SKELETON_FILTER_DEBT is shrink-only, so a
    // mount may relabel chrome but never drop it.
    assert.deepEqual(chrome, [...COMPOUND_COLUMN_KEYS]);
    assert.equal(
      ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('status:')).length,
      0,
    );
    assert.equal(
      ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS.filter((c) => String(c.key).startsWith('subtitle:'))
        .length,
      0,
    );
  });

  it('relabels the chrome it paints facts into', () => {
    const label = (key: string) =>
      ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS.find((c) => c.key === key)?.label;
    assert.equal(label('item'), 'Detail');
    assert.equal(label('dates'), 'Triggered');
    // The pill is the magnitude: the query pins `resolved_at IS NULL`, so a
    // lifecycle word would be the same constant on every row.
    assert.equal(label('state'), 'Worst |Δ|');
    const identity = ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.equal(identity?.fieldId, 'admin-drift-alerts.sku');
    // The identity header is the ENGINE's `Id` on every peer since 2026-09-15
    // (`slot-table-id-header-law.ts`). "SKU" is now the Fields-picker row
    // and the cell's hover word, not the column header.
    assert.equal(identity?.label, 'Id');
    assert.equal(identity?.type, 'id');
  });

  it('rebinds without changing track keys (keys are slot indices)', () => {
    const columns = adminDriftAlertsCompoundColumnsFor({
      ...ADMIN_DRIFT_ALERTS_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'admin-drift-alerts.worst_delta' }],
    });
    const slots = columns.filter((c) => String(c.key).startsWith('status:'));
    assert.deepEqual(
      slots.map((c) => c.key),
      ['status:1'],
    );
    assert.equal(slots[0]?.fieldId, 'admin-drift-alerts.worst_delta');
  });

  it('every painted DATA header sorts; chrome stays dead', () => {
    for (const col of ADMIN_DRIFT_ALERTS_COMPOUND_COLUMNS) {
      if (isSlotTableChromeTrack(col.key)) {
        assert.equal(adminDriftAlertsSortFactFor(col), null, `${col.key} is chrome`);
        continue;
      }
      assert.ok(
        adminDriftAlertsSortFactFor(col) !== null,
        `${col.key} is a painted data track with a dead header`,
      );
    }
    assert.equal(adminDriftAlertsSortFactFor({ key: 'fulfillment' }), 'admin-drift-alerts.sku');
    assert.equal(adminDriftAlertsSortFactFor({ key: 'item' }), 'admin-drift-alerts.detail');
    assert.equal(adminDriftAlertsSortFactFor({ key: 'dates' }), 'admin-drift-alerts.triggered');
    assert.equal(adminDriftAlertsSortFactFor({ key: 'state' }), 'admin-drift-alerts.worst_delta');
  });
});

describe('admin-drift-alerts resolver', () => {
  it('answers every catalog id off a realistic row', () => {
    for (const field of ADMIN_DRIFT_ALERTS_FIELD_CATALOG) {
      assert.notEqual(
        resolveAdminDriftAlertsSlotValue(row(), field.id),
        null,
        `${field.id} is in the catalog and the resolver cannot read it`,
      );
    }
  });

  it('resolves `triggered` to the absolute instant, not a face', () => {
    assert.deepEqual(resolveAdminDriftAlertsSlotValue(row(), 'admin-drift-alerts.triggered'), {
      kind: 'value',
      text: '2026-09-11T18:42:07.000Z',
    });
  });

  it('resolves the magnitude BARE so a number column sorts numerically', () => {
    assert.deepEqual(resolveAdminDriftAlertsSlotValue(row(), 'admin-drift-alerts.worst_delta'), {
      kind: 'value',
      text: '12',
    });
    // Zero is a fact, not an absence.
    assert.deepEqual(
      resolveAdminDriftAlertsSlotValue(row({ qty_at_trigger: 0 }), 'admin-drift-alerts.worst_delta'),
      { kind: 'value', text: '0' },
    );
    assert.deepEqual(
      resolveAdminDriftAlertsSlotValue(
        row({ qty_at_trigger: null }),
        'admin-drift-alerts.worst_delta',
      ),
      { kind: 'value', text: null },
    );
  });

  it('blank facts resolve to null text rather than an empty chip', () => {
    assert.deepEqual(resolveAdminDriftAlertsSlotValue(row({ notes: '  ' }), 'admin-drift-alerts.detail'), {
      kind: 'value',
      text: null,
    });
  });

  it('knows nothing about a field id from another family', () => {
    assert.equal(resolveAdminDriftAlertsSlotValue(row(), 'admin-sku-drift.sku'), null);
  });
});

describe('admin-drift-alerts row view', () => {
  it('paints the prose as the title, the SKU as the handle, the delta as the pill', () => {
    const view = adminDriftAlertsCompoundView(row());
    assert.equal(view.id, '4471');
    assert.equal(view.title, row().notes);
    assert.equal(view.identityFace?.value, 'DELL-7050-I5');
    assert.equal(view.stateLabel, 'Δ 12');
    assert.equal(view.stateTone, 'alert');
    // No carrier, no marketplace, no money, no photo on a stock alert.
    assert.equal(view.tracking, null);
    assert.equal(view.platformValue, null);
    assert.equal(view.amount, null);
    assert.equal(view.thumbUrl, null);
  });

  it('keeps the time of day the retired timestamp cell printed', () => {
    const view = adminDriftAlertsCompoundView(row());
    const clock = driftAlertClockFace(row().triggered_at);
    assert.ok(clock && /\d{1,2}:\d{2}\s?[AP]M$/i.test(clock), `clock face lost its time: ${clock}`);
    // Both DATES lines are used: the civil day on the Hash line, the clock on
    // the Calendar line. Never the day alone with the time hidden in a tip.
    assert.equal(view.delay?.faceLabel, clock);
    assert.equal(view.delay?.overdue, false);
    assert.ok(view.orderedAt?.label && !view.orderedAt.label.includes(':'));
    assert.equal(view.orderedAt?.dateKey?.length, 10);
    assert.equal(view.startedHover, `${view.orderedAt?.label} · ${clock}`);
  });

  it('never invents a title or a magnitude for a malformed row', () => {
    const view = adminDriftAlertsCompoundView(
      row({ notes: null, qty_at_trigger: null, triggered_at: '' }),
    );
    assert.equal(view.title, 'Drift alert #4471');
    assert.equal(view.stateLabel, 'Δ unknown');
    assert.equal(view.stateTone, 'neutral');
    assert.equal(view.orderedAt, null);
    assert.equal(view.delay, null);
  });
});

describe('admin-drift-alerts wire row', () => {
  it('ISO-normalizes the trigger stamp so the resolver reads one instant', () => {
    const wire = toDriftAlertRow({
      id: 9,
      sku: 'HP-800-G5',
      qty_at_trigger: 3,
      triggered_at: new Date('2026-09-11T18:42:07.000Z'),
      notes: null,
    });
    assert.equal(wire.triggered_at, '2026-09-11T18:42:07.000Z');
    assert.equal(wire.notes, null);
  });
});
