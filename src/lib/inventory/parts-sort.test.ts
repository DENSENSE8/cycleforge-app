/**
 * Guards for the Parts auto-sort.
 *
 * The committed-status predicate must protect units that are promised to an
 * order or already shipped — auto-sort must never yank those into the parts
 * bin. Early-lifecycle units (RECEIVED/TESTED/STOCKED/etc.) are eligible.
 */

import '@/lib/assistant/test-db-url'; // MUST be first: sets DATABASE_URL before parts-sort loads the neon client
import { test } from 'node:test';
import { ok } from 'node:assert';
import { isCommittedForPartsSort } from './parts-sort';

test('committed/terminal statuses are protected from auto-sort', () => {
  for (const s of ['ALLOCATED', 'PICKED', 'PACKED', 'LABELED', 'STAGED', 'SHIPPED', 'SCRAPPED', 'RMA']) {
    ok(isCommittedForPartsSort(s), `${s} must block auto-sort`);
    ok(isCommittedForPartsSort(s.toLowerCase()), `${s} must block regardless of case`);
  }
});

test('early-lifecycle statuses are eligible for auto-sort', () => {
  for (const s of ['UNKNOWN', 'RECEIVED', 'IN_TEST', 'TESTED', 'GRADED', 'STOCKED', 'ON_HOLD', '', null]) {
    ok(!isCommittedForPartsSort(s), `${s} must NOT block auto-sort`);
  }
});
