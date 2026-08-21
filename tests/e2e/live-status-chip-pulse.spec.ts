import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import {
  QA_FIXTURE_TRACKING_PENDING_THIRD,
} from '@/lib/tenancy/qa-org';

/**
 * The live-change status chip, end to end.
 *
 * Two halves, deliberately separate because they can fail for different reasons:
 *
 *  1. **The micro-interaction** — a status label that changes under a mounted
 *     row runs `motionRole.feedback.liveChange` (double pulse + morph) and
 *     washes its row. Driven by a refetch that returns a different lifecycle
 *     status, so the assertion is about the CLIENT chain: new data → React
 *     Query → row re-render → `GridStatusCellValue` pulse.
 *  2. **The realtime chain** — a tracking scan at the tech bench reaches a
 *     board nobody touched, live, with no reload. Driven by a real
 *     `POST /api/tech/scan`, so the assertion is about the SERVER chain:
 *     scan → `publishOrderTested` → Ably → `patchUnshippedOrderTested`.
 *
 * Both run on the QA org (`qa-desktop`) and both restore what they touched —
 * (1) never writes at all (the status swap is a response intercept), (2) undoes
 * its scan through the operator's own undo path.
 */

const RECEIVING_LINES_QUERY = '**/api/receiving-lines?*';

/**
 * Record every chip that lights up, keyed by row.
 *
 * A `waitFor` on the attribute itself would be a race: the mark lives 1.4s and
 * the DOM change that triggers it is the same tick as the label swap, so an
 * assertion that arrives late sees a chip that has already settled. The
 * observer is armed BEFORE the change and remembers.
 */
async function armPulseRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __cfPulsedRows?: string[] };
    w.__cfPulsedRows = [];
    new MutationObserver((records) => {
      for (const record of records) {
        const el = record.target as HTMLElement;
        if (record.attributeName !== 'data-live-value-change') continue;
        if (!el.hasAttribute('data-live-value-change')) continue;
        const rowId = el.closest('[data-order-row-id]')?.getAttribute('data-order-row-id');
        w.__cfPulsedRows!.push(rowId ?? '(no row)');
      }
    }).observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-live-value-change'],
    });
  });
}

/**
 * Delete every tech-bench scan sitting on the fixture tracking.
 *
 * The spec has to write to prove anything, so it owns both ends: it clears the
 * fixture BEFORE it starts (a run killed mid-flight, or a scan that produced
 * more than one activity row, must not poison the next run) and again after.
 * `undo-last` is not the door — it only unwinds SERIALS, and a bare tracking
 * scan records none, so the scan's own station-activity row is what has to go.
 */
async function clearFixtureTechScans(request: APIRequestContext): Promise<number> {
  let removed = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const res = await request.get('/api/tech/logs?limit=50');
    if (!res.ok()) break;
    const body = await res.json();
    const rows = Object.values(body).filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === 'object' && 'source_row_id' in row,
    );
    const hit = rows.find(
      (row) => String(row.shipping_tracking_number ?? '') === QA_FIXTURE_TRACKING_PENDING_THIRD,
    );
    if (!hit) return removed;
    const del = await request.post('/api/tech/delete-tracking', {
      data: { sourceRowId: hit.source_row_id, sourceKind: hit.source_kind },
    });
    expect(del.ok(), `could not clear fixture scan ${hit.source_row_id}: ${await del.text()}`).toBeTruthy();
    removed += 1;
  }
  return removed;
}

const pulsedRows = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __cfPulsedRows?: string[] }).__cfPulsedRows ?? [],
  );

test.describe('live status chip', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'grid + motion assertions are chromium-only');

  test('a status that changes under a mounted row pulses and washes the row', async ({ page }) => {
    // Unbox History, not Incoming. Both grids have a `status` column, but only
    // the LANDED phase renders the lifecycle chip through the shared
    // `GridStatusCellValue`; the expected phase swaps in
    // `ReceivingDeliveryStatusCell`, which is carrier delivery_state with its
    // own local markup and therefore no pulse.
    await page.goto('/unbox?unboxview=history');

    const rows = page.locator('[data-order-row-id]');
    // ATTACHED, not visible. Unbox restores the last-open line and its workspace
    // overlay sits over the history spreadsheet with `visibility: hidden`, which
    // is a fact about that surface's chrome and not about this behaviour: the
    // rows have real geometry, React still renders them, and Motion still runs
    // on them. Requiring visibility here would make the spec a test of whether a
    // line happens to be open.
    await expect(rows.first()).toBeAttached({ timeout: 30_000 });

    const row = rows.first();
    const rowId = await row.getAttribute('data-order-row-id');
    expect(rowId, 'the grid row carries the shared row id the wash selector keys on').toBeTruthy();

    const statusCell = row.locator('[data-col="status"]');
    await expect(
      statusCell.locator('span.inset-chip'),
      'the landed-phase grid renders the shared house chip, not a local twin',
    ).toHaveCount(1);
    // `textContent`, not `innerText` — the latter is layout-aware and returns ''
    // behind the overlay.
    const before = ((await statusCell.textContent()) ?? '').trim();
    expect(before.length, 'the chip has a lifecycle label to change').toBeGreaterThan(0);

    await armPulseRecorder(page);

    // Serve a DIFFERENT lifecycle status for this one row on the next fetch.
    // Nothing is written: the row on the QA org is untouched, and the client
    // chain under test starts at "new data arrived", which is exactly where an
    // Ably-driven refetch starts too.
    //
    // The fields below are the ones `railCoarseStatus` actually reads on this
    // surface — patching `workflow_status` alone does nothing, because an
    // unmatched carton and a Zoho-received line both short-circuit ahead of it.
    // Which direction we push depends on where the row already sits, so the
    // spec cannot silently pass by asserting a row is what it already was.
    const goingToScanned = before.toLowerCase() === 'received';
    await page.route(RECEIVING_LINES_QUERY, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      for (const line of body?.receiving_lines ?? []) {
        if (String(line.id) !== rowId) continue;
        line.receiving_source = 'unmatched';
        line.zoho_status = null;
        line.unboxed_at = goingToScanned ? null : line.unboxed_at ?? new Date().toISOString();
        line.quantity_received = goingToScanned ? 0 : 1;
      }
      await route.fulfill({ response, body: JSON.stringify(body) });
    });

    // The app's own refresh bus — the same door an Ably `receiving-log.changed`
    // invalidation goes through. A reload would REMOUNT the row, and a mount is
    // deliberately not a change (`shouldPulseLiveValue`), so it would prove
    // nothing.
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent('cf:refresh', { detail: { domains: ['receiving.lines'] } }),
      );
    });

    await expect
      .poll(async () => ((await statusCell.textContent()) ?? '').trim(), {
        timeout: 20_000,
        message: 'the chip repaints with the new lifecycle status',
      })
      .not.toBe(before);

    expect(
      await pulsedRows(page),
      'the changed row ran the live-change pulse',
    ).toContain(rowId);

    // The row wash is a `:has()` rule on a pseudo-element, so its existence is
    // only observable through computed style.
    const washed = await row.evaluate((el) => {
      const after = getComputedStyle(el, '::after');
      return {
        content: after.content,
        animation: after.animationName,
      };
    });
    expect(washed.animation, 'the row carries the live wash while the chip is marked').toBe(
      'cf-live-row-wash',
    );

    // Drop the intercept before teardown — an in-flight `route.fetch` against a
    // closing page reports as a spec failure with nothing wrong.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  });

  test('a bench tracking scan moves the order on an untouched board, live', async ({
    page,
    request,
  }) => {
    const last8 = QA_FIXTURE_TRACKING_PENDING_THIRD.slice(-8);

    // Start from a known lane, whatever the last run left behind.
    await clearFixtureTechScans(request);

    await page.goto('/shipping/orders');

    const rows = page.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });

    const scanned = rows.filter({ hasText: last8 });
    await expect(
      scanned,
      'the QA tracked-pending fixture is on the pre-pack board before the scan',
    ).toHaveCount(1, { timeout: 20_000 });

    await armPulseRecorder(page);

    // The bench scan. A SEPARATE request context on purpose — the point of the
    // test is that a board nobody touched reacts, so the page must not be the
    // thing that made the call.
    const scan = await request.post('/api/tech/scan', {
      data: {
        type: 'TRACKING',
        value: QA_FIXTURE_TRACKING_PENDING_THIRD,
        idempotencyKey: `e2e-live-chip-${Date.now()}`,
      },
    });
    expect(scan.ok(), `tech scan failed: ${scan.status()} ${await scan.text()}`).toBeTruthy();
    expect(
      Number.isFinite(Number((await scan.json())?.salId)),
      'the scan records a station-activity row — the fact `has_tech_scan` reads',
    ).toBeTruthy();

    try {
      // The Pending lane is "everything not TESTED", so a tech verdict takes the
      // row out of it. No reload, no refetch of the row list — this only passes
      // if the Ably `order.tested` push reached `patchUnshippedOrderTested`.
      await expect(
        scanned,
        'the scanned order leaves the Pending lane without a reload',
      ).toHaveCount(0, { timeout: 20_000 });

      // …and it is on the Tested lane — "ready to pack" — which is the same
      // cache and the same patch. The lifecycle tab is a bare URL flag
      // (`?tested`), not `?view=`, which `normalizeDashboardOrderViewParams`
      // strips.
      await page.goto('/shipping/orders?tested');
      await expect(
        page.locator('[data-order-row-id]').filter({ hasText: last8 }),
        'the scanned order arrives on the Tested lane',
      ).toHaveCount(1, { timeout: 20_000 });
    } finally {
      // Loop, not a single delete on the returned `salId`: one bench scan can
      // leave more than one activity row on the tracking, and a leftover keeps
      // `has_tech_scan` true — which is exactly the "fixture is not on the
      // pre-pack board" failure this spec used to open with on a re-run.
      const removed = await clearFixtureTechScans(request);
      expect(removed, 'the scan this spec made was cleared').toBeGreaterThan(0);
    }
  });
});
