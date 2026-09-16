/**
 * DB-free unit tests for the Tier-A visible-serial hydrator's pure helpers
 * (docs/todo/receiving-serial-immediate-display-plan.md).
 *
 * Run: npx tsx --test src/components/sidebar/receiving/useHydrateVisibleSerials.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rowsNeedingSerials, patchRowsWithSerials, seedOrPatchSiblingsSerials } from './useHydrateVisibleSerials';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { QueryClient } from '@tanstack/react-query';
import {
  receivingSiblingsQueryKey,
  receivingSiblingsSerialsQueryKey,
} from '@/lib/queries/receiving-queries';

function row(partial: Partial<ReceivingLineRow>): ReceivingLineRow {
  return { id: 1, receiving_id: 100, ...partial } as ReceivingLineRow;
}

test('rowsNeedingSerials: only real lines with a carton and no serials yet', () => {
  const rows = [
    row({ id: 1, receiving_id: 100 }),                       // needs (serials undefined)
    row({ id: 2, receiving_id: 100, serials: [] }),          // has serials ([]) — skip
    row({ id: 3, receiving_id: 100, serials: [{ id: 9, serial_number: 'X' }] }), // has — skip
    row({ id: -5, receiving_id: 100 }),                      // synthetic placeholder — skip
    row({ id: 4, receiving_id: null }),                      // no carton — skip
  ];
  const needy = rowsNeedingSerials(rows);
  assert.deepEqual(needy.map((r) => r.id), [1]);
});

test('rowsNeedingSerials: undefined rows → empty', () => {
  assert.deepEqual(rowsNeedingSerials(undefined), []);
});

test('patchRowsWithSerials: fills serials for matching rows, leaves others', () => {
  const rows = [row({ id: 1 }), row({ id: 2 })];
  const { next, changed } = patchRowsWithSerials(rows, {
    '1': [{ id: 11, serial_number: 'SN-11', condition_grade: 'USED_A' }],
  });
  assert.equal(changed, true);
  assert.deepEqual(next[0].serials, [{ id: 11, serial_number: 'SN-11', condition_grade: 'USED_A' }]);
  assert.equal(next[1].serials, undefined);
});

test('patchRowsWithSerials: never overwrites a row that already has serials', () => {
  const rows = [row({ id: 1, serials: [{ id: 7, serial_number: 'KEEP' }] })];
  const { next, changed } = patchRowsWithSerials(rows, {
    '1': [{ id: 99, serial_number: 'INCOMING' }],
  });
  assert.equal(changed, false);
  assert.deepEqual(next[0].serials, [{ id: 7, serial_number: 'KEEP' }]);
});

test('patchRowsWithSerials: skips a row with an in-flight optimistic serial', () => {
  const rows = [
    // serials present but null-guard is on `serials != null`; an optimistic-adding
    // row already has serials so it is skipped by the has-serials guard AND the
    // in-flight guard — the scan path owns it.
    row({ id: 1, serials: [{ id: -3, serial_number: 'PENDING', _optimistic: 'adding' } as never] }),
  ];
  const { next, changed } = patchRowsWithSerials(rows, {
    '1': [{ id: 5, serial_number: 'SERVER' }],
  });
  assert.equal(changed, false);
  assert.equal((next[0].serials as Array<{ serial_number: string }>)[0].serial_number, 'PENDING');
});

test('patchRowsWithSerials: no matching lines → unchanged', () => {
  const rows = [row({ id: 1 })];
  const { next, changed } = patchRowsWithSerials(rows, { '999': [{ id: 1, serial_number: 'X' }] });
  assert.equal(changed, false);
  assert.equal(next[0].serials, undefined);
});

test('seedOrPatchSiblingsSerials: seeds empty siblings + serials caches from feed row', () => {
  const qc = new QueryClient();
  const feed = [row({ id: 8696, receiving_id: 14222, item_name: null, sku: null })];
  seedOrPatchSiblingsSerials(qc, 14222, feed, {
    '8696': [{ id: 11, serial_number: 'SN-11' }],
  });
  const siblings = qc.getQueryData<{ receiving_lines: ReceivingLineRow[] }>(
    receivingSiblingsQueryKey(14222),
  );
  const serials = qc.getQueryData<{ receiving_lines: ReceivingLineRow[] }>(
    receivingSiblingsSerialsQueryKey(14222),
  );
  assert.equal(siblings?.receiving_lines.length, 1);
  assert.deepEqual(siblings?.receiving_lines[0].serials, [{ id: 11, serial_number: 'SN-11' }]);
  assert.equal(serials?.receiving_lines.length, 1);
  assert.deepEqual(serials?.receiving_lines[0].serials, [{ id: 11, serial_number: 'SN-11' }]);
});
