/**
 * Daily's find/refine contract.
 * The regression this exists for (operator 2026-09-14): "when I check off
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DailyCheckItem } from '@/lib/daily-checks/types';
import { filterDailyCheckItems, parseDailyStatusFilter } from './daily-check-filter';

const ITEMS: DailyCheckItem[] = [
  { id: 1, title: 'Front door locked', sortOrder: 0 },
  { id: 2, title: 'Scan guns charged', sortOrder: 1 },
];
const DONE = new Set([1]);
const ids = (items: readonly DailyCheckItem[]) => items.map((i) => i.id);

describe('daily status filter', () => {
  it('the absent param is the WHOLE list — a ticked row keeps its seat', () => {
    const status = parseDailyStatusFilter(null);
    assert.equal(status, 'all');
    assert.deepEqual(ids(filterDailyCheckItems(ITEMS, DONE, '', status)), [1, 2]);
  });

  it('Open is an explicit refinement that hides what is done', () => {
    assert.deepEqual(ids(filterDailyCheckItems(ITEMS, DONE, '', 'open')), [2]);
  });

  it('Completed shows only the checked half', () => {
    assert.deepEqual(ids(filterDailyCheckItems(ITEMS, DONE, '', 'done')), [1]);
  });

  it('search narrows within the active status, case-insensitively', () => {
    assert.deepEqual(ids(filterDailyCheckItems(ITEMS, DONE, 'GUNS', 'all')), [2]);
    // A checked row still matches its own text under the default list.
    assert.deepEqual(ids(filterDailyCheckItems(ITEMS, DONE, 'door', 'all')), [1]);
    assert.deepEqual(ids(filterDailyCheckItems(ITEMS, DONE, 'door', 'open')), []);
  });

  it('an unparseable filter token is the whole list, not an empty table', () => {
    assert.equal(parseDailyStatusFilter('bogus'), 'all');
  });
});
