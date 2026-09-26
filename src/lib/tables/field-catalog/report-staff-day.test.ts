/**
 * Staff-day catalog guards, materialization, resolver and adapter — the family
 * behind `/reports?tab=staff`.
 *
 * Load-bearing beyond shape checks:
 *
 * - the UNCHECKED ROW. `checked_at` is null on a task the staffer never
 *   ticked, and that is the row the table exists to surface. The fact must
 *   resolve to blank (engine blank rule sinks it) while the pill keeps the
 *   WORD — a blank pill would read as a rendering bug, a fake date would sort.
 * - the CHRONOLOGICAL STATE SORT. The state header compares through
 *   `slotDisplayType: 'date'`, so `Checked` rows order by WHEN, not lexically.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSlotTableChromeTrack } from '@/lib/tables/slot-table-header-sort';
import {
  REPORT_STAFF_DAY_COMPOUND_COLUMNS,
  reportStaffDaySortFactFor,
  reportStaffDayCompoundColumnsFor,
} from '@/components/reports/report-staff-day-grid/report-staff-day-grid-layout';
import { reportStaffDayCompoundView } from '@/components/reports/report-staff-day-grid/report-staff-day-row-view';
import type { StaffDayReportRow } from '@/lib/reports/staff-day-rows';
import {
  REPORT_STAFF_DAY_FIELD_CATALOG,
  REPORT_STAFF_DAY_PRODUCT_LAYOUT,
} from './report-staff-day';
import { resolveReportStaffDaySlotValue } from './report-staff-day-resolve';
import { parseSlotLayout } from '../slot-layout';
import { MAX_DEFAULT_VISIBLE_TRACKS } from '../table-definition';

/** The skeleton's six non-gutter chrome tracks leave this many status slots. */
const STATUS_SLOT_BUDGET = MAX_DEFAULT_VISIBLE_TRACKS - 6;

function row(overrides: Partial<StaffDayReportRow> = {}): StaffDayReportRow {
  return {
    order: 0,
    staffId: 1,
    staffName: 'Ana',
    itemId: 7,
    title: 'Front door locked',
    kind: 'recurring',
    ticketId: null,
    checkedAt: '2026-09-15T23:14:00.000Z',
    ...overrides,
  };
}

describe('report-staff-day catalog', () => {
  it('has unique ids, and every field is family-qualified and bindable', () => {
    const ids = REPORT_STAFF_DAY_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of REPORT_STAFF_DAY_FIELD_CATALOG) {
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.equal(field.family, 'report-staff-day', `${field.id} is not a staff-day fact`);
      assert.ok(field.id.startsWith('report-staff-day.'), `${field.id} is not qualified`);
    }
  });

  it('product default parses with machine identity and staff attribution', () => {
    const parsed = parseSlotLayout(REPORT_STAFF_DAY_PRODUCT_LAYOUT, REPORT_STAFF_DAY_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'report-staff-day.ticket');
    assert.deepEqual(
      parsed.statusBindings.map((b) => b.fieldId),
      ['report-staff-day.staff', 'report-staff-day.kind'],
    );
    assert.deepEqual(parsed.subtitleBindings, []);
    assert.equal(parsed.amountFieldId ?? null, null, 'no money on a checklist');
  });

  it('stays inside the FOUR status slots the whole skeleton leaves', () => {
    assert.equal(STATUS_SLOT_BUDGET, 4);
    assert.ok(
      REPORT_STAFF_DAY_PRODUCT_LAYOUT.statusBindings.length <= STATUS_SLOT_BUDGET,
      'a fifth status binding fails parseTableDefinition at module load',
    );
  });

  it('leaves the chrome-painted facts UNBOUND but still bindable', () => {
    const bound = new Set([
      REPORT_STAFF_DAY_PRODUCT_LAYOUT.identityFieldId,
      ...REPORT_STAFF_DAY_PRODUCT_LAYOUT.statusBindings.map((b) => b.fieldId),
      ...REPORT_STAFF_DAY_PRODUCT_LAYOUT.subtitleBindings.map((b) => b.fieldId),
    ]);
    const unbound = REPORT_STAFF_DAY_FIELD_CATALOG.filter((f) => !bound.has(f.id)).map(
      (f) => f.id,
    );
    // Title, state pill and Dates chrome paint these; order rides sort only.
    assert.deepEqual(unbound, [
      'report-staff-day.task',
      'report-staff-day.checked_at',
      'report-staff-day.order',
    ]);
    for (const id of unbound) {
      const field = REPORT_STAFF_DAY_FIELD_CATALOG.find((f) => f.id === id);
      assert.ok(field?.slotKinds.includes('status'), `${id} cannot be opted into a track`);
    }
  });
});

describe('report-staff-day materialization', () => {
  it('mounts the SHARED compound skeleton WHOLE, in its order', () => {
    const keys = REPORT_STAFF_DAY_COMPOUND_COLUMNS.map((c) => c.key);
    // Chrome prefix in the skeleton's order, then this family's TWO status
    // slots (cadence, ticket), then the fill gutter.
    assert.deepEqual(
      keys.slice(0, 6),
      ['select', 'fulfillment', 'thumb', 'item', 'dates', 'state'],
      'the skeleton is whole — no geometry fork',
    );
    assert.deepEqual(keys.slice(6), ['status:1', 'status:2', '_fill']);
    for (const col of REPORT_STAFF_DAY_COMPOUND_COLUMNS) {
      if (!isSlotTableChromeTrack(col.key)) continue;
      if (col.key === 'select' || col.key === '_fill') continue;
      assert.ok(col.label, `chrome track ${col.key} has no header`);
    }
  });

  it('headers name the staff-day vocabulary, not the Orders defaults', () => {
    const header = (key: string) =>
      REPORT_STAFF_DAY_COMPOUND_COLUMNS.find((c) => c.key === key)?.label;
    // The identity header is the ENGINE's `Id` on every peer since
    // 2026-09-15 (`slot-table-family.ts`); this desk used to print
    // "Staff", which is now the Fields-picker word and the cell's hover word.
    assert.equal(header('fulfillment'), 'Id');
    assert.equal(header('item'), 'Task');
    assert.equal(header('dates'), 'Checked at');
    assert.equal(header('state'), 'Checked');
  });

  it('the state header sorts chronologically — date, not the pill’s word', () => {
    const state = REPORT_STAFF_DAY_COMPOUND_COLUMNS.find((c) => c.key === 'state');
    assert.equal(state?.slotDisplayType, 'date');
    assert.equal(reportStaffDaySortFactFor({ key: 'state', sortable: true }), 'report-staff-day.checked_at');
  });

  it('materializes any PARSED layout, not just the product default', () => {
    const parsed = parseSlotLayout(REPORT_STAFF_DAY_PRODUCT_LAYOUT, REPORT_STAFF_DAY_FIELD_CATALOG);
    const remount = reportStaffDayCompoundColumnsFor(parsed);
    assert.deepEqual(
      remount.map((c) => c.key),
      REPORT_STAFF_DAY_COMPOUND_COLUMNS.map((c) => c.key),
    );
  });
});

describe('report-staff-day resolver', () => {
  it('resolves the instant verbatim — the engine owns the face', () => {
    const iso = '2026-09-15T23:14:00.000Z';
    assert.deepEqual(resolveReportStaffDaySlotValue(row({ checkedAt: iso }), 'report-staff-day.checked_at'), {
      kind: 'value',
      text: iso,
    });
  });

  it('resolves an unchecked task to BLANK, never a placeholder', () => {
    assert.deepEqual(resolveReportStaffDaySlotValue(row({ checkedAt: null }), 'report-staff-day.checked_at'), {
      kind: 'value',
      text: null,
    });
  });

  it('cadence resolves to the operator’s words, so search matches a lead’s typing', () => {
    assert.equal(
      resolveReportStaffDaySlotValue(row({ kind: 'once' }), 'report-staff-day.kind')?.text,
      'Just today',
    );
    assert.equal(
      resolveReportStaffDaySlotValue(row({ kind: 'recurring' }), 'report-staff-day.kind')?.text,
      'Every day',
    );
  });

  it('an absent ticket resolves blank, a present one to its digits', () => {
    assert.equal(
      resolveReportStaffDaySlotValue(row(), 'report-staff-day.ticket')?.text,
      null,
    );
    assert.equal(
      resolveReportStaffDaySlotValue(row({ ticketId: 48120 }), 'report-staff-day.ticket')?.text,
      '48120',
    );
  });
});

describe('report-staff-day row view', () => {
  it('a checked task reads Checked, done tone, clock-time date', () => {
    const view = reportStaffDayCompoundView(row());
    assert.equal(view.stateLabel, 'Checked');
    assert.equal(view.stateTone, 'done');
    assert.ok(view.orderedAt?.label, 'the Dates line carries the time');
    assert.equal(view.title, 'Front door locked');
  });

  it('an unchecked task keeps its row and says so in words', () => {
    const view = reportStaffDayCompoundView(row({ checkedAt: null }));
    assert.equal(view.stateLabel, 'Not checked');
    assert.equal(view.stateTone, 'neutral', 'an open task is not an ALERT');
    assert.equal(view.orderedAt, null, 'no fake date on a task never ticked');
  });

  it('row ids are stable per staffer × task', () => {
    assert.equal(reportStaffDayCompoundView(row()).id, '1-7');
    assert.notEqual(reportStaffDayCompoundView(row({ staffId: 2 })).id, '1-7');
  });
});
