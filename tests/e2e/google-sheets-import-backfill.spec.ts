import { test, expect } from '@playwright/test';

/**
 * Google Sheets order import · live backfill probe.
 *
 * DOGFOOD-ONLY EXCEPTION (verify.md → "E2E runs against the QA org"): this spec
 * exists BECAUSE of production-shaped data. It drives the real importer against
 * the org's real spreadsheet to prove the `sku_platform_ids` unique-violation
 * regression is gone, which the QA org cannot reproduce — the QA tenant has no
 * Google Sheets source and none of the 1,654 NULL-`platform_sku` rows whose
 * fill-in triggered the violation.
 *
 * Assertions are SHAPE-based, never count-based: the sheet's contents change
 * between runs, so this asserts "the stream terminated without a constraint
 * error", not "N orders imported".
 *
 * Regression under test — the importer used to abort with
 *   duplicate key value violates unique constraint "ux_sku_platform_ids_platform_sku"
 * because ensureUnpairedPlatformListing() filled platform_sku blind, while that
 * index asserts a SKU appears in at most one listing per platform+account — a
 * rule a reseller breaks by design (one product, many listings).
 */

// The chrome popover (OrdersSyncPopover → useOrdersSync) drives the connector
// seam, NOT the legacy NDJSON route at /api/google-sheets/transfer-orders that
// the sidebar's useOrdersImport still uses. Watch the one the UI actually calls.
const IMPORT_ROUTE = '/api/integrations/google_sheets/sync';

test.describe('google sheets order import', () => {
  // A live sheet read + full backfill is far slower than a UI assertion.
  test.setTimeout(400_000);

  test('backfills orders without tripping a unique constraint', async ({ page }) => {
    const streamed: string[] = [];
    let httpStatus: number | null = null;

    page.on('response', async (res) => {
      if (!res.url().includes(IMPORT_ROUTE)) return;
      httpStatus = res.status();
      try {
        streamed.push(await res.text());
      } catch {
        // Stream aborted mid-read — the terminal-state poll below still decides.
      }
    });

    await page.goto('/dashboard');

    // The import entry point is the chrome split-button chevron ("Import orders"),
    // which opens a flat menu. "Import latest orders" fires channel sync.
    await page.getByRole('button', { name: /Import orders/i }).click();

    const importButton = page.getByRole('menuitem', { name: /Import latest orders/i });
    await expect(importButton).toBeVisible({ timeout: 20_000 });

    // Arm the wait BEFORE clicking, so a fast job cannot finish between the
    // click and the listener attaching.
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes(IMPORT_ROUTE),
      { timeout: 330_000 },
    );
    await importButton.click();

    const response = await responsePromise;
    httpStatus = response.status();

    // NDJSON: the body only resolves once the job closes the stream, so this
    // await IS the terminal signal — more reliable than watching button state,
    // which the popover may unmount on dismiss.
    const body = await response.text().catch(() => streamed.join('\n'));

    // The regression itself.
    expect(body).not.toMatch(/ux_sku_platform_ids_platform_sku/i);
    expect(body).not.toMatch(/ux_sku_platform_ids_platform_item/i);
    expect(body).not.toMatch(/duplicate key value violates unique constraint/i);

    // Any 5xx means the job threw rather than completing with a result summary.
    if (httpStatus !== null) expect(httpStatus).toBeLessThan(500);

    // The connector seam must carry per-row detail and the skip breakdown, not
    // just two counters. OrderSyncDialog renders `details`, so when this is
    // absent the panel goes blank no matter what the import did — and a fully
    // skipped sheet becomes indistinguishable from an up-to-date one.
    const payload = JSON.parse(body) as {
      details?: {
        inserted?: unknown[];
        skippedRows?: Array<{ sheetRow: number; orderId: string; reason: string }>;
        recoveredRows?: Array<{ sheetRow: number; orderId: string }>;
      };
      stats?: Record<string, number>;
    };
    expect(payload.details, 'SyncOutcome must carry details').toBeDefined();
    expect(payload.stats, 'SyncOutcome must carry stats').toBeDefined();
    expect(Array.isArray(payload.details?.inserted)).toBe(true);
    expect(payload.stats).toHaveProperty('skippedNoItemNumber');
    // The skipped rows themselves — a count alone is not actionable.
    expect(Array.isArray(payload.details?.skippedRows)).toBe(true);

    // Listing-title recovery must be reported, not silent: a row whose Item
    // Number the import INFERRED has to be auditable by the operator.
    expect(Array.isArray(payload.details?.recoveredRows)).toBe(true);
    expect(payload.stats).toHaveProperty('recoveredByTitle');

    // FBA inbound shipments are classified, never counted as a data-entry gap.
    expect(payload.stats).toHaveProperty('skippedFbaShipment');

    // The aggregate must equal the sum of every reason, and processed + skipped
    // must account for every row read. Adding `skippedFbaShipment` without
    // updating the hand-written sum silently under-reported the total by 4 on
    // the first live run — this is the assertion that would have caught it.
    const stats = payload.stats ?? {};
    const reasonTotal = Object.entries(stats)
      .filter(([k]) => k.startsWith('skipped') && k !== 'skippedRows')
      .reduce((sum, [, n]) => sum + n, 0);
    expect(stats.skippedRows, 'skippedRows must sum every reason').toBe(reasonTotal);
    expect(
      (stats.processedRows ?? 0) + (stats.skippedRows ?? 0),
      'every row read is either processed or skipped',
    ).toBe(stats.rowCount);

    // Every recovered row must carry the identity the panel renders, and must
    // NOT be double-reported as skipped — it imported.
    const skippedKeys = new Set((payload.details?.skippedRows ?? []).map((r) => r.sheetRow));
    for (const row of payload.details?.recoveredRows ?? []) {
      expect(row.orderId, 'a recovered row must name its order').toBeTruthy();
      expect(skippedKeys.has(row.sheetRow), 'recovered rows must not also be skipped').toBe(false);
    }

    // Surface the run's own summary in the report — this spec's value is the
    // live outcome, and a silent pass would hide a "0 rows, all skipped" run.
    // eslint-disable-next-line no-console
    console.log('[import stream tail]\n' + body.slice(-1200));
    // eslint-disable-next-line no-console
    console.log('[stats] ' + JSON.stringify(payload.stats));

    // The skip panel is the operator-facing payoff: expand it and prove the
    // dialog now names the dropped rows instead of claiming "already up to
    // date". NOT saved under test-results/ — Playwright deletes a passing
    // test's artifact dir, so a screenshot there vanishes exactly on success.
    const skipToggle = page.getByRole('button', { name: /rows? skipped/i });
    await expect(skipToggle).toBeVisible({ timeout: 15_000 });
    await skipToggle.click();
    await expect(page.getByText(/Missing Item Number/i).first()).toBeVisible();

    await page.waitForTimeout(800);
    await page.screenshot({ path: 'playwright-report/import-skip-panel.png' });

    // The sheet section claims Ecwid rows "come in through the Ecwid connector".
    // That claim must be checkable: switch to the child Ecwid Direct tab and
    // confirm the hand-off list (same stacked TabDisplay pattern as Claim).
    const ecwidSkipped = (payload.details?.skippedRows ?? []).filter((r) => r.reason === 'ecwid');
    if (ecwidSkipped.length > 0) {
      await page.getByRole('button', { name: /Ecwid Direct/i }).click({ timeout: 15_000 });
      await expect(
        // "belongs here" (1 row) / "belong here" (n) — match both.
        page.getByText(/belongs? here/i),
        'Ecwid tab must list the rows the sheet handed to it',
      ).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'playwright-report/ecwid-section-crossref.png' });
    }
  });
});
