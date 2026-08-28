import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * To-ship dense compound grid · mocked feed (Sheets UX).
 *
 * Deterministic, DB-independent: `/api/orders` and `/api/orders/queue-counts`
 * are route-mocked. Lifecycle Pending/Tested tab column swaps are retired —
 * identity lives in compound tracks; triage facets + KPI drive `?late` /
 * `?attention` / `?ustatus`.
 */

interface MockRow {
  id: number;
  order_id: string;
  [key: string]: unknown;
}

/** One synthetic fulfillment-scope row (labeled + tracked → stays on desk). */
function makeRow(i: number, overrides: Record<string, unknown> = {}): MockRow {
  const day = 20 + (i % 3); // fixed July 2026 days — deterministic banding
  const iso = `2026-07-${day}T18:00:00.000Z`;
  return {
    id: 910_000 + i,
    order_id: `90-9${1000 + i}-${20_000 + i}`,
    product_title: `E2E TanStack Row ${i}`,
    sku: `ETR-${i}`,
    item_number: '',
    condition: 'USED',
    quantity: '1',
    account_source: 'Goodwill', // non-FBA → survives isNonFbaRecord
    created_at: iso,
    deadline_at: iso,
    shipment_id: 720_000 + i,
    tracking_number: `9400111899223197${(100_000 + i).toString()}`,
    shipping_tracking_number: `9400111899223197${(100_000 + i).toString()}`,
    has_tech_scan: false,
    is_out_of_stock: false,
    notes: '',
    is_urgent: false,
    latest_status_category: 'UNKNOWN', // not shipped → stays in the queue
    ...overrides,
  };
}

/**
 * Fixture set (12 rows):
 *  - 3 TESTED singletons exercising the §9 field contract
 *      T1 scan-actor name + station activity stamp
 *      T2 assignee-only name + serial MIN stamp preferred over activity
 *      T3 no names/ids + sentinel/blank stamps → em-dash cells
 *  - 6 PENDING singletons (one carries a note, one an OOS would flip lane — so
 *    the note row stays PENDING; OOS lives on the BLOCKED row)
 *  - 1 BLOCKED (is_out_of_stock)
 *  - 1 multi-line order (two PENDING rows sharing one order_id) → house fold
 */
function fixtureRows(): MockRow[] {
  const rows: MockRow[] = [];
  rows.push(
    makeRow(0, {
      product_title: 'E2E TESTED Scan Actor',
      has_tech_scan: true,
      tested_by: 501,
      tested_by_name: 'Alex Chen',
      tester_name: 'Sam Assignee',
      test_activity_at: '2026-07-20 14:05:00',
      test_date_time: null,
    }),
    makeRow(1, {
      product_title: 'E2E TESTED Assignee Fallback',
      has_tech_scan: true,
      tested_by: null,
      tested_by_name: null,
      tester_name: 'Riley Ops',
      tester_id: 502,
      test_date_time: '2026-07-19 09:30:00',
      test_activity_at: '2026-07-20 11:00:00',
    }),
    makeRow(2, {
      product_title: 'E2E TESTED Missing Facts',
      has_tech_scan: true,
      tested_by: null,
      tested_by_name: null,
      tester_name: null,
      tester_id: null,
      test_date_time: '1', // legacy sentinel — must read as missing
      test_activity_at: '',
    }),
  );
  for (let i = 3; i < 9; i += 1) {
    rows.push(
      makeRow(i, {
        product_title: `E2E PENDING Row ${i}`,
        notes: i === 3 ? 'Check the power cable before packing' : '',
      }),
    );
  }
  rows.push(
    makeRow(9, {
      product_title: 'E2E BLOCKED Row',
      is_out_of_stock: true,
    }),
  );
  // Multi-line order — same order_id, different products, SAME day band.
  // List sheet renders flat leaves (no CollapsibleGroupRow summary).
  const foldDay = '2026-07-21T18:00:00.000Z';
  rows.push(
    makeRow(10, {
      order_id: '90-7777-88888', product_title: 'E2E Fold Line A', sku: 'FOLD-A',
      created_at: foldDay, deadline_at: foldDay,
    }),
    makeRow(11, {
      order_id: '90-7777-88888', product_title: 'E2E Fold Line B', sku: 'FOLD-B',
      created_at: foldDay, deadline_at: foldDay,
    }),
  );
  return rows;
}

/** Route-mock the orders list + queue counts so lanes/KPIs are deterministic. */
async function mockOrdersFeed(page: Page, rows: MockRow[]) {
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
  const tested = rows.filter((r) => r.has_tech_scan && !r.is_out_of_stock).length;
  const blocked = rows.filter((r) => r.is_out_of_stock).length;
  const pending = rows.length - tested - blocked;
  const mustShip = rows.filter((r) => {
    const d = String(r.deadline_at || '');
    return d.startsWith('2026-07-20') || d.startsWith('2026-07-21');
  }).length;
  const urgent = rows.filter((r) => r.is_urgent).length;
  await page.route(
    (url) => url.pathname === '/api/orders/queue-counts',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: rows.length,
          byStage: { all: rows.length, pending, tested },
          urgent,
          mustShip,
          combos: [
            { hasTechScan: true, blocked: false, count: tested },
            { hasTechScan: false, blocked: false, count: pending },
            { hasTechScan: false, blocked: true, count: blocked },
          ],
        }),
      });
    },
  );
}

const grid = (page: Page) => page.locator('[data-testid="pending-grid-body"]').first();
const headerRowIn = (root: Locator) => root.locator('[role="row"]:has([data-col="item"])').first();

const leftX = async (loc: Locator) => {
  const box = await loc.boundingBox();
  if (!box) throw new Error('no bounding box');
  return box.x;
};

test.describe('To-ship dense compound grid (mocked feed)', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  test('G2: dense compound tracks carry tester identity without flat Tester columns', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    const headerRow = headerRowIn(table);
    // Compound tracks — not flat ORDERS_QUEUE_COLUMNS.
    await expect(headerRow.locator('[data-col="item"]')).toHaveCount(1);
    await expect(headerRow.locator('[data-col="state"]')).toHaveCount(1);
    await expect(headerRow.locator('[data-col="fulfillment"]')).toHaveCount(1);
    await expect(headerRow.locator('[data-col="tester"]')).toHaveCount(0);
    await expect(headerRow.locator('[data-col="testedAt"]')).toHaveCount(0);
    await expect(headerRow.locator('[data-col="status"]')).toHaveCount(0);

    const t1 = table.locator('[data-order-row-id="910000"]');
    await expect(t1).toBeVisible();
    await expect(t1.locator('[data-col="item"]')).toContainText('Alex Chen');
    await expect(t1.locator('[data-col="item"]')).toContainText('E2E TESTED Scan Actor');

    await page.screenshot({ path: 'test-results/pending-grid-tested-lane.png', fullPage: false });
  });

  test('G1/G3/G4: All facet shows in-warehouse rows; OOS refine filters without column swap', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());

    await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });
    const table = grid(page);
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    const headerRow = headerRowIn(table);
    await expect(headerRow.locator('[data-col="item"]')).toHaveCount(1);
    await expect(headerRow.locator('[data-col="tester"]')).toHaveCount(0);
    // All in-warehouse labeled rows (tested + pending + blocked) — not Pending-hides-TESTED.
    await expect(table.locator('[data-order-row-id]')).toHaveCount(12);

    // G3 — OOS refine via URL (same as Band-1 Out of stock).
    await page.goto('/shipping/orders?ustatus=BLOCKED', { waitUntil: 'domcontentloaded' });
    await expect(table.locator('[data-order-row-id]')).toHaveCount(1, { timeout: 20_000 });

    // G4 — clearing restores All + compound columns unchanged.
    await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    const headerRow2 = headerRowIn(table);
    await expect(headerRow2.locator('[data-col="item"]')).toHaveCount(1);
    await expect(headerRow2.locator('[data-col="tester"]')).toHaveCount(0);

    await page.screenshot({ path: 'test-results/pending-grid-default-lane.png', fullPage: false });
  });

  test('G5/G9: KPI / facet filters stay on one dense list (Ready → ?ustatus=TESTED)', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    const readyTile = page.getByRole('button', { name: /ready to pack/i }).first();
    await expect(readyTile).toBeVisible({ timeout: 20_000 });

    await readyTile.click();
    await expect(page).toHaveURL(/ustatus=TESTED/);
    await expect(headerRowIn(table).locator('[data-col="item"]')).toHaveCount(1, { timeout: 10_000 });
    await expect(headerRowIn(table).locator('[data-col="tester"]')).toHaveCount(0);
    await expect(table.locator('[data-order-row-id]')).toHaveCount(3);

    const pendingTile = page
      .locator('[aria-label="Outbound attention"]')
      .getByRole('button', { name: /pending/i })
      .first();
    await pendingTile.click();
    // Pending KPI clears triage → All in-warehouse list again.
    await expect(headerRowIn(table).locator('[data-col="tester"]')).toHaveCount(0, { timeout: 10_000 });
    const allCount = await table.locator('[data-order-row-id]').count();
    expect(allCount, 'rows repaint after clearing Ready filter').toBe(12);

    await readyTile.click();
    await expect(page).toHaveURL(/ustatus=TESTED/);
    await expect(table.locator('[data-order-row-id]')).toHaveCount(3);

    await page.screenshot({ path: 'test-results/pending-grid-kpi-toggle.png', fullPage: false });
  });

  test('G10/D1: chrome sort dropdown drives ?sort= on the dense desk; day bands stay off', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    const headerRow = headerRowIn(table);
    await expect(headerRow.locator('[data-col="item"]')).toHaveCount(1);

    const sortSwitch = page.locator('[data-queue-sort-switch]');
    await expect(sortSwitch).toBeVisible();
    await sortSwitch.getByRole('button').first().click();
    await page.getByRole('option', { name: /^newest$/i }).click();
    await expect(page).toHaveURL(/sort=newest/);
    await expect(table.locator('[data-grid-day-band]')).toHaveCount(0);

    await page.screenshot({ path: 'test-results/pending-grid-tested-sort.png', fullPage: false });
  });
  test('C2/C3/D3: select gutter toggles, row click opens (selected), sort survives reload', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    // C3 probe: the row-open contract is the `open-shipped-details` event
    // (detail panel data is a live lookup our mocked ids can't serve).
    await page.addInitScript(() => {
      window.addEventListener('open-shipped-details', () => {
        (window as unknown as { __openedDetails?: boolean }).__openedDetails = true;
      });
    });
    await page.goto('/shipping/orders?sort=newest', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    const headerRow = headerRowIn(table);

    // D3 — deep-linked sort survives reload; compound item track still present.
    await expect(headerRow.locator('[data-col="item"]')).toHaveCount(1);
    await page.reload();
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    await expect(headerRowIn(table).locator('[data-col="item"]')).toHaveCount(1);
    await expect(page).toHaveURL(/sort=newest/);

    // C2 — the gutter checkbox toggles row selection without opening the record.
    const row = table.locator('[data-order-row-id="910003"]');
    const checkbox = row.getByRole('checkbox').first();
    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    await checkbox.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    // Select-all in the header arms/clears the whole visible set.
    const selectAll = headerRowIn(table).getByRole('checkbox', { name: /select all/i });
    await selectAll.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'true');
    await selectAll.click();
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');

    // C3 — clicking the row body (a non-editable cell) opens the record.
    await row.locator('[data-col="item"]').click();
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __openedDetails?: boolean }).__openedDetails === true,
          ),
        { timeout: 5_000, message: 'row click dispatches open-shipped-details' },
      )
      .toBe(true);
  });

  test('E1–E4: multi-line order renders two flat leaves on shared tracks (no summary fold)', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    await expect(table.locator('[data-grid-summary-row]')).toHaveCount(0);

    const lineA = table.locator('[data-order-row-id="910010"]');
    const lineB = table.locator('[data-order-row-id="910011"]');
    await expect(lineA).toBeVisible();
    await expect(lineB).toBeVisible();
    await expect(lineA).toContainText('E2E Fold Line A');
    await expect(lineB).toContainText('E2E Fold Line B');

    await expect(table.locator('[data-order-row-id="910003"]')).toHaveCount(1);

    const headerRow = headerRowIn(table);
    for (const col of ['fulfillment', 'item'] as const) {
      const headerX = await leftX(headerRow.locator(`[data-col="${col}"]`));
      const leafX = await leftX(lineA.locator(`[data-col="${col}"]`));
      expect(Math.abs(headerX - leafX), `leaf ${col} locks to the header track`).toBeLessThan(4);
    }

    await page.screenshot({ path: 'test-results/pending-grid-multi-line-flat.png', fullPage: false });
  });

  test('F2–F6 / H1–H2: flat qty/condition editor contracts retired with ORDERS_QUEUE_COLUMNS', async () => {
    // Dense compound To-ship has no qty / condition / force-hide tracks.
    test.skip(true, 'flat ORDERS_QUEUE_COLUMNS editor matrix superseded by compound Sheets UX');
  });

  test('I1/I2: virtual window stays bounded after Ready (?ustatus=TESTED) filter', async ({ page }) => {
    const many: MockRow[] = [];
    for (let i = 0; i < 400; i += 1) {
      many.push(
        makeRow(i, {
          product_title: `E2E Window Row ${i}`,
          sku: `WIN-${i}`,
          has_tech_scan: i % 4 === 0,
        }),
      );
    }
    await mockOrdersFeed(page, many);
    await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(600);

    const domRows = await table.locator('[data-order-row-id]').count();
    expect(domRows).toBeGreaterThan(0);
    expect(domRows, `windowed DOM (got ${domRows} of 400)`).toBeLessThan(150);

    const pageScroll = page.locator('[data-testid="dashboard-scroll"]');
    await pageScroll.evaluate((el) => el.scrollTo({ top: 4000 }));
    await page.waitForTimeout(400);
    const afterScroll = await table.locator('[data-order-row-id]').count();
    expect(afterScroll).toBeGreaterThan(0);
    expect(afterScroll).toBeLessThan(150);

    await page.goto('/shipping/orders?ustatus=TESTED', { waitUntil: 'domcontentloaded' });
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    await expect(headerRowIn(table).locator('[data-col="item"]')).toHaveCount(1);
    await expect(headerRowIn(table).locator('[data-col="tester"]')).toHaveCount(0);
    const testedRows = await table.locator('[data-order-row-id]').count();
    expect(testedRows).toBeGreaterThan(0);
    expect(testedRows).toBeLessThan(150);

    await page.screenshot({ path: 'test-results/pending-grid-windowed-tested.png', fullPage: false });
  });

  test('J1/J3: no foreign grid DOM; no drag-resize; lifecycle Packed tab gone', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    await expect(page.locator('.ag-root, [class*="MuiDataGrid"]')).toHaveCount(0);
    await expect(headerRowIn(table).locator('[aria-label^="Resize"]')).toHaveCount(0);
    await expect(table.locator('[data-order-row-id] .cursor-grab')).toHaveCount(0);

    const chrome = page.locator('[data-dashboard-chrome]').first();
    await expect(chrome.getByRole('button', { name: 'Packed', exact: true })).toHaveCount(0);
    await expect(headerRowIn(table).locator('[data-col="item"]')).toHaveCount(1);
    await expect(headerRowIn(table).locator('[data-col="tester"]')).toHaveCount(0);

    await page.screenshot({ path: 'test-results/pending-grid-packed-isolation.png', fullPage: false });
  });
});
