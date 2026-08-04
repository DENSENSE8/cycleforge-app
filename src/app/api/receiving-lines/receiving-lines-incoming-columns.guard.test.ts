import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The Incoming receipt + removal columns must survive the whole wire.
 *
 * Same trap, same shape, as `receiving-lines-procedure-gates.guard.test.ts`:
 * `normalizeRow` is a strict ALLOWLIST with no passthrough, so a column the
 * builders SELECT but the normalizer does not name reaches the client as
 * `undefined` — and `undefined` is indistinguishable from "no mirror row" or
 * "not removed". Nothing throws; the chip just renders a dash forever.
 *
 * **This already happened to `zoho_status`.** It was SELECTed by the list
 * builder, declared on `ReceivingLineRow`, and read by `RecentActivityRailBase`
 * to badge a PO the vendor had already received — while the normalizer dropped
 * it, so that badge could never appear. Three layers agreed and the wire did
 * not. A sibling guard for the columns is the only thing that notices.
 *
 * These are a SEPARATE test file from the procedure gates on purpose: the gate
 * columns are SELECTed by all three builders, while these are view-scoped
 * (`incoming` / `scanned` / `activity` / `incoming_removed`), so the two sets
 * assert genuinely different things about the SELECT half.
 */

const ROOT = path.resolve(__dirname, '../../../..');
const ROUTE = path.join(ROOT, 'src/app/api/receiving-lines/route.ts');
const BUILD_SQL = path.join(ROOT, 'src/lib/receiving/lines/build-sql.ts');
const ROW_TYPE = path.join(ROOT, 'src/components/station/receiving-line-row.ts');

/**
 * Columns the list builder surfaces for the Incoming family. Every one of them
 * is read by a display SoT — the `zoho` chip face, the lane note, or the
 * removal-reason ladder — so a dropped one is a silently blank surface.
 */
const WIRE_COLUMNS = [
  'zoho_status',
  'zoho_status_synced_at',
  'removed_written_off',
  'removed_aged_out',
  'removed_at',
];

test('the list builder SELECTs every Incoming receipt + removal column', () => {
  const sql = readFileSync(BUILD_SQL, 'utf8');
  for (const col of WIRE_COLUMNS) {
    assert.ok(
      sql.includes(`AS ${col}`),
      `${col} is not SELECTed in build-sql.ts. Its display surface will render ` +
        'honest-absence forever, with no error anywhere.',
    );
  }
});

test('normalizeRow names every Incoming receipt + removal column', () => {
  const route = readFileSync(ROUTE, 'utf8');
  const start = route.indexOf('function normalizeRow');
  assert.ok(start > 0, 'normalizeRow not found — did the normalizer move?');
  const body = route.slice(start);

  for (const col of WIRE_COLUMNS) {
    assert.ok(
      new RegExp(`^\\s*${col}\\s*:`, 'm').test(body),
      `${col} is missing from normalizeRow's allowlist. The column is SELECTed ` +
        'but dropped before the response — exactly how zoho_status shipped ' +
        'unreachable while three other layers read it.',
    );
  }
});

test('ReceivingLineRow declares every column the wire carries', () => {
  // The third link: a field the response carries but the type does not declare
  // is a field no consumer can read without an `as` cast.
  const rowType = readFileSync(ROW_TYPE, 'utf8');
  for (const col of WIRE_COLUMNS) {
    assert.ok(
      new RegExp(`^\\s*${col}\\??\\s*:`, 'm').test(rowType),
      `${col} is missing from ReceivingLineRow.`,
    );
  }
});

test('the removal signals are surfaced as SIGNALS, never as a resolved reason', () => {
  // Precedence belongs to `resolveIncomingRemovalReason` — one ladder, shared by
  // the lane and the paste residual report. A `removed_reason` computed in SQL
  // would be a second ladder that drifts the first time the order changes.
  const sql = readFileSync(BUILD_SQL, 'utf8');
  assert.ok(
    !sql.includes('AS removed_reason'),
    'the reason must be resolved from signals on the row, not decided in SQL',
  );
});
