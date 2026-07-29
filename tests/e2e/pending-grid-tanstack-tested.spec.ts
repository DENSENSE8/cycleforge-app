import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Pending grid · TanStack headless adoption + TESTED mode columns (plan Phase A).
 *
 * Deterministic, DB-independent: `/api/orders` and `/api/orders/queue-counts`
 * are route-mocked with synthetic fulfillment rows (the `unshipped-virtual-list`
 * precedent), so every `?ustatus` lane, the TESTED tester/tested-at cells, the
 * order-fold, KPI click-to-filter, and the in-cell editors are exercised against
 * known data. Matrix rows covered here (per the Phase A execution prompt):
 *   G1–G10 (``?tested` / Pending tab + TESTED column swap + mode toggles + sort)
 *   E1–E4  (house order-folds outside TanStack)
 *   F2–F6  (keyboard edit contract + condition listbox + corner indicators)
 *   H1–H2  (viewport force-hide collapse / restore)
 *   I1–I2  (virtual windowing + usability after mode toggle)
 *   J1–J3  (no foreign grid DOM, no day bands, no drag-resize revival)
 *   A8     (Packed tab does not leak TESTED columns)
 * The live-data shell/chrome regressions (A1–A7, B, C, D2–D3, F1) stay in
 * `to-ship-pending-grid.spec.ts` / `orders-queue-skin-scoping.spec.ts`.
 */

const TESTED_AT_RE = /^\d{2}\/\d{2}\/\d{4} (\d{1,2}:\d{2}:\d{2} (AM|PM)|\d{2}:\d{2}:\d{2})$/;

interface MockRow {
  id: number;
  order_id: string;
  [key: string]: unknown;
}

/** One synthetic fulfillment-scope row (labeled + tracked → stays on Pending). */
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
  // Multi-line order — same order_id, different products, SAME day band
  // (grouping folds within a band) → CollapsibleGroupRow.
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
  await page.route(
    (url) => url.pathname === '/api/orders/queue-counts',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: rows.length,
          byStage: { all: rows.length, pending, tested },
          urgent: 0,
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
const headerRowIn = (root: Locator) => root.locator('[role="row"]:has([data-col="title"])').first();

const leftX = async (loc: Locator) => {
  const box = await loc.boundingBox();
  if (!box) throw new Error('no bounding box');
  return box.x;
};

test.describe('Pending grid · TanStack + TESTED mode (mocked feed)', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  test('G2/G6/G7/G8: TESTED lane swaps to Tester + Tested-at columns with §9 cell contract', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    await page.goto('/dashboard?tested', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    // Only the 3 TESTED rows survive the lane filter (G2 filter honesty).
    await expect(table.locator('[data-order-row-id]')).toHaveCount(3);

    // Headers: Tester + Tested at present; Status demoted (G8).
    const headerRow = headerRowIn(table);
    await expect(headerRow.locator('[data-col="tester"]')).toHaveCount(1);
    await expect(headerRow.locator('[data-col="testedAt"]')).toHaveCount(1);
    await expect(headerRow.locator('[data-col="tester"]')).toContainText('Tester');
    await expect(headerRow.locator('[data-col="testedAt"]')).toContainText('Tested at');
    await expect(headerRow.locator('[data-col="status"]')).toHaveCount(0);

    // Header ↔ body track lock on the new columns (B2 geometry under TESTED).
    const t1 = table.locator('[data-order-row-id="910000"]');
    await expect(t1).toBeVisible();
    for (const col of ['tester', 'testedAt'] as const) {
      const headerX = await leftX(headerRow.locator(`[data-col="${col}"]`));
      const cellX = await leftX(t1.locator(`[data-col="${col}"]`));
      expect(Math.abs(headerX - cellX), `${col} header locks to its body cell`).toBeLessThan(4);
    }

    // G6 — scan actor beats assignee; assignee is the fallback.
    await expect(t1.locator('[data-col="tester"]')).toContainText('Alex Chen');
    const t2 = table.locator('[data-order-row-id="910001"]');
    await expect(t2.locator('[data-col="tester"]')).toContainText('Riley Ops');

    // G7 — formatDateTimePST shape (never raw ISO / never the '1' sentinel);
    // T2 prefers the serial MIN stamp (07/19) over station activity (07/20).
    const t1At = (await t1.locator('[data-col="testedAt"]').innerText()).trim();
    expect(t1At).toMatch(TESTED_AT_RE);
    expect(t1At.startsWith('07/20/2026'), `t1 tested-at is the activity stamp (got "${t1At}")`).toBe(true);
    const t2At = (await t2.locator('[data-col="testedAt"]').innerText()).trim();
    expect(t2At).toMatch(TESTED_AT_RE);
    expect(t2At.startsWith('07/19/2026'), `t2 prefers test_date_time (got "${t2At}")`).toBe(true);

    // T3 — truly missing facts render the house em dash, not '1' / blank.
    const t3 = table.locator('[data-order-row-id="910002"]');
    await expect(t3.locator('[data-col="tester"]')).toContainText('—');
    await expect(t3.locator('[data-col="testedAt"]')).toContainText('—');

    // Status pills demoted from rows too (G8).
    await expect(t1.locator('[data-col="status"]')).toHaveCount(0);

    await page.screenshot({ path: 'test-results/pending-grid-tested-lane.png', fullPage: false });
  });

  test('G1/G3/G4: Pending tab + Blocked refine keep default columns; Tested tab swaps', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());

    // G1 — Pending tab: non-TESTED rows; default column set (no Status / Tester).
    await page.goto('/dashboard?unshipped', { waitUntil: 'domcontentloaded' });
    const table = grid(page);
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    const headerRow = headerRowIn(table);
    await expect(headerRow.locator('[data-col="status"]')).toHaveCount(0);
    await expect(headerRow.locator('[data-col="platform"]')).toHaveCount(0);
    await expect(headerRow.locator('[data-col="tester"]')).toHaveCount(0);
    await expect(headerRow.locator('[data-col="testedAt"]')).toHaveCount(0);
    // Pending + Blocked only (3 tested rows excluded).
    await expect(table.locator('[data-order-row-id]')).toHaveCount(9);

    // G3 — BLOCKED refine on Pending renders OOS rows without crashing.
    await page.goto('/dashboard?unshipped&ustatus=BLOCKED', { waitUntil: 'domcontentloaded' });
    await expect(table.locator('[data-order-row-id]')).toHaveCount(1, { timeout: 20_000 });

    // G4 — clearing Blocked restores the Pending tab default column set.
    await page.goto('/dashboard?unshipped', { waitUntil: 'domcontentloaded' });
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    const headerRow2 = headerRowIn(table);
    await expect(headerRow2.locator('[data-col="status"]')).toHaveCount(0);
    await expect(headerRow2.locator('[data-col="tester"]')).toHaveCount(0);

    await page.screenshot({ path: 'test-results/pending-grid-default-lane.png', fullPage: false });
  });

  test('G5/G9: KPI tiles drive Tested/Pending tabs and columns swap live without freezing', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    await page.goto('/dashboard?unshipped', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    // Mocked counts make the tiles deterministic: tested=3 → "Ready to pack".
    const readyTile = page.getByRole('button', { name: /ready to pack/i }).first();
    await expect(readyTile).toBeVisible({ timeout: 20_000 });

    // G5 — KPI click switches to Tested tab AND swaps the column set.
    await readyTile.click();
    await expect(page).toHaveURL(/[?&]tested(=|&|$)/);
    await expect(headerRowIn(table).locator('[data-col="tester"]')).toHaveCount(1, { timeout: 10_000 });
    await expect(table.locator('[data-order-row-id]')).toHaveCount(3);

    // G9 — Tested → Pending → Tested; headers + rows must repaint every time.
    const pendingTile = page
      .locator('[aria-label="Outbound attention"]')
      .getByRole('button', { name: /pending/i })
      .first();
    await pendingTile.click();
    await expect(page).toHaveURL(/[?&]unshipped(=|&|$)/);
    await expect(headerRowIn(table).locator('[data-col="tester"]')).toHaveCount(0, { timeout: 10_000 });
    await expect(headerRowIn(table).locator('[data-col="status"]')).toHaveCount(0);
    const pendingCount = await table.locator('[data-order-row-id]').count();
    expect(pendingCount, 'pending rows repaint after toggle').toBe(9);

    await readyTile.click();
    await expect(page).toHaveURL(/[?&]tested(=|&|$)/);
    await expect(headerRowIn(table).locator('[data-col="tester"]')).toHaveCount(1, { timeout: 10_000 });
    await expect(table.locator('[data-order-row-id]')).toHaveCount(3);

    await page.screenshot({ path: 'test-results/pending-grid-kpi-toggle.png', fullPage: false });
  });

  test('G10/D1: sort works under the TESTED column set; chrome dropdown drives ?sort=', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    await page.goto('/dashboard?tested', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    const headerRow = headerRowIn(table);

    // Column-header sort under the TESTED set (title A–Z → ?sort=title).
    await headerRow.locator('[data-col="title"]').click();
    await expect(page).toHaveURL(/sort=title/);
    await expect(headerRow.locator('[data-col="title"]')).toHaveAttribute('aria-sort', 'ascending');
    const firstTitleAsc = await table
      .locator('[data-order-row-id]')
      .first()
      .locator('[data-col="title"]')
      .innerText();
    expect(firstTitleAsc).toContain('E2E TESTED Assignee Fallback'); // A before M/S

    // Flip to Z–A via the same header (TanStack asc↔desc cycle, no removal).
    await headerRow.locator('[data-col="title"]').click();
    await expect(page).toHaveURL(/dir=desc/);
    await expect(headerRow.locator('[data-col="title"]')).toHaveAttribute('aria-sort', 'descending');

    // Tester / Tested-at headers are OUTSIDE the ?sort vocabulary — no aria-sort.
    await expect(headerRow.locator('[data-col="tester"]')).not.toHaveAttribute('aria-sort', /.*/);

    // D1 — chrome dropdown still drives composites; day bands stay off (D4/J2).
    const sortSwitch = page.locator('[data-queue-sort-switch]');
    await expect(sortSwitch).toBeVisible();
    await sortSwitch.getByRole('button').first().click();
    // Options render the SHORT label ("Newest"), not the long menu label.
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
    await page.goto('/dashboard?unshipped&sort=title&dir=desc', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    const headerRow = headerRowIn(table);

    // D3 — a deep-linked column sort is live on first paint, and survives reload.
    await expect(headerRow.locator('[data-col="title"]')).toHaveAttribute('aria-sort', 'descending');
    await page.reload();
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    await expect(headerRowIn(table).locator('[data-col="title"]')).toHaveAttribute(
      'aria-sort',
      'descending',
    );

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
    await row.locator('[data-col="title"]').click();
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

  test('E1–E4: multi-line order folds under one summary; expand reveals children on shared tracks', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    await page.goto('/dashboard?unshipped', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    // E2 — the shared-order fold renders ONE summary row (not two leaf rows).
    const summary = table.locator('[data-grid-summary-row]');
    await expect(summary).toHaveCount(1);
    await expect(summary).toContainText('Order 90-7777-88888');
    await expect(table.locator('[data-order-row-id="910010"]')).toHaveCount(0);

    // E1 — singleton orders are plain rows (no summary chrome).
    await expect(table.locator('[data-order-row-id="910003"]')).toHaveCount(1);

    // E4 — the summary's cells ride the same tracks as leaf rows + header.
    const headerRow = headerRowIn(table);
    for (const col of ['order', 'qty'] as const) {
      const headerX = await leftX(headerRow.locator(`[data-col="${col}"]`));
      const summaryX = await leftX(summary.locator(`[data-col="${col}"]`));
      expect(Math.abs(headerX - summaryX), `fold summary ${col} locks to the header track`).toBeLessThan(4);
    }

    // E3 — expanding reveals both child rows; collapse hides them again.
    // The disclosure header is the summary's `role=button` wrapper — clicking a
    // neutral summary cell (title) bubbles to it (chips stopPropagation).
    const summaryTitle = summary.locator('[data-col="title"]');
    await summaryTitle.click();
    await expect(table.locator('[data-order-row-id="910010"]')).toBeVisible();
    await expect(table.locator('[data-order-row-id="910011"]')).toBeVisible();
    await page.screenshot({ path: 'test-results/pending-grid-fold-expanded.png', fullPage: false });
    await summaryTitle.click();
    await expect(table.locator('[data-order-row-id="910010"]')).toHaveCount(0);
  });

  test('F2–F4: keyboard edit contract (F2 opens · Esc reverts · Tab commits through assign)', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    // Deterministic commit: capture the assign POST and fulfill it locally so
    // the mocked row ids never hit the real DB.
    const assignPayloads: Array<Record<string, unknown>> = [];
    await page.route(
      (url) => url.pathname === '/api/orders/assign',
      async (route) => {
        assignPayloads.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      },
    );
    await page.goto('/dashboard?unshipped&ustatus=PENDING', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    const row = table.locator('[data-order-row-id="910003"]');
    await expect(row).toBeVisible({ timeout: 20_000 });

    // F2 — the F2 key on a focused editable cell starts the edit.
    const qtyCell = row.locator('[data-col="qty"]');
    await qtyCell.focus();
    await page.keyboard.press('F2');
    const editor = qtyCell.locator('input');
    await expect(editor).toBeVisible();
    await expect(editor).toBeFocused();

    // F3 — Esc cancels the draft without a request.
    await editor.fill('7');
    await editor.press('Escape');
    await expect(qtyCell.locator('input')).toHaveCount(0);
    await expect(qtyCell).toContainText('1');
    expect(assignPayloads.length, 'Esc never commits').toBe(0);

    // F4 — Tab commits the draft through the assign waist.
    await qtyCell.click();
    await qtyCell.locator('input').fill('3');
    await qtyCell.locator('input').press('Tab');
    await expect.poll(() => assignPayloads.length, { timeout: 5_000 }).toBe(1);
    expect(assignPayloads[0]).toMatchObject({ orderId: 910_003, quantity: '3' });
    await expect(qtyCell).toContainText('3');
  });

  test('F5/F6: condition pill opens the grade listbox; note + OOS corner indicators open editors', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    const assignPayloads: Array<Record<string, unknown>> = [];
    await page.route(
      (url) => url.pathname === '/api/orders/assign',
      async (route) => {
        assignPayloads.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      },
    );
    await page.goto('/dashboard?unshipped', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    // F5 — condition pill is a listbox trigger; picking a grade commits it.
    const condTrigger = table
      .locator('[data-order-row-id="910004"] [data-col="condition"] button[aria-haspopup="listbox"]');
    await expect(condTrigger).toBeVisible();
    await condTrigger.click();
    const newOption = page.getByRole('option', { name: /new/i }).first();
    await expect(newOption).toBeVisible();
    await newOption.click();
    await expect.poll(() => assignPayloads.length, { timeout: 5_000 }).toBeGreaterThan(0);
    expect(assignPayloads[0].orderId).toBe(910_004);
    expect(assignPayloads[0]).toHaveProperty('condition');

    // F6 — note corner indicator on the fixture row opens the Notes editor…
    const noteRow = table.locator('[data-order-row-id="910003"]');
    const noteIndicator = noteRow.locator('[data-indicator="note"]');
    await expect(noteIndicator).toBeVisible();
    await noteIndicator.click();
    await expect(page.getByRole('textbox', { name: /note/i }).or(page.locator('textarea'))).toBeVisible();
    await page.keyboard.press('Escape');

    // …and the OOS corner indicator lives on the BLOCKED fixture row.
    await page.goto('/dashboard?unshipped&ustatus=BLOCKED', { waitUntil: 'domcontentloaded' });
    const oosRow = table.locator('[data-order-row-id="910009"]');
    await expect(oosRow).toBeVisible({ timeout: 20_000 });
    await expect(oosRow.locator('[data-indicator="oos"]')).toBeVisible();
  });

  test('H1/H2: tight scrollport force-hides Qty → Cond and widening restores them', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    await page.goto('/dashboard?unshipped', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    const headerRow = headerRowIn(table);
    await expect(headerRow.locator('[data-col="qty"]')).toHaveCount(1);

    // Tighten until the grid's own scrollport crosses the collapse breakpoints.
    await page.setViewportSize({ width: 600, height: 900 });
    await expect
      .poll(
        async () => headerRow.locator('[data-col="qty"]').count(),
        { timeout: 10_000, message: 'Qty force-hides on a tight scrollport' },
      )
      .toBe(0);
    // The priority ladder never touches Ship by / Order / Tracking / Product —
    // `sla` in particular carries BOTH the deadline and the lateness now, so
    // collapsing it would blind the dispatch queue on a small screen.
    await expect(headerRow.locator('[data-col="sla"]')).toHaveCount(1);
    await expect(headerRow.locator('[data-col="tracking"]')).toHaveCount(1);
    await expect(headerRow.locator('[data-col="title"]')).toHaveCount(1);

    // H2 — widening restores the collapsed columns without a reload.
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect
      .poll(
        async () => headerRow.locator('[data-col="qty"]').count(),
        { timeout: 10_000, message: 'widening restores the Qty column' },
      )
      .toBe(1);
    await expect(headerRow.locator('[data-col="sla"]')).toHaveCount(1);
    await expect(headerRow.locator('[data-col="condition"]')).toHaveCount(1);
  });

  test('I1/I2: 400-row feed stays windowed; grid stays usable after a lane toggle', async ({ page }) => {
    const many: MockRow[] = [];
    for (let i = 0; i < 400; i += 1) {
      many.push(
        makeRow(i, {
          product_title: `E2E Window Row ${i}`,
          sku: `WIN-${i}`,
          has_tech_scan: i % 4 === 0, // a quarter TESTED so both lanes are big
        }),
      );
    }
    await mockOrdersFeed(page, many);
    await page.goto('/dashboard?unshipped', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(600);

    // I1 — DOM stays a windowed slice, never one node per row.
    const domRows = await table.locator('[data-order-row-id]').count();
    expect(domRows).toBeGreaterThan(0);
    expect(domRows, `windowed DOM (got ${domRows} of 400)`).toBeLessThan(150);

    // Scroll deep, then toggle the TESTED lane — the grid must stay usable
    // (sticky header present, rows painted; no blank/zero-height body).
    const pageScroll = page.locator('[data-testid="dashboard-scroll"]');
    await pageScroll.evaluate((el) => el.scrollTo({ top: 4000 }));
    await page.waitForTimeout(400);
    const afterScroll = await table.locator('[data-order-row-id]').count();
    expect(afterScroll).toBeGreaterThan(0);
    expect(afterScroll).toBeLessThan(150);

    await page.goto('/dashboard?tested', { waitUntil: 'domcontentloaded' });
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    await expect(headerRowIn(table).locator('[data-col="tester"]')).toHaveCount(1);
    const testedRows = await table.locator('[data-order-row-id]').count();
    expect(testedRows).toBeGreaterThan(0);
    expect(testedRows).toBeLessThan(150);

    await page.screenshot({ path: 'test-results/pending-grid-windowed-tested.png', fullPage: false });
  });

  test('J1/J3 + A8: no foreign grid DOM, no drag-resize handles; Packed never leaks TESTED columns', async ({ page }) => {
    await mockOrdersFeed(page, fixtureRows());
    await page.goto('/dashboard?tested', { waitUntil: 'domcontentloaded' });

    const table = grid(page);
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    // J1 — headless adoption must not smuggle a foreign UI grid into the DOM.
    await expect(page.locator('.ag-root, [class*="MuiDataGrid"]')).toHaveCount(0);
    // J3 — drag-resize stays retired on Pending headers.
    await expect(headerRowIn(table).locator('[aria-label^="Resize"]')).toHaveCount(0);
    // Grid skin: body rows never carry a drag grip (C4 guard under TESTED).
    await expect(table.locator('[data-order-row-id] .cursor-grab')).toHaveCount(0);

    // A8 — Packed tab (queueMode staged) keeps the default column set even with
    // ?tested= still in the URL.
    const packedTab = page.getByRole('button', { name: 'Packed', exact: true });
    await expect(packedTab).toBeVisible({ timeout: 20_000 });
    await packedTab.click();
    const packed = page.locator('[data-testid="packed-grid-body"]').first();
    await expect(packed).toBeVisible({ timeout: 20_000 });
    const packedHeader = headerRowIn(packed);
    await expect(packedHeader.locator('[data-col="title"]')).toHaveCount(1, { timeout: 20_000 });
    await expect(packedHeader.locator('[data-col="tester"]')).toHaveCount(0);
    await expect(packedHeader.locator('[data-col="testedAt"]')).toHaveCount(0);

    await page.screenshot({ path: 'test-results/pending-grid-packed-isolation.png', fullPage: false });
  });
});
