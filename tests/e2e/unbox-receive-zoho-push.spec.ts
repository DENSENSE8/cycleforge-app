import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Unbox Receive → Zoho purchase receive (PUSH, not cron).
 *
 * Proves the CURRENT architecture (Integrations-as-SoT Wave B1):
 *   Clicking Receive POSTs `/api/receiving/mark-received-po`. That route commits
 *   the local receive, returns an OPTIMISTIC 200 (lines flip to UNBOXED for
 *   Zoho-linked cartons), then in `after()` calls
 *   `getInventoryProvider().markPurchaseOrderReceived()` — the real Zoho purchase
 *   receive — and promotes UNBOXED → DONE only when that push succeeds.
 *
 * There is NO POST to `/api/zoho/purchase-orders/receive` anymore — the stale
 * `receive-to-zoho.spec.ts` waits for that legacy endpoint and never fires it.
 *
 * The observable proof of `zohoReceive: 'ok'` WITHOUT server-log access is the
 * UNBOXED → DONE promotion: the route only advances a Zoho-linked line to DONE
 * when `poZohoReceiveSucceeded === true` (mark-received-po/route.ts §"UNBOXED →
 * DONE on Zoho confirmation"). Poll the line to DONE = the push confirmed and
 * the PO dropped off Incoming without any cron pull.
 *
 * ── Blast radius ────────────────────────────────────────────────────────────
 * The push writes a REAL purchase-receive to live Zoho Inventory. The mutating
 * test is therefore GATED: it runs only when a target is pinned
 * (PW_RECV_ID + PW_LINE_ID, or PW_TEST_TRACKING) or PW_ALLOW_LIVE_RECEIVE=1.
 * Un-gated, the spec still asserts the endpoint contract + candidate
 * availability (read-only) and documents the stuck-UNBOXED backlog that keeps
 * `incoming-po-sync` hot.
 *
 * Env:
 *   PW_RECV_ID + PW_LINE_ID   pin the exact carton line to receive (reproducible)
 *   PW_TEST_TRACKING          resolve the carton by tracking (drives the UI test)
 *   PW_ALLOW_LIVE_RECEIVE=1   allow auto-picking a target for the live push
 */

interface LineRow {
  id: number;
  receiving_id: number | null;
  receiving_source?: string | null;
  workflow_status?: string | null;
  condition_grade?: string | null;
  quantity_received?: number | null;
  quantity_expected?: number | null;
  tracking_number?: string | null;
  zoho_purchaseorder_id?: string | null;
  zoho_line_item_id?: string | null;
  zoho_item_id?: string | null;
  zoho_purchaseorder_number?: string | null;
  sku?: string | null;
  item_name?: string | null;
  is_delivered?: boolean | null;
}

const RECEIVABLE = new Set(['MATCHED', 'UNBOXED']);
const LIVE =
  process.env.PW_ALLOW_LIVE_RECEIVE === '1' ||
  Boolean(process.env.PW_RECV_ID && process.env.PW_LINE_ID) ||
  Boolean(process.env.PW_TEST_TRACKING);

async function fetchRecentLines(request: APIRequestContext): Promise<LineRow[]> {
  const res = await request.get('/api/receiving-lines?view=recent&include=serials&limit=500');
  expect(res.ok(), `GET /api/receiving-lines → ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return (body.receiving_lines ?? []) as LineRow[];
}

/** A line usable for the receive→Zoho push: a REAL carton, both Zoho ids, a
 *  Zoho-PO source, and a receivable status. Prefer already-UNBOXED, qty-complete
 *  lines (finishing a stuck receive = lowest blast radius) over fresh MATCHED. */
function pickReceivable(rows: LineRow[]): LineRow | null {
  const usable = rows.filter(
    (r) =>
      r.receiving_id != null &&
      r.receiving_source !== 'unmatched' &&
      !!r.zoho_purchaseorder_id &&
      !!r.zoho_line_item_id &&
      RECEIVABLE.has(String(r.workflow_status ?? '').toUpperCase()),
  );
  const complete = (r: LineRow) =>
    r.quantity_expected != null &&
    Number(r.quantity_received ?? 0) >= Number(r.quantity_expected);
  return (
    usable.find((r) => String(r.workflow_status).toUpperCase() === 'UNBOXED' && complete(r)) ??
    usable.find((r) => String(r.workflow_status).toUpperCase() === 'UNBOXED') ??
    usable.find((r) => r.is_delivered) ??
    usable[0] ??
    null
  );
}

async function findTarget(request: APIRequestContext): Promise<LineRow | null> {
  const pinRecv = process.env.PW_RECV_ID;
  const pinLine = process.env.PW_LINE_ID;
  if (pinRecv && pinLine) {
    const res = await request.get(`/api/receiving-lines?receiving_id=${pinRecv}&include=serials`);
    if (res.ok()) {
      const rows: LineRow[] = (await res.json()).receiving_lines ?? [];
      const hit = rows.find((r) => String(r.id) === String(pinLine));
      if (hit) return hit;
    }
    return null;
  }
  const rows = await fetchRecentLines(request);
  if (process.env.PW_TEST_TRACKING) {
    const t = process.env.PW_TEST_TRACKING.trim();
    const byTracking = rows.filter(
      (r) => (r.tracking_number ?? '').includes(t) && r.receiving_id != null,
    );
    return pickReceivable(byTracking) ?? byTracking[0] ?? null;
  }
  return pickReceivable(rows);
}

/** Preflight: the push can only reach DONE if the org's Zoho grant mints a
 *  token. A revoked refresh token (invalid_code) fails EVERY Zoho call, so the
 *  line stays UNBOXED forever. Surface that as an actionable message up front
 *  instead of a 15s poll to a cryptic "UNBOXED". */
async function assertZohoTokenOk(request: APIRequestContext): Promise<void> {
  const res = await request.get('/api/zoho/health');
  const h = res.ok() ? await res.json().catch(() => null) : null;
  if (h?.connected && h?.token_ok === false) {
    throw new Error(
      `Zoho grant is not usable — the background push cannot succeed.\n` +
        `  live_error: ${h.live_error}\n` +
        `  Fix: reconnect Zoho at /settings/integrations (or GET /api/zoho/refresh-token) ` +
        `to mint a fresh refresh token, then re-run. A revoked grant leaves every ` +
        `receive stuck UNBOXED — which is what keeps incoming-po-sync hot.`,
    );
  }
  if (h && h.connected === false) {
    throw new Error('Zoho is not connected for this org — connect at /settings/integrations.');
  }
}

/** Poll a single line's workflow_status. */
async function readLine(
  request: APIRequestContext,
  receivingId: number,
  lineId: number,
): Promise<LineRow | null> {
  const res = await request.get(`/api/receiving-lines?receiving_id=${receivingId}&include=serials`);
  if (!res.ok()) return null;
  const rows: LineRow[] = (await res.json()).receiving_lines ?? [];
  return rows.find((r) => r.id === lineId) ?? null;
}

test.describe('Unbox Receive → Zoho purchase receive (push)', () => {
  // ── Read-only: contract + the regression premise ────────────────────────────
  test('endpoint exposes the Zoho linkage + a receivable candidate exists', async ({ request }) => {
    const rows = await fetchRecentLines(request);
    expect(rows.length, 'receiving-lines feed returns rows').toBeGreaterThan(0);

    // Wiring: a line row must carry the Zoho identity + workflow_status the push
    // path keys on. (If these keys vanish, the push can never resolve a PO.)
    const sample = rows[0];
    expect(sample, 'row exposes zoho_purchaseorder_id').toHaveProperty('zoho_purchaseorder_id');
    expect(sample, 'row exposes zoho_line_item_id').toHaveProperty('zoho_line_item_id');
    expect(sample, 'row exposes workflow_status').toHaveProperty('workflow_status');

    const target = pickReceivable(rows);
    expect(
      target,
      'a Zoho-linked, receivable carton line (MATCHED/UNBOXED, both zoho ids) should exist',
    ).toBeTruthy();

    // Regression signal: lines stuck UNBOXED with a Zoho PO link are receives
    // whose background push did NOT confirm — exactly what keeps
    // incoming-po-sync hot. Surface the count (informational, never fails).
    const stuckUnboxed = rows.filter(
      (r) =>
        String(r.workflow_status).toUpperCase() === 'UNBOXED' &&
        !!r.zoho_purchaseorder_id &&
        r.receiving_source !== 'unmatched',
    );
    console.log(
      `[receive-zoho] stuck UNBOXED (Zoho-linked, push unconfirmed): ${stuckUnboxed.length}` +
        (stuckUnboxed.length
          ? ` — e.g. recv ${stuckUnboxed[0].receiving_id} line ${stuckUnboxed[0].id} PO ${stuckUnboxed[0].zoho_purchaseorder_number}`
          : ''),
    );
  });

  // ── Live push: the actual proof (gated — writes to real Zoho) ────────────────
  test('Receive pushes to Zoho and promotes UNBOXED → DONE (no cron)', async ({ request }) => {
    test.skip(
      !LIVE,
      'Live Zoho receive is gated. Set PW_ALLOW_LIVE_RECEIVE=1, or pin PW_RECV_ID+PW_LINE_ID / PW_TEST_TRACKING.',
    );
    test.setTimeout(90_000);

    // Fail fast + actionable if the Zoho grant can't mint a token — the push
    // is structurally unable to reach DONE in that state.
    await assertZohoTokenOk(request);

    const target = await findTarget(request);
    expect(target, 'a receivable Zoho-linked carton line to receive').toBeTruthy();
    const { receiving_id, id } = target!;
    expect(receiving_id, 'target has a real carton (receiving_id)').toBeTruthy();
    expect(target!.zoho_purchaseorder_id, 'target has zoho_purchaseorder_id').toBeTruthy();
    expect(target!.zoho_line_item_id, 'target has zoho_line_item_id').toBeTruthy();

    console.log(
      `[receive-zoho] target recv=${receiving_id} line=${id} sku=${target!.sku} ` +
        `status=${target!.workflow_status} PO=${target!.zoho_purchaseorder_number} ` +
        `(${target!.zoho_purchaseorder_id}) li=${target!.zoho_line_item_id}`,
    );

    // Exactly the body the Receive button sends (useReceiveAction.tsx), incl. the
    // Idempotency-Key header. A fresh key so this is a genuine push, not a replay.
    const clientEventId = `pw-receive-${receiving_id}-${id}-${test.info().workerIndex}-${Date.now()}`;
    const t0 = Date.now();
    const markRes = await request.post('/api/receiving/mark-received-po', {
      headers: { 'Idempotency-Key': clientEventId },
      data: {
        receiving_id,
        receiving_line_id: id,
        receive_intent: 'zoho_receive',
        qa_status: 'PASSED',
        disposition_code: 'ACCEPT',
        condition_grade: target!.condition_grade ?? 'USED_A',
        client_event_id: clientEventId,
      },
    });
    const elapsed = Date.now() - t0;

    // 1) Immediate 200 with the optimistic contract.
    expect(markRes.status(), 'mark-received-po returns HTTP 200').toBe(200);
    const body = await markRes.json();
    console.log(
      `[receive-zoho] POST ${elapsed}ms → ${JSON.stringify({
        success: body.success,
        summary: body.summary,
        zoho: body.zoho,
        line0: body.receiving_lines?.[0]?.workflow_status,
      })}`,
    );
    expect(body.success, 'success === true').toBe(true);
    expect(Number(body.zoho?.attempted ?? 0), 'zoho.attempted >= 1').toBeGreaterThanOrEqual(1);
    expect(body.summary?.marked_received, 'summary.marked_received === true').toBe(true);
    const line0 = (body.receiving_lines ?? [])[0];
    expect(line0, 'response carries the received line').toBeTruthy();
    // Optimistic: a Zoho-linked line is UNBOXED until the push confirms.
    expect(String(line0.workflow_status).toUpperCase()).toBe('UNBOXED');

    // 2) Reconcile ≤ 15s: poll the line to DONE (Option B). DONE == the Zoho
    //    push returned ok — no cron involved.
    const deadline = Date.now() + 15_000;
    let last: LineRow | null = null;
    while (Date.now() < deadline) {
      last = await readLine(request, receiving_id as number, id);
      if (String(last?.workflow_status ?? '').toUpperCase() === 'DONE') break;
      await new Promise((r) => setTimeout(r, 1_000));
    }

    if (String(last?.workflow_status ?? '').toUpperCase() !== 'DONE') {
      // FAILURE PATH — capture the diagnostic the goal asks for: run the Zoho
      // receive synchronously against the reconstructed payload and print the
      // verbatim Zoho response / error + PO status before/after.
      const dbg = await request.post('/api/zoho/debug-receive', {
        data: {
          purchaseorder_id: target!.zoho_purchaseorder_id,
          line_items: [
            {
              line_item_id: target!.zoho_line_item_id,
              quantity_received: Math.max(1, Number(target!.quantity_expected ?? 1)),
              item_id: target!.zoho_item_id ?? undefined,
            },
          ],
        },
      });
      const dbgBody = await dbg.json().catch(() => null);
      console.error(
        '[receive-zoho] STUCK UNBOXED — line did not reach DONE.\n' +
          `  mark-received-po body: ${JSON.stringify(body)}\n` +
          `  line now: ${JSON.stringify(last)}\n` +
          `  debug-receive: ${JSON.stringify(dbgBody)}`,
      );
    }

    expect(
      String(last?.workflow_status ?? '').toUpperCase(),
      'line promotes to DONE within 15s (Zoho push confirmed, no cron)',
    ).toBe('DONE');

    // 3) Stretch — idempotency: re-POST with the SAME key must REPLAY the cached
    //    response (no second Zoho purchase-receive created).
    const replay = await request.post('/api/receiving/mark-received-po', {
      headers: { 'Idempotency-Key': clientEventId },
      data: {
        receiving_id,
        receiving_line_id: id,
        receive_intent: 'zoho_receive',
        qa_status: 'PASSED',
        disposition_code: 'ACCEPT',
        condition_grade: target!.condition_grade ?? 'USED_A',
        client_event_id: clientEventId,
      },
    });
    expect(replay.status(), 'idempotent replay returns 200').toBe(200);
    const replayBody = await replay.json();
    expect(replayBody.success).toBe(true);
    // Same claim → same optimistic summary; the push is NOT run a second time.
    expect(replayBody.zoho?.attempted).toBe(body.zoho?.attempted);
  });

  // ── UI proof (best-effort — needs a pinned tracking; also gated) ─────────────
  test('UI: Receive shows "Confirmed in inventory", not failed', async ({ page, request }) => {
    test.skip(
      !process.env.PW_TEST_TRACKING,
      'UI receive drive needs PW_TEST_TRACKING to resolve a specific carton.',
    );
    test.setTimeout(90_000);
    const target = await findTarget(request);
    test.skip(!target, 'no receivable carton for the given tracking');
    const { receiving_id, id } = target!;

    // Open the carton line directly in the unbox workspace.
    await page.goto(`/receiving?recvId=${receiving_id}&lineId=${id}`);

    const receiveBtn = page
      .getByRole('button', { name: /PRINT.*RECEIVE|^Receive$|Receive & print/i })
      .first();
    await expect(receiveBtn, 'Receive action is visible').toBeVisible({ timeout: 25_000 });
    await receiveBtn.click();

    // Optimistic emerald checklist appears immediately, then the realtime
    // `zohoReceive: 'ok'` verdict flips the footer to "Confirmed in inventory".
    await expect(page.getByText(/Confirmed in inventory/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Sync failed|failed to sync/i)).toHaveCount(0);
  });
});
