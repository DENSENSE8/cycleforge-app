/**
 * Guards for the canonical tech_serial_numbers writer (relational-reuse plan,
 * Phase 2 — collapse the duplicated TSN INSERTs into one helper).
 *
 * attachTechSerial upper-cases the serial, applies the SERIAL/TECH defaults,
 * always binds serial_unit_id (the FK whose absence was the original drift),
 * and is ON CONFLICT DO NOTHING — verified against an injected executor.
 */

import { test } from 'node:test';
import { equal, ok, deepEqual } from 'node:assert';
import { attachTechSerial } from './tech-serial';

/** The (pg-overloaded) executor param type, for casting the structural mock. */
type Exec = Parameters<typeof attachTechSerial>[1];

/** Capture the SQL + params attachTechSerial issues, without a DB. */
function captureExecutor() {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  return {
    calls,
    async query<T>(text: string, params?: unknown[]) {
      calls.push({ text, params: params ?? [] });
      return { rows: [{ id: 99 }] as T[], rowCount: 1 };
    },
  };
}

test('attachTechSerial upper-cases, applies defaults, and binds the FK', async () => {
  const exec = captureExecutor();
  const result = await attachTechSerial(
    { serialNumber: 'abc-123', serialUnitId: 5, stationSource: 'RECEIVING', testedBy: 7, receivingLineId: 11 },
    exec as unknown as Exec,
  );
  equal(result.id, 99);
  equal(exec.calls.length, 1);
  const { text, params } = exec.calls[0];
  ok(/INSERT INTO tech_serial_numbers/.test(text), 'inserts into tech_serial_numbers');
  ok(/ON CONFLICT DO NOTHING/.test(text), 'is idempotent');
  // Param order matches the helper's column list.
  equal(params[0], 'ABC-123', 'serial is upper-cased');
  equal(params[1], 'SERIAL', 'serial_type defaults to SERIAL');
  equal(params[2], 7, 'tested_by');
  equal(params[3], 'RECEIVING', 'station_source');
  equal(params[4], 11, 'receiving_line_id');
  equal(params[14], 5, 'serial_unit_id is always bound (anti-drift)');
  equal(params[15], null, 'order_id null when omitted');
});

test('attachTechSerial defaults station_source to TECH and serial_unit_id to null', async () => {
  const exec = captureExecutor();
  await attachTechSerial({ serialNumber: 'x' }, exec as unknown as Exec);
  const { params } = exec.calls[0];
  equal(params[3], 'TECH', 'default station_source');
  equal(params[14], null, 'serial_unit_id null when omitted');
  equal(params[15], null, 'order_id null when omitted');
  // Null-coalesced optionals — no undefined leaks into the driver.
  deepEqual(
    params.map((p) => p === undefined),
    new Array(16).fill(false),
    'no undefined params',
  );
});

test('organization_id is bound only when provided (preserves the NOT NULL default)', async () => {
  // Omitted → column absent so the DB session default applies.
  const a = captureExecutor();
  await attachTechSerial({ serialNumber: 's' }, a as unknown as Exec);
  ok(!/organization_id/.test(a.calls[0].text), 'no organization_id column when omitted');
  equal(a.calls[0].params.length, 16, 'just the 16 core params');

  // Provided → column appended, value is the last param.
  const b = captureExecutor();
  await attachTechSerial(
    { serialNumber: 's', organizationId: 'org-123', fnskuLogId: 88 },
    b as unknown as Exec,
  );
  ok(/fnsku_log_id/.test(b.calls[0].text), 'fnsku_log_id column present');
  ok(/organization_id/.test(b.calls[0].text), 'organization_id column present');
  equal(b.calls[0].params[16], 88, 'fnsku_log_id bound after the core 16');
  equal(b.calls[0].params[17], 'org-123', 'organization_id bound last');
});

test('attachTechSerial stamps CF-03 order_id when provided', async () => {
  const exec = captureExecutor();
  await attachTechSerial(
    { serialNumber: 's', orderId: 42, organizationId: 'org-1' },
    exec as unknown as Exec,
  );
  ok(/order_id/.test(exec.calls[0].text), 'order_id column present');
  equal(exec.calls[0].params[15], 42, 'order_id bound');
});

test('attachTechSerial preserves an explicit historical import timestamp', async () => {
  const exec = captureExecutor();
  await attachTechSerial(
    {
      serialNumber: 'historical',
      organizationId: 'org-1',
      createdAt: '2026-01-02T03:04:05.000Z',
    },
    exec as unknown as Exec,
  );
  ok(/created_at/.test(exec.calls[0].text), 'created_at column present');
  equal(exec.calls[0].params.at(-1), '2026-01-02T03:04:05.000Z');
});
