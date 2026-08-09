import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Unbox History inspector — Delete carton (sticky Macro floor, n=1).
 *
 * `HistoryCartonTriagePanel` (`detail:history`) now mounts an
 * `InspectorActionFloor` + `InspectorFlushDelete` when exactly one carton is
 * selected — matching the sibling desk peeks (Orders / Incoming). Delete grain
 * is the whole carton: `DELETE /api/receiving-logs?id=`.
 *
 * Two proofs, both safe on a shared tenant:
 *   A. API round-trip — "add an unfound tracking number and delete" via the
 *      exact endpoints the UI wires (`import-purchase` → `receiving-logs`), on a
 *      throwaway carton so no fixture is harmed.
 *   B. UI smoke — the Delete control renders on the History triage panel. It is
 *      NOT confirm-clicked (that would hard-delete a fixture carton); presence +
 *      the API round-trip together prove the wiring.
 *
 * Run against the QA org (`.claude/rules/verify.md`):
 *   pnpm provision:qa-org
 *   npx playwright test tests/e2e/history-carton-delete.spec.ts --project=qa-desktop
 */

async function resolveCartonId(
  request: APIRequestContext,
  receivingLineId: number,
): Promise<number | null> {
  const res = await request.get(`/api/receiving-lines?id=${receivingLineId}`);
  if (!res.ok()) return null;
  const body = await res.json().catch(() => null);
  const row = body?.receiving_line ?? (Array.isArray(body?.receiving_lines) ? body.receiving_lines[0] : null);
  const rid = Number(row?.receiving_id);
  return Number.isFinite(rid) && rid > 0 ? rid : null;
}

test.describe('History carton delete', () => {
  test('add a tracking number then delete the carton (API round-trip)', async ({ request }) => {
    const stamp = `${process.env.PW_STAMP ?? 't'}-${Math.floor(Math.random() * 1e9)}`;
    const tracking = `QA-DEL-TRK-${stamp}`;
    const orderId = `QA-DEL-ORD-${stamp}`;

    // 1. Add — the Band-1 "Add" flow (IncomingAddInboundOverlay → this endpoint),
    //    a manual inbound carton carrying a tracking number. Unique order_id so it
    //    gets its OWN carton (created:true) and delete cannot touch a fixture.
    const add = await request.post('/api/receiving/inbound/import-purchase', {
      data: {
        kind: 'purchase',
        source_type: 'manual',
        order_id: orderId,
        item_name: 'QA delete round-trip carton',
        quantity: 1,
        tracking_number: tracking,
      },
    });
    expect(add.status(), await add.text()).toBe(201);
    const added = await add.json();
    expect(added.success).toBe(true);
    expect(added.created).toBe(true);
    const lineId = Number(added.receiving_line_id);
    expect(Number.isFinite(lineId) && lineId > 0).toBe(true);

    const cartonId = await resolveCartonId(request, lineId);
    expect(cartonId, 'created line must resolve a receiving_carton id').not.toBeNull();

    // 2. Delete — the exact call the History inspector's Delete floor makes.
    const del = await request.delete(`/api/receiving-logs?id=${cartonId}`);
    expect(del.status(), await del.text()).toBe(200);
    const deleted = await del.json();
    expect(deleted.success).toBe(true);
    expect(Number(deleted.id)).toBe(cartonId);

    // 3. Gone — a second delete is idempotent (404), never a 500.
    const again = await request.delete(`/api/receiving-logs?id=${cartonId}`);
    expect(again.status()).toBe(404);
  });

  test('the History triage panel renders a Delete control (UI smoke)', async ({ page }) => {
    test.skip(
      test.info().project.name === 'qa-mobile',
      'queue grids are a desktop layout',
    );

    // The Unbox History tab (`?unboxview=history`) is where a single row-click
    // opens `detail:history` — `/receiving/history` row-clicks navigate to
    // /carton/[id] instead. Navigate straight to it so the grid is in history
    // mode before we grab a row (a tab click can leave a stale Recent row that
    // opens the LineEditPanel workspace instead of the triage panel).
    await page.goto('/unbox?unboxview=history');
    await page.waitForLoadState('networkidle').catch(() => {});

    const rows = page.locator('[data-line-row-id]');
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasRows, 'no Unbox History rows on this tenant');

    // The h-7 rows scroll flush under the sticky frozen column header, which
    // intercepts a real pointer at every click point. Dispatch the click to fire
    // the row's onClick directly (Playwright's documented overlay escape) — the
    // panel opening is the assertion, not the pointer mechanics.
    await rows.first().dispatchEvent('click');

    // EXACTLY ONE occupant mounts. The host used to render a picked occupant in
    // BOTH its overlay and push branches during the overlay→push handoff on open
    // (RightRailHost derived `isPush` from the lagging `frame.mode`), leaving two
    // live "Delete carton" controls on one carton. Fixed by deciding push/overlay
    // synchronously from the occupant's own intent — so assert count, not `.first()`.
    const panels = page.getByTestId('history-carton-triage-panel');
    await expect(panels.first()).toBeVisible({ timeout: 15_000 });
    await expect(panels).toHaveCount(1);
    const panel = panels.first();

    // The bottom dock — record actions relocated here (Phase 1): the primary CTA
    // and the flush Delete both live on the floor, never on the identity band.
    // Delete is never confirm-clicked here (it would hard-delete a fixture).
    await expect(panel.getByTestId('history-triage-primary-cta')).toBeVisible();
    await expect(panel.getByTestId('history-triage-delete')).toBeVisible();
  });

  test('Export downloads the History view as CSV (table action)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'qa-mobile', 'queue grids are a desktop layout');

    await page.goto('/unbox?unboxview=history');
    await page.waitForLoadState('networkidle').catch(() => {});

    const exportBtn = page.getByTestId('unbox-history-export');
    await expect(exportBtn).toBeVisible({ timeout: 15_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportBtn.click(),
    ]);
    // `unbox-history-YYYY-MM-DD.csv` on the warehouse civil day.
    expect(download.suggestedFilename()).toMatch(/^unbox-history-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
