/** DB-free unit tests for the bulk tote mint (POST /api/handling-units/bulk): */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandlingUnitsBulk, type HandlingUnitRow } from './handling-unit-queries';
import { HandlingUnitBulkCreateBody } from '@/lib/schemas/handling-unit';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;

interface Recorded {
  sql: string;
  params: unknown[];
}

/** A Queryable that records every statement and replays canned rows. */
function fakeExecutor(rowsFor: (sql: string, params: unknown[]) => HandlingUnitRow[]) {
  const calls: Recorded[] = [];
  return {
    calls,
    query: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      const rows = rowsFor(sql, params) as unknown as T[];
      return { rows, rowCount: rows.length };
    },
  };
}

function row(id: number): HandlingUnitRow {
  return {
    id,
    code: `H-${id}`,
    status: 'OPEN',
    location_id: null,
    created_by: null,
    created_at: '2026-09-15T00:00:00Z',
    closed_at: null,
    notes: null,
  };
}

// ─── Schema contract ────────────────────────────────────────────────────────

test('HandlingUnitBulkCreateBody accepts the 1..200 count band', () => {
  assert.equal(HandlingUnitBulkCreateBody.safeParse({ count: 1 }).success, true);
  assert.equal(HandlingUnitBulkCreateBody.safeParse({ count: 200 }).success, true);
  const withOpts = HandlingUnitBulkCreateBody.safeParse({
    count: 40,
    locationId: 7,
    notes: 'bench 3',
    idempotencyKey: 'mint-abc',
  });
  assert.equal(withOpts.success, true);
  assert.equal(withOpts.success && withOpts.data.count, 40);
});

test('HandlingUnitBulkCreateBody rejects a count outside 1..200 or non-integer', () => {
  assert.equal(HandlingUnitBulkCreateBody.safeParse({ count: 0 }).success, false);
  assert.equal(HandlingUnitBulkCreateBody.safeParse({ count: 201 }).success, false);
  assert.equal(HandlingUnitBulkCreateBody.safeParse({ count: 2.5 }).success, false);
  assert.equal(HandlingUnitBulkCreateBody.safeParse({ count: -1 }).success, false);
  assert.equal(HandlingUnitBulkCreateBody.safeParse({}).success, false);
  // `.strict()` — an external tote code has no meaning for a batch.
  assert.equal(HandlingUnitBulkCreateBody.safeParse({ count: 2, code: 'TOTE-9' }).success, false);
});

// ─── One statement for N boxes ──────────────────────────────────────────────

test('createHandlingUnitsBulk mints N boxes with ONE insert carrying the count', async () => {
  const ids = Array.from({ length: 40 }, (_, i) => 1000 + i);
  const exec = fakeExecutor(() => ids.map(row));

  const out = await createHandlingUnitsBulk({
    organizationId: ORG,
    createdBy: 12,
    count: 40,
    locationId: 7,
    notes: 'bench 3',
  }, exec);

  assert.equal(exec.calls.length, 1, 'a 40-box mint must be one round trip, not 40');
  const { sql, params } = exec.calls[0];
  assert.match(sql, /INSERT INTO handling_units/);
  assert.match(sql, /generate_series\(1, \$5::int\)/);
  assert.deepEqual(params, [7, 12, 'bench 3', ORG, 40]);
  assert.equal(out.length, 40);
});

test('createHandlingUnitsBulk leaves code NULL so the trigger mints H-{id}', async () => {
  const exec = fakeExecutor(() => [row(5)]);

  await createHandlingUnitsBulk({ organizationId: ORG, createdBy: null, count: 1 }, exec);

  const { sql, params } = exec.calls[0];
  // `code` is the first inserted column and its SELECT-list value is SQL NULL.
  assert.match(sql, /\(code, location_id, created_by, notes, organization_id\)/);
  assert.match(sql, /SELECT NULL::text,/);
  // No code is minted client-side, so no `H-` literal reaches the parameters.
  assert.equal(params.some((p) => typeof p === 'string' && p.startsWith('H-')), false);
});

test('createHandlingUnitsBulk returns the batch ascending by id', async () => {
  // RETURNING order is not guaranteed; the label run must still print in mint order.
  const exec = fakeExecutor(() => [row(1003), row(1001), row(1002)]);

  const out = await createHandlingUnitsBulk({ organizationId: ORG, createdBy: null, count: 3 }, exec);

  assert.deepEqual(out.map((r) => r.id), [1001, 1002, 1003]);
  assert.deepEqual(out.map((r) => r.code), ['H-1001', 'H-1002', 'H-1003']);
});

test('createHandlingUnitsBulk sets the org GUC before inserting on a caller-owned executor', async () => {
  const exec = fakeExecutor((sql) => (sql.includes('INSERT') ? [row(1), row(2)] : []));

  const out = await createHandlingUnitsBulk(
    { organizationId: ORG, createdBy: null, count: 2 },
    exec,
    ORG,
  );

  assert.equal(exec.calls.length, 2);
  assert.match(exec.calls[0].sql, /set_config\('app\.current_org'/);
  assert.deepEqual(exec.calls[0].params, [ORG]);
  assert.match(exec.calls[1].sql, /INSERT INTO handling_units/);
  assert.equal(out.length, 2);
});

test('createHandlingUnitsBulk never issues a statement for a non-positive count', async () => {
  const exec = fakeExecutor(() => []);

  assert.deepEqual(await createHandlingUnitsBulk({ organizationId: ORG, createdBy: null, count: 0 }, exec), []);
  assert.equal(exec.calls.length, 0);
});
