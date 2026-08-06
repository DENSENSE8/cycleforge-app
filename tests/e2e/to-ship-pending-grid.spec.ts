import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  ORDERS_QUEUE_COLUMNS,
  type OrdersQueueColumnKey,
} from '@/lib/dashboard-order-row-layout';

/**
 * To Ship · Pending → connected ledger grid (grid-only; Board|Grid retired).
 *
 * Asserts against the live Pending spreadsheet (`pending-grid-body` / LedgerGrid):
 *   (1) sticky column header with a label per track;
 *   (2) drag grip only in the header (grid skin: no grip — select-all only);
 *   (3) order / tracking lock under their headers;
 *   (4) frozen identity pane on h-scroll;
 *   (5) Sheets-style in-cell edit (qty) commits through the assign waist.
 */

test.describe('To Ship · Pending Sheets-like grid', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  const leftX = async (loc: Locator) => {
    const box = await loc.boundingBox();
    if (!box) throw new Error('no bounding box');
    return box.x;
  };

  /** Header cells for the canonical assertions. */
  const headerRowIn = (table: Locator) =>
    table.locator('[role="row"]:has([data-col="title"])').first();

  /**
   * Clear this staffer's persisted column widths so resize tests start clean.
   * (Column order is pinned to the layout SoT — no staff reorder prefs.)
   */
  const resetColumnPrefs = async (page: Page) => {
    await page.evaluate(async () => {
      const cur = await fetch('/api/staff-preferences').then((r) => (r.ok ? r.json() : null));
      const tableColumns = { ...(cur?.prefs?.tableColumns ?? {}) };
      tableColumns.orders = { ...(tableColumns.orders ?? {}), order: [] };
      await fetch('/api/staff-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableColumns }),
      });
    });
  };

  test.beforeEach(async ({ page }) => {
    // Any same-origin page will do; the grid routes mount after this.
    await page.goto('/dashboard?unshipped');
    await resetColumnPrefs(page);
  });

  test('every fact owns its own locked column', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });

    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const headerRow = headerRowIn(table);
    await expect(headerRow).toBeVisible();
    /**
     * Adaptive headers: label when the track fits, else glyph + sr-only (no A…).
     *
     * Names come from the layout SoT (`ORDERS_QUEUE_COLUMNS`) rather than
     * re-typed literals — the previous copies drifted the moment a column was
     * renamed (`date`/`age` → `age`) or given a short `gridLabel` (`Tracking` →
     * `Track`), and the stale locators just resolved to zero elements.
     */
    const expectHeader = async (col: OrdersQueueColumnKey) => {
      const model = ORDERS_QUEUE_COLUMNS.find((c) => c.key === col);
      if (!model?.label) throw new Error(`no labelled column model for ${col}`);
      const cell = headerRow.locator(`[data-col="${col}"]`);
      await expect(cell).toHaveCount(1);
      await expect(cell.locator('svg')).toHaveCount(1);
      const sr = cell.locator('.sr-only');
      if ((await sr.count()) > 0) {
        await expect(sr.first()).toHaveText(model.label);
      } else {
        await expect(cell).toContainText(model.gridLabel ?? model.label);
      }
    };
    await expectHeader('title');
    // `age` is Late days — fused `sla` / civil `date` tracks were retired.
    await expectHeader('age');
    await expectHeader('order');
    await expectHeader('tracking');

    // Grid skin: no drag grip on rows; header may omit grip (select-all only).
    await expect(row.locator('.cursor-grab')).toHaveCount(0);

    // Flat Late column — no floating day-band chrome; Status/Platform retired
    // (lifecycle tabs own Pending vs Tested); no retired notes / stock columns.
    await expect(table.locator('[data-grid-day-band]')).toHaveCount(0);
    await expect(row.locator('[data-col="status"]')).toHaveCount(0);
    await expect(row.locator('[data-col="platform"]')).toHaveCount(0);
    await expect(row.locator('[data-col="notes"]')).toHaveCount(0);
    await expect(row.locator('[data-col="stock"]')).toHaveCount(0);
    await expect(row.locator('[data-col="age"]')).toHaveCount(1);
    // The retired tracks must stay gone, not silently return under old names.
    await expect(row.locator('[data-col="date"]')).toHaveCount(0);
    await expect(row.locator('[data-col="sla"]')).toHaveCount(0);
    // No empty-tracking rows on Pending (filtered client-side).
    await expect(row.locator('[data-add-label]')).toHaveCount(0);
    const ageHeader = headerRow.locator('[data-col="age"]');
    const qtyHeader = headerRow.locator('[data-col="qty"]');
    await expect(ageHeader).toHaveCount(1);
    expect(Math.abs((await leftX(ageHeader)) - (await leftX(row.locator('[data-col="age"]'))))).toBeLessThan(4);
    expect((await leftX(qtyHeader)) > (await leftX(ageHeader)), 'Qty header sits right of Late').toBe(true);

    for (const col of ['order', 'tracking'] as const) {
      const cell = row.locator(`[data-col="${col}"]`);
      await expect(cell).toHaveCount(1);
      const headerCell = headerRow.locator(`[data-col="${col}"]`);
      await expect(headerCell).toHaveCount(1);
      const headerX = await leftX(headerCell);
      const cellX = await leftX(cell);
      expect(Math.abs(headerX - cellX), `${col} header cell locks to its body cell`).toBeLessThan(4);
    }

    await page.screenshot({ path: 'test-results/to-ship-pending-grid.png', fullPage: false });
  });

  test('select gutter paints real checkboxes; condition is a vertically centered chip', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const headerRow = headerRowIn(table);
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Top-left select-all + every leftmost row cell — always-painted square.
    const headerCheck = headerRow.locator('[role="checkbox"][data-select-chrome="always"]');
    await expect(headerCheck).toBeVisible();
    const rowCheck = row.locator('[data-select-gutter] [role="checkbox"][data-select-chrome="always"]');
    await expect(rowCheck).toBeVisible();

    // Condition micro-tag on Product: house status chip (dot + uppercase label).
    const titleCell = row.locator('[data-col="title"]');
    const conditionChip = titleCell.locator('.inset-chip').first();
    const chipCount = await titleCell.locator('.inset-chip').count();
    if (chipCount > 0) {
      await expect(conditionChip).toBeVisible();
      await expect(conditionChip.locator('.rounded-full')).toHaveCount(1);
      const titleBox = await titleCell.boundingBox();
      const chipBox = await conditionChip.boundingBox();
      if (titleBox && chipBox) {
        const titleMid = titleBox.y + titleBox.height / 2;
        const chipMid = chipBox.y + chipBox.height / 2;
        expect(
          Math.abs(titleMid - chipMid),
          'condition chip shares the Product cell vertical midline',
        ).toBeLessThan(6);
      }
    }

    await page.screenshot({ path: 'test-results/to-ship-pending-grid-chips-checks.png', fullPage: false });
  });

  test('renders as a gridlined spreadsheet — cells carry column rules, last column does not', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const borderRight = (loc: Locator) =>
      loc.evaluate((el) => parseFloat(getComputedStyle(el).borderRightWidth) || 0);

    const age = row.locator('[data-col="age"]');
    await expect(age).toHaveCount(1);
    expect(await borderRight(age), 'Late cell has a vertical column rule').toBeGreaterThan(0);

    const tracking = row.locator('[data-col="tracking"]');
    await expect(tracking).toHaveCount(1);
    expect(await borderRight(tracking), 'last (tracking) column has no trailing rule').toBe(0);

    const headerRow = headerRowIn(table);
    const columnHeaders = headerRow.locator('[role="columnheader"]');
    expect(await columnHeaders.count(), 'header cells expose role="columnheader"').toBeGreaterThanOrEqual(6);

    await page.screenshot({ path: 'test-results/to-ship-pending-grid-lines.png', fullPage: false });
  });

  test('typed column headers show glyph; label or sr-only (never truncated A…)', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const headerRow = headerRowIn(table);
    await expect(headerRow).toBeVisible();

    // Typed headers on live tracks. Cond retired as a column — do not assert it.
    for (const col of ['title', 'age', 'qty', 'order'] as const) {
      const cell = headerRow.locator(`[data-col="${col}"]`);
      await expect(cell.locator('svg')).toHaveCount(1);
      // Visible short label OR sr-only full label — never a clipped "A…" alone.
      const text = ((await cell.innerText()) || '').replace(/\s+/g, ' ').trim();
      expect(text.includes('…') || text.endsWith('...'), `${col} must not truncate`).toBe(false);
      const accessible = (await cell.locator('.sr-only').count()) > 0
        ? await cell.locator('.sr-only').first().textContent()
        : text;
      expect(accessible?.length ?? 0, `${col} has an accessible name`).toBeGreaterThan(0);
    }

    // Chrome sort dropdown for Priority | Newest | Deadline + column sorts
    // (trailing, left of Import). Header click syncs the same `?sort=` SoT.
    await expect(page.locator('[data-queue-sort-switch]')).toBeVisible();

    await page.screenshot({ path: 'test-results/to-ship-pending-grid-typed-headers.png', fullPage: false });
  });

  test('click Product header sorts A–Z then Z–A via ?sort=title&dir=', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const headerRow = headerRowIn(table);
    const titleHeader = headerRow.locator('[data-col="title"]');
    await expect(titleHeader).toBeVisible();

    await titleHeader.click();
    await expect(page).toHaveURL(/sort=title/);
    await expect(titleHeader).toHaveAttribute('aria-sort', 'ascending');

    await titleHeader.click();
    await expect(page).toHaveURL(/sort=title/);
    await expect(page).toHaveURL(/dir=desc/);
    await expect(titleHeader).toHaveAttribute('aria-sort', 'descending');

    // Dropdown trigger mirrors the active column sort short label.
    await expect(page.locator('[data-queue-sort-switch]')).toContainText('Product');
  });

  test('frozen identity pane pins on horizontal scroll', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const grid = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    const row = grid.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const titleCell = row.locator('[data-frozen-edge]').first();
    await expect(titleCell).toHaveCount(1);
    const position = await titleCell.evaluate((el) => getComputedStyle(el).position);
    expect(position, 'frozen title cell is sticky').toBe('sticky');

    // Scroll the inner LedgerGrid surface (shell wrapper owns the testid).
    const canScroll = await page.locator('[data-testid="pending-grid-scroll"]').evaluate((el) => el.scrollWidth - el.clientWidth);
    if (canScroll > 40) {
      const trackingCell = row.locator('[data-col="tracking"]').first();
      const titleX0 = (await titleCell.boundingBox())!.x;
      const trkX0 = (await trackingCell.boundingBox())!.x;
      await page.locator('[data-testid="pending-grid-scroll"]').evaluate((el) => {
        el.scrollLeft = Math.min(300, el.scrollWidth - el.clientWidth);
      });
      await page.waitForTimeout(150);
      const titleX1 = (await titleCell.boundingBox())!.x;
      const trkX1 = (await trackingCell.boundingBox())!.x;
      expect(Math.abs(titleX1 - titleX0), 'frozen title stays pinned on h-scroll').toBeLessThan(3);
      expect(trkX0 - trkX1, 'fact columns scroll left under the frozen pane').toBeGreaterThan(20);
    }

    await page.screenshot({ path: 'test-results/to-ship-pending-grid-view.png', fullPage: false });
  });

  test('qty edits in-cell (Sheets contract) and commits through assign', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const grid = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    const row = grid.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const qtyCell = row.locator('[data-col="qty"]');
    const before = (await qtyCell.innerText()).trim();

    // Click → in-cell editor opens with the value; Esc reverts without saving.
    await qtyCell.click();
    const editor = qtyCell.locator('input');
    await expect(editor).toBeVisible();
    await expect(editor).toBeFocused();
    await editor.press('Escape');
    await expect(editor).toHaveCount(0);
    expect((await qtyCell.innerText()).trim(), 'Esc reverts the draft').toBe(before);

    // Click → type a new value → Enter commits (optimistic patch, no remount).
    // A no-change draft never POSTs, so the target must DIFFER from `before`
    // even when a previously-failed run left its value behind.
    const next = before === '3' ? '4' : '3';
    const assign = page.waitForResponse((r) => r.url().includes('/api/orders/assign') && r.request().method() === 'POST');
    await qtyCell.click();
    await qtyCell.locator('input').fill(next);
    await qtyCell.locator('input').press('Enter');
    const res = await assign;
    expect(res.ok(), 'assign commit succeeded').toBe(true);
    await expect(qtyCell).toContainText(next);

    // Restore the original quantity (leave dogfood data as found) — always a
    // real change (`next` ≠ `before`), so the POST always fires.
    const restore = page.waitForResponse((r) => r.url().includes('/api/orders/assign') && r.request().method() === 'POST');
    await qtyCell.click();
    await qtyCell.locator('input').fill(before || '1');
    await qtyCell.locator('input').press('Enter');
    await restore;
    await expect(qtyCell).toContainText(before || '1');
  });

  test('lifecycle tabs render; the bounded host keeps the KPI pinned and the card fully on screen', async ({
    page,
  }) => {
    /**
     * Sheets flush chrome (2026-08-04): tabs + KPI share one pinned
     * `WORKBENCH_SHEET_CHROME` stack (Unbox recipe). The grid owns Y scroll
     * via `WORKBENCH_TABLE_VIEWPORT` so row COUNT never grows the page. KPI
     * is not a body island — it is chrome, so page scroll cannot carry it away.
     */
    await page.goto('/dashboard?unshipped');

    const chrome = page.locator('[data-dashboard-chrome]').first();
    const pageScroll = page.locator('[data-testid="dashboard-scroll"]').first();
    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Pending · Tested · Packed · Shipped — Status column retired in favor of tabs.
    // Scoped to the chrome band: the KPI strip also exposes a "Pending <n>"
    // drill button, so an unscoped name match is a strict-mode violation.
    const lifecycleTabs = chrome.getByRole('button');
    await expect(lifecycleTabs.filter({ hasText: /^Pending/ }).first()).toBeVisible();
    await expect(lifecycleTabs.filter({ hasText: /^Tested/ }).first()).toBeVisible();
    await expect(lifecycleTabs.filter({ hasText: /^Packed/ }).first()).toBeVisible();
    await expect(lifecycleTabs.filter({ hasText: /^Shipped/ }).first()).toBeVisible();
    await expect(row.locator('[data-col="status"]')).toHaveCount(0);

    const kpi = chrome.locator('[aria-label="Outbound attention"]').first();
    await expect(kpi).toBeVisible();

    // (1) The grid owns Y scroll — its own scrollport, not the page's.
    const gridScroll = page.locator('[data-testid="pending-grid-scroll"]').first();
    await expect(gridScroll).toBeVisible();
    expect(
      await gridScroll.evaluate((el) => getComputedStyle(el).overflowY),
      'the grid scrollport scrolls itself',
    ).toMatch(/auto|scroll/);

    // (2) The page body barely moves — the bounded host means row COUNT never
    // grows the page. Anything more than a gutter's worth of slack here means
    // the host lost its height cap and the card is growing past the fold again.
    const pageSlack = await pageScroll.evaluate((el) => el.scrollHeight - el.clientHeight);
    expect(pageSlack, 'the bounded host keeps the page from growing').toBeLessThan(120);

    // (3) KPI is pinned chrome (Sheets flush) — inside the chrome stack, and
    // page scroll cannot move it. Seat: kpi is a descendant of data-dashboard-chrome.
    const kpiTopBefore = (await kpi.boundingBox())?.y ?? 0;
    await pageScroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(200);

    const chromeBox = await chrome.boundingBox();
    const kpiBox = await kpi.boundingBox();
    expect(chromeBox && kpiBox, 'chrome + KPI measurable after scroll').toBeTruthy();
    await expect(kpi).toBeVisible();
    if (chromeBox && kpiBox) {
      expect(
        Math.abs(kpiTopBefore - kpiBox.y),
        'KPI is pinned chrome — page scroll does not move it',
      ).toBeLessThanOrEqual(2);
      expect(
        kpiBox.y,
        'KPI sits inside the chrome stack (not a body island below it)',
      ).toBeGreaterThanOrEqual(chromeBox.y - 1);
      expect(
        kpiBox.y + kpiBox.height,
        'KPI bottom stays within the chrome stack',
      ).toBeLessThanOrEqual(chromeBox.y + chromeBox.height + 1);
    }

    // (4) The depth contract: all four edges of the sheet/card are on screen.
    // The bottom edge is the one a growing host loses first.
    const cardBox = await table.boundingBox();
    const viewportHeight = page.viewportSize()?.height ?? 0;
    expect(cardBox, 'card measurable').toBeTruthy();
    if (cardBox) {
      expect(cardBox.y, 'card top edge on screen').toBeGreaterThanOrEqual(0);
      expect(
        cardBox.y + cardBox.height,
        'card bottom edge on screen (the elevation that sells the card)',
      ).toBeLessThanOrEqual(viewportHeight);
    }

    // (5) The column header is sticky INSIDE the grid's own port — that is what
    // keeps it visible while the operator scrolls rows, now that the page does
    // not scroll.
    const headerBand = table.locator('[data-grid-col-header]').first();
    await expect(headerBand).toBeVisible();
    expect(
      await headerBand.evaluate((el) => getComputedStyle(el).position),
      'column header is sticky',
    ).toBe('sticky');
    expect(
      await headerBand.evaluate((el) => getComputedStyle(el).top),
      'column header pins to the top of its scrollport',
    ).toBe('0px');
    expect(
      await headerBand.evaluate((el) =>
        Boolean(el.closest('[data-testid="pending-grid-scroll"]')),
      ),
      'header pins inside the GRID scrollport, not the page port',
    ).toBe(true);
  });
});
