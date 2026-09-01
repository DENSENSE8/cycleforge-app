/**
 * Daily catalog guards + resolver behaviour — wave 1.3's third family. The
 * shift checklist was "a checklist painted as a unique grid"; the guards here
 * pin that it is now an information table like every other, with a vocabulary
 * an organization binds.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMPOUND_COLUMN_KEYS } from '@/components/tables/compound/compound-columns';
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

  it('product default parses against the catalog — compound morph, NOTHING bound', () => {
    const parsed = parseSlotLayout(DAILY_PRODUCT_LAYOUT, DAILY_FIELD_CATALOG);
    assert.equal(parsed.morph, 'compound');
    assert.equal(parsed.identityFieldId, 'daily.item');
    assert.deepEqual(parsed.statusBindings, []);
    assert.deepEqual(parsed.subtitleBindings, []);
  });
});

describe('dailyCompoundColumnsFor — the compound materialization', () => {
  it('the product default IS the shared compound skeleton, in order', () => {
    assert.deepEqual(
      DAILY_COMPOUND_COLUMNS.map((c) => c.key),
      [...COMPOUND_COLUMN_KEYS],
    );
    assert.ok(DAILY_COMPOUND_COLUMNS.every((c) => c.fieldId === undefined));
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
  it('resolves each catalog field off the view-model row', () => {
    const r = row();
    assert.deepEqual(resolveDailySlotValue(r, 'daily.item'), { kind: 'value', text: '#4' });
    assert.deepEqual(resolveDailySlotValue(r, 'daily.team'), { kind: 'value', text: '3/5' });
    assert.equal(resolveDailySlotValue(r, 'daily.status')?.kind, 'value');
    assert.ok((resolveDailySlotValue(r, 'daily.marked') as { text: string | null }).text);
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
      (resolveDailySlotValue(open, 'daily.status') as { text: string }).text,
      (resolveDailySlotValue(row(), 'daily.status') as { text: string }).text,
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

  it('the product default resolves no slots at all', () => {
    assert.equal(dailySlotValuesFor(row(), DAILY_COMPOUND_COLUMNS), undefined);
  });
});
