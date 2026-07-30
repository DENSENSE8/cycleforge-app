/**
 * Cross-artifact guard for the receiving-exception vocabulary
 * (Phase 2 of docs/todo/ebay-delivered-not-unboxed-PLAN.md).
 *
 * The hazard this exists for: `seedOrgCatalog` derives `reason_codes.sort_order`
 * from ARRAY POSITION in `RECEIVING_EXCEPTION_CODES` (10, 20, 30 …), while the
 * seed migrations HARDCODE the numbers that walk produced at the time they were
 * written. Splicing a new code into an earlier sub-vocabulary renumbers every code
 * after it, so a newly-seeded org and a pre-existing org disagree about
 * `sort_order` — a silent, data-only desync no type checker can see.
 *
 * These tests read the migrations and assert they still agree with the registry.
 *
 * Run: `npx tsx --test src/lib/receiving/exception-codes.test.ts`
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LOSS_EXCEPTION_CODES,
  PHOTO_POLICY_OVERRIDE_CODES,
  RECEIVING_EXCEPTION_CODES,
  RECEIVING_EXCEPTION_META,
  isLossExceptionCode,
  isReceivingExceptionCode,
} from './exception-codes';

/** Every migration that seeds flow_context='receiving_exception' rows. */
const SEED_MIGRATIONS = [
  '2026-06-28d_reason_codes_receiving_exception_seed.sql',
  '2026-07-29b_reason_codes_photo_policy_override_seed.sql',
  '2026-07-29i_reason_codes_loss_seed.sql',
];

/** `('CODE', 'Label', 120)` tuples out of a VALUES block. */
const TUPLE_RE = /\('([A-Z_]+)',\s*'([^']*)',\s*(\d+)\)/g;

function parseSeed(file: string): Array<{ code: string; label: string; sort: number }> {
  const sql = readFileSync(join(process.cwd(), 'src/lib/migrations', file), 'utf8');
  return [...sql.matchAll(TUPLE_RE)].map((m) => ({
    code: m[1],
    label: m[2],
    sort: Number(m[3]),
  }));
}

/** The sort_order `seedOrgCatalog` will assign to `code` for a NEW org. */
function walkSortOrder(code: string): number {
  return (RECEIVING_EXCEPTION_CODES.indexOf(code as never) + 1) * 10;
}

test('every seeded sort_order matches the array walk seedOrgCatalog performs', () => {
  for (const file of SEED_MIGRATIONS) {
    const tuples = parseSeed(file);
    assert.ok(tuples.length > 0, `${file}: parsed no (code, label, sort_order) tuples`);
    for (const { code, sort } of tuples) {
      assert.ok(
        isReceivingExceptionCode(code),
        `${file}: seeds '${code}', which is not in RECEIVING_EXCEPTION_CODES`,
      );
      assert.equal(
        sort,
        walkSortOrder(code),
        `${file}: '${code}' is hardcoded at sort_order ${sort} but array position yields ` +
          `${walkSortOrder(code)} — a new code was spliced into an earlier sub-vocabulary. ` +
          `Append at the END of RECEIVING_EXCEPTION_CODES instead.`,
      );
    }
  }
});

test('every registry code has a backfill seed for pre-existing orgs', () => {
  const seeded = new Set(SEED_MIGRATIONS.flatMap((f) => parseSeed(f).map((t) => t.code)));
  const missing = RECEIVING_EXCEPTION_CODES.filter((c) => !seeded.has(c));
  assert.deepEqual(
    missing,
    [],
    `these codes exist in the registry (so NEW orgs get them from seedOrgCatalog) but no ` +
      `migration backfills them, so orgs that already exist never will: ${missing.join(', ')}`,
  );
});

test('seeded labels match RECEIVING_EXCEPTION_META', () => {
  for (const file of SEED_MIGRATIONS) {
    for (const { code, label } of parseSeed(file)) {
      if (!isReceivingExceptionCode(code)) continue;
      assert.equal(label, RECEIVING_EXCEPTION_META[code].label, `${file}: '${code}' label drift`);
    }
  }
});

test('loss codes are appended LAST, after the photo overrides', () => {
  const tail = RECEIVING_EXCEPTION_CODES.slice(-LOSS_EXCEPTION_CODES.length);
  assert.deepEqual([...tail], [...LOSS_EXCEPTION_CODES]);
});

test('photo overrides still occupy 80–110 (the 2026-07-29b hardcoded range)', () => {
  assert.deepEqual(
    PHOTO_POLICY_OVERRIDE_CODES.map(walkSortOrder),
    [80, 90, 100, 110],
  );
});

test('loss codes occupy 120–150 (the 2026-07-29i hardcoded range)', () => {
  assert.deepEqual(LOSS_EXCEPTION_CODES.map(walkSortOrder), [120, 130, 140, 150]);
});

test('every code has meta, and meta has no orphans', () => {
  for (const code of RECEIVING_EXCEPTION_CODES) {
    assert.ok(RECEIVING_EXCEPTION_META[code], `no meta for ${code}`);
    assert.ok(RECEIVING_EXCEPTION_META[code].label.length > 0, `empty label for ${code}`);
  }
  assert.deepEqual(
    Object.keys(RECEIVING_EXCEPTION_META).sort(),
    [...RECEIVING_EXCEPTION_CODES].sort(),
  );
});

test('the loss guard is narrow — an OS&D code cannot write a carton off', () => {
  assert.ok(isLossExceptionCode('STOLEN'));
  assert.ok(isLossExceptionCode('LOST_IN_TRANSIT'));
  // The whole point of the narrow slice: these are valid exception codes but must
  // NOT be accepted as a write-off reason.
  assert.ok(!isLossExceptionCode('SHORT'));
  assert.ok(!isLossExceptionCode('NO_PO'));
  assert.ok(!isLossExceptionCode('PHOTO_WAIVED_DEFERRED'));
  assert.ok(!isLossExceptionCode(null));
  assert.ok(!isLossExceptionCode('lost_in_transit')); // case-sensitive
});
