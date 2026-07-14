import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Durable no-serial waiver contract — the persistence half of the Unbox
 * stepper's Serial step (migration 2026-07-14_receiving_line_serial_absent.sql;
 * route POST /api/receiving/lines/[id]/serial-absent).
 *
 * The green-check no-serial waiver used to be ephemeral client state, so the
 * stepper's Serial dot never flipped done on a waived line and the waiver was
 * lost on reload. This spec proves the durable replacement end-to-end:
 *   - the read-model (`/api/receiving-lines`) surfaces `serial_absent` on every row
 *   - POST serial-absent { absent:true } persists + the read-model reflects it
 *   - the reason defaults to NOT_SERIALIZED when omitted, and clears on { absent:false }
 *   - a toggle is exact-value (not first-wins) and restores cleanly
 *   - invalid / unknown line ids return 400 / 404
 *
 * Auth comes from the saved storageState (tests/.auth/admin.json) via
 * global-setup, so request.* calls run as the admin staff. Idempotent: every
 * mutation restores the line's original waiver state in a finally block.
 */

const ROUTE = (id: number | string) => `/api/receiving/lines/${id}/serial-absent`;

async function firstLine(request: APIRequestContext) {
  const res = await request.get('/api/receiving-lines?view=recent&limit=10');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const rows: any[] = body.receiving_lines ?? body.rows ?? [];
  return rows;
}

async function readWaiver(request: APIRequestContext, id: number) {
  const res = await request.get(`/api/receiving-lines?id=${id}`);
  expect(res.status()).toBe(200);
  const line = (await res.json()).receiving_line;
  return {
    serial_absent: line?.serial_absent ?? false,
    serial_absent_reason: line?.serial_absent_reason ?? null,
  };
}

test.describe('receiving no-serial waiver (durable serial_absent)', () => {
  test('read-model exposes serial_absent on every receiving row', async ({ request }) => {
    const res = await request.get('/api/receiving-lines?view=recent&limit=5');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    for (const row of body.receiving_lines ?? body.rows ?? []) {
      expect(row).toHaveProperty('serial_absent');
      expect(typeof row.serial_absent).toBe('boolean');
    }
  });

  test('POST waiver persists, the read-model reflects it, and it clears (round-trip)', async ({
    request,
  }) => {
    const rows = await firstLine(request);
    test.skip(rows.length === 0, 'no receiving lines in this environment');
    const id = rows[0].id as number;
    const original = await readWaiver(request, id);

    try {
      // Set the waiver with an explicit reason.
      const set = await request.post(ROUTE(id), { data: { absent: true, reason: 'BULK' } });
      expect(set.status()).toBe(200);
      const sj = await set.json();
      expect(sj.success).toBe(true);
      expect(sj.line.serial_absent).toBe(true);
      expect(sj.line.serial_absent_reason).toBe('BULK');

      // Durable: the read-model (the SoT the stepper derives from) reflects it.
      expect(await readWaiver(request, id)).toEqual({
        serial_absent: true,
        serial_absent_reason: 'BULK',
      });

      // Clear the waiver — exact-value toggle, reason forced null.
      const clear = await request.post(ROUTE(id), { data: { absent: false } });
      expect(clear.status()).toBe(200);
      const cj = await clear.json();
      expect(cj.line.serial_absent).toBe(false);
      expect(cj.line.serial_absent_reason).toBeNull();
      expect(await readWaiver(request, id)).toEqual({
        serial_absent: false,
        serial_absent_reason: null,
      });
    } finally {
      // Restore the line's original waiver state so the test is idempotent.
      await request.post(ROUTE(id), {
        data: { absent: original.serial_absent, reason: original.serial_absent_reason },
      });
    }
  });

  test('reason defaults to NOT_SERIALIZED when the waiver is set without one', async ({
    request,
  }) => {
    const rows = await firstLine(request);
    test.skip(rows.length === 0, 'no receiving lines in this environment');
    const id = rows[0].id as number;
    const original = await readWaiver(request, id);

    try {
      const res = await request.post(ROUTE(id), { data: { absent: true } });
      expect(res.status()).toBe(200);
      const j = await res.json();
      expect(j.line.serial_absent).toBe(true);
      expect(j.line.serial_absent_reason).toBe('NOT_SERIALIZED');
    } finally {
      await request.post(ROUTE(id), {
        data: { absent: original.serial_absent, reason: original.serial_absent_reason },
      });
    }
  });

  test('unknown line id → 404; invalid id → 400', async ({ request }) => {
    const notFound = await request.post(ROUTE(999_999_999), { data: { absent: true } });
    expect(notFound.status()).toBe(404);

    const invalid = await request.post(ROUTE('0'), { data: { absent: true } });
    expect(invalid.status()).toBe(400);
  });
});
