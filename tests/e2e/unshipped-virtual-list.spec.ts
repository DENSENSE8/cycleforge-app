import { test, expect } from '@playwright/test';

/**
 * Unshipped queue virtualization smoke — Pending grid (LedgerGrid).
 *
 * The Board|Grid switcher is retired: the To Ship queue is the single connected
 * spreadsheet (`OrdersGridView` / `LedgerGrid` + `VirtualGroupedSections`).
 * The grid card is bounded to the viewport remainder (`WORKBENCH_TABLE_VIEWPORT`,
 * matching Packed / Shipped / Labels), so it owns its OWN Y scroll port
 * (`pending-grid-scroll`) rather than windowing against the dashboard page
 * scroll. That bound is what makes windowing possible at all: an unbounded host
 * lets the scroll element grow to the full content height, and the virtualizer
 * then renders every row.
 *
 * This mocks `/api/orders` with 500 synthetic PENDING rows so the assertion is
 * DB-independent, then verifies only a windowed slice is in the DOM
 * (`data-index` nodes from the virtualizer), not all 500 — the regression guard
 * for the "unbounded host un-windows the list" failure mode.
 *
 * Auth comes from tests/.auth/admin.json (global-setup). Desktop-only — the
 * grid is a desktop layout; the mobile (webkit) project is skipped.
 */

const ROW_COUNT = 500;

/** 500 non-FBA, PENDING (tracked, in-stock), fulfillment-scope rows across 3
 *  fixed day bands. Unique order_id + sku so `dedupeByOrderProduct` keeps them
 *  all as singleton rows. Fixed dates (no Date.now) keep banding deterministic. */
function makeRows(n: number) {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const day = 20 + (i % 3);
    const at = `2026-07-${day}T18:00:00.000Z`;
    rows.push({
      id: 900_000 + i,
      order_id: `E2E-VLIST-${900_000 + i}`,
      product_title: `E2E Virtual Row ${i}`,
      sku: `EVL-${i}`,
      condition: 'USED',
      quantity: '1',
      account_source: 'Goodwill', // definitively non-FBA → survives isNonFbaRecord
      created_at: at,
      deadline_at: at,
      shipment_id: 700_000 + i,
      // Pending grid shows labeled+tracked rows only — no-tracking rows live on Labels.
      tracking_number: `94001118992231975${(10_000 + i).toString()}`,
      shipping_tracking_number: `94001118992231975${(10_000 + i).toString()}`,
      has_tech_scan: false, // → PENDING lane
      is_out_of_stock: false,
      latest_status_category: 'UNKNOWN', // not shipped → stays in the queue
    });
  }
  return rows;
}

/** Fulfil every /api/orders LIST call (table + sidebar count + warm-up) with the
 *  synthetic payload. Exact-pathname match so /api/orders/lookup/[id] (details)
 *  is untouched. */
async function mockOrders(page: import('@playwright/test').Page, rows: Record<string, unknown>[]) {
  await page.route(
    (url) => url.pathname === '/api/orders',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'x-cache': 'BYPASS' },
        body: JSON.stringify({ orders: rows, count: rows.length }),
      });
    },
  );
}

test.describe('Unshipped grid virtualization', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'grid is a desktop layout');

  test('500 mocked rows render windowed in the grid scroll port (DOM ≪ dataset)', async ({ page }) => {
    await mockOrders(page, makeRows(ROW_COUNT));
    await page.goto('/dashboard?unshipped', { waitUntil: 'domcontentloaded' });

    const grid = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(grid).toBeVisible({ timeout: 45_000 });

    // The virtualizer emits data-index nodes; wait for the first, then settle.
    await grid.locator('[data-index]').first().waitFor({ state: 'visible', timeout: 20_000 });
    await page.waitForTimeout(600);

    const domRows = await grid.locator('[data-order-row-id]').count();
    const dataIndexNodes = await grid.locator('[data-index]').count();

    // eslint-disable-next-line no-console
    console.log(`[unshipped-vlist grid] before-scroll: dataIndex=${dataIndexNodes} · domRows=${domRows} of ${ROW_COUNT}`);

    // Something rendered, and it's a windowed slice — NOT the full 500. This is
    // the environment-independent guard that catches an un-windowing regression.
    expect(dataIndexNodes).toBeGreaterThan(0);
    expect(domRows).toBeGreaterThan(0);
    expect(domRows).toBeLessThan(150);

    // Scroll the grid's own port and confirm the DOM stays windowed (rows
    // recycle rather than accumulate) and rows keep painting.
    const gridScroll = page.locator('[data-testid="pending-grid-scroll"]');
    await gridScroll.evaluate((el) => el.scrollTo({ top: 6000 }));
    await page.waitForTimeout(600);

    const domRowsAfter = await grid.locator('[data-order-row-id]').count();
    // eslint-disable-next-line no-console
    console.log(`[unshipped-vlist grid] after-scroll: domRows=${domRowsAfter} of ${ROW_COUNT}`);
    expect(domRowsAfter).toBeGreaterThan(0);
    expect(domRowsAfter).toBeLessThan(150);
  });
});
