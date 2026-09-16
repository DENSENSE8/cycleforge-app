/**
 * Daily catalog guards + resolver behaviour — wave 1.3's third family. The
 * shift checklist was "a checklist painted as a unique grid"; the guards here
 * pin that it is now an information table like every other, with a vocabulary
 * an organization binds.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS, COMPOUND_TRACKS } from '@/components/tables/compound/compound-columns';
import type { DailyTaskRow } from '@/features/home/grid/daily-task-row';
import {
  DAILY_COMPOUND_COLUMNS,
  dailyCompoundColumnsFor,
} from '@/lib/daily-checks/daily-grid-layout';
import { DAILY_FIELD_CATALOG, DAILY_PRODUCT_LAYOUT } from './daily';
import { dailySlotValuesFor, resolveDailySlotValue } from './daily-resolve';
import { parseSlotLayout } from '../slot-layout';

function row(overrides: Partial<DailyTaskRow> = {}): DailyTaskRow {
  return {
    id: 4,
    title: 'Sweep the pack bench',
    sortOrder: 1,
    kind: 'recurring',
    assignedStaffId: null,
    assignedStaffName: null,
    done: true,
    teamDone: 3,
    teamTotal: 5,
    markedAt: '2026-08-31T14:02:00.000Z',
    ...overrides,
  };
}

describe('daily catalog', () => {
  it('has unique ids, all daily-family, each bindable somewhere', () => {
    const ids = DAILY_FIELD_CATALOG.map((f) => f.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const field of DAILY_FIELD_CATALOG) {
      assert.equal(field.family, 'daily', field.id);
      assert.ok(field.slotKinds.length > 0, `${field.id} is unbindable`);
      assert.ok(field.id.startsWith('daily.'), `${field.id} is not family-qualified`);
    }
  });

  it('product default parses against the catalog — compound morph, Owner bound', () => {
    const parsed = parseSlotLayout(DAILY_PRODUCT_LAYOUT, DAILY_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'daily.item');
    // Owner is the ONE product binding: an owned one-off paints its avatar on
    // the desk by default (kiosk-devices' enrolled_by precedent). Kind stays
    // unbound — its word rides the note line.
    assert.deepEqual(parsed.statusBindings, [{ fieldId: 'daily.owner' }]);
    assert.deepEqual(parsed.subtitleBindings, []);
  });
});

describe('dailyCompoundColumnsFor — the compound materialization', () => {
  it('the product default is the shared skeleton plus the bound owner track', () => {
    // Slot tracks materialize AFTER `state` (the status anchor), so the
    // expected order is the base skeleton with `status:1` spliced there.
    const stateIdx = COMPOUND_COLUMN_KEYS.indexOf('state');
    assert.ok(stateIdx >= 0);
    const expected = [
      ...COMPOUND_COLUMN_KEYS.slice(0, stateIdx + 1),
      'status:1' as const,
      ...COMPOUND_COLUMN_KEYS.slice(stateIdx + 1),
    ];
    assert.deepEqual(
      DAILY_COMPOUND_COLUMNS.map((c) => c.key),
      expected,
    );
    // Every base track stays the SHARED object; only the slot track is new.
    const owner = DAILY_COMPOUND_COLUMNS.find((c) => c.fieldId === 'daily.owner');
    assert.ok(owner);
    assert.equal(owner.slotDisplayType, 'person');
  });

  it('binding Team opens the track the retired flat model spent a column on', () => {
    const columns = dailyCompoundColumnsFor({
      ...DAILY_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'daily.team' }],
    });
    const track = columns.find((c) => c.fieldId === 'daily.team');
    assert.ok(track);
    assert.equal(track.key, 'status:1');
    // Magnitude geometry — end-aligned, like the flat `team` track was.
    assert.equal(track.slotDisplayType, 'number');
  });
});

describe('resolveDailySlotValue', () => {
  /** Narrowed read of a resolved value's text — no inline shape casts. */
  function valueText(v: ReturnType<typeof resolveDailySlotValue>): string | null {
    return v && v.kind === 'value' ? v.text : null;
  }

  it('resolves each catalog field off the view-model row', () => {
    const r = row();
    assert.deepEqual(resolveDailySlotValue(r, 'daily.item'), { kind: 'value', text: '#4' });
    assert.deepEqual(resolveDailySlotValue(r, 'daily.team'), { kind: 'value', text: '3/5' });
    assert.equal(resolveDailySlotValue(r, 'daily.status')?.kind, 'value');
    assert.ok(valueText(resolveDailySlotValue(r, 'daily.marked')));
  });

  it('kind resolves the exception word only — recurring says nothing', () => {
    assert.deepEqual(resolveDailySlotValue(row({ kind: 'once' }), 'daily.kind'), {
      kind: 'value',
      text: 'Once',
    });
    assert.deepEqual(resolveDailySlotValue(row(), 'daily.kind'), { kind: 'value', text: null });
  });

  it('owner resolves the person face, and the absence honestly', () => {
    assert.deepEqual(
      resolveDailySlotValue(row({ assignedStaffId: 17, assignedStaffName: 'Dana' }), 'daily.owner'),
      { kind: 'person', staffId: 17, name: 'Dana' },
    );
    assert.deepEqual(resolveDailySlotValue(row(), 'daily.owner'), {
      kind: 'person',
      staffId: null,
      name: null,
    });
  });

  it('an empty roster has no denominator — null, never 0/0', () => {
    assert.deepEqual(resolveDailySlotValue(row({ teamDone: 0, teamTotal: 0 }), 'daily.team'), {
      kind: 'value',
      text: null,
    });
  });

  it('an unchecked row reports Open and no stamp', () => {
    const open = row({ done: false, markedAt: null });
    assert.deepEqual(resolveDailySlotValue(open, 'daily.marked'), { kind: 'value', text: null });
    assert.notEqual(
      valueText(resolveDailySlotValue(open, 'daily.status')),
      valueText(resolveDailySlotValue(row(), 'daily.status')),
    );
  });

  it('unknown field id resolves null, never throws', () => {
    assert.equal(resolveDailySlotValue(row(), 'daily.ghost'), null);
  });
});

describe('dailySlotValuesFor', () => {
  it('keys resolved values by TRACK key', () => {
    const columns = dailyCompoundColumnsFor({
      ...DAILY_PRODUCT_LAYOUT,
      statusBindings: [{ fieldId: 'daily.team' }],
    });
    assert.deepEqual(dailySlotValuesFor(row(), columns), {
      'status:1': { kind: 'value', text: '3/5' },
    });
  });

  it('the product default resolves only the owner track — a dash on unowned rows', () => {
    assert.deepEqual(dailySlotValuesFor(row(), DAILY_COMPOUND_COLUMNS), {
      'status:1': { kind: 'person', staffId: null, name: null },
    });
    assert.deepEqual(
      dailySlotValuesFor(row({ assignedStaffId: 17, assignedStaffName: 'Dana' }), DAILY_COMPOUND_COLUMNS),
      { 'status:1': { kind: 'person', staffId: 17, name: 'Dana' } },
    );
  });
});

describe('daily identity track vocabulary', () => {
  it('reads Id — the portable word for the identity handle', () => {
    const track = DAILY_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment');
    assert.ok(track, 'daily mounts the shared identity track');
    assert.equal(track.gridLabel, 'Id');
  });

  it('takes that word from the SHARED skeleton — never a family-local copy', () => {
    // The same-OBJECT law lives in compound-row-model.test.ts; this pins the
    // reason a family must not fork the array to rename a header.
    const shared = COMPOUND_TRACKS.find((c) => c.key === 'fulfillment');
    assert.equal(shared?.gridLabel, 'Id');
    assert.equal(
      DAILY_COMPOUND_COLUMNS.find((c) => c.key === 'fulfillment'),
      shared,
    );
  });
});
