import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * To Ship · Pending → connected ledger grid (grid-only; Board|Grid retired).
 *
 * Asserts against the live Pending spreadsheet (`pending-grid-body` / LedgerGrid):
 *   (1) sticky column header with a label per track;
 *   (2) drag grip only in the header (grid skin: no grip — select-all only);
 *   (3) stock / platform / order / tracking lock under their headers;
 *   (4) frozen identity pane on h-scroll;
 *   (5) header drag-reorder persists per staff (select · title locked);
 *   (6) platform renders a fixed brand mark (icon/lettermark), never wide text;
 *   (7) Sheets-style in-cell edit (qty) commits through the assign waist.
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

  /** Drag one header cell onto another (dnd-kit PointerSensor, 6px activation). */
  const dragHeader = async (page: Page, from: Locator, to: Locator) => {
    const a = await from.boundingBox();
    const b = await to.boundingBox();
    if (!a || !b) throw new Error('no header boxes');
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    // Clear the 6px activation constraint, then travel in steps so dnd-kit
    // tracks the pointer.
    await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2, { steps: 3 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(250);
  };

  test('every fact owns its own locked column', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });

    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const headerRow = headerRowIn(table);
    await expect(headerRow).toBeVisible();
    // Icon-only headers — labels live in sr-only + tooltips.
    for (const col of ['title', 'date', 'age', 'stock', 'platform', 'order', 'tracking'] as const) {
      await expect(headerRow.locator(`[data-col="${col}"]`)).toHaveCount(1);
      await expect(headerRow.locator(`[data-col="${col}"] .sr-only`).first()).toHaveText(
        col === 'title' ? 'Product' : col === 'age' ? 'Age' : col === 'date' ? 'Ship by' : col === 'stock' ? 'Stock' : col === 'platform' ? 'Platform' : col === 'order' ? 'Order' : 'Tracking',
      );
    }

    // Grid skin: no drag grip on rows; header may omit grip (select-all only).
    await expect(row.locator('.cursor-grab')).toHaveCount(0);

    // Flat Ship-by column — no floating day-band chrome; no status gutter;
    // no retired notes column. Age docks directly to the right of Ship by.
    await expect(table.locator('[data-grid-day-band]')).toHaveCount(0);
    await expect(row.locator('[data-col="status"]')).toHaveCount(0);
    await expect(row.locator('[data-col="notes"]')).toHaveCount(0);
    await expect(row.locator('[data-col="date"]')).toHaveCount(1);
    await expect(row.locator('[data-col="age"]')).toHaveCount(1);
    const dateHeader = headerRow.locator('[data-col="date"]');
    const ageHeader = headerRow.locator('[data-col="age"]');
    await expect(dateHeader).toHaveCount(1);
    expect(Math.abs((await leftX(dateHeader)) - (await leftX(row.locator('[data-col="date"]'))))).toBeLessThan(4);
    expect((await leftX(ageHeader)) > (await leftX(dateHeader)), 'Age header sits right of Ship by').toBe(true);

    for (const col of ['stock', 'platform', 'order', 'tracking'] as const) {
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

  test('renders as a gridlined spreadsheet — cells carry column rules, last column does not', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const borderRight = (loc: Locator) =>
      loc.evaluate((el) => parseFloat(getComputedStyle(el).borderRightWidth) || 0);

    const stock = row.locator('[data-col="stock"]');
    await expect(stock).toHaveCount(1);
    expect(await borderRight(stock), 'stock cell has a vertical column rule').toBeGreaterThan(0);

    const tracking = row.locator('[data-col="tracking"]');
    await expect(tracking).toHaveCount(1);
    expect(await borderRight(tracking), 'last (tracking) column has no trailing rule').toBe(0);

    const headerRow = headerRowIn(table);
    const columnHeaders = headerRow.locator('[role="columnheader"]');
    expect(await columnHeaders.count(), 'header cells expose role="columnheader"').toBeGreaterThanOrEqual(6);

    await page.screenshot({ path: 'test-results/to-ship-pending-grid-lines.png', fullPage: false });
  });

  test('typed column headers are icon-only with sr-only labels', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const headerRow = headerRowIn(table);
    await expect(headerRow).toBeVisible();

    for (const col of ['title', 'date', 'qty', 'age'] as const) {
      const cell = headerRow.locator(`[data-col="${col}"]`);
      await expect(cell.locator('svg')).toHaveCount(1);
      await expect(cell.locator('.sr-only').first()).toBeAttached();
    }

    // Chrome sort switcher for Priority | Newest | Deadline.
    await expect(page.locator('[data-queue-sort-switch]')).toBeVisible();

    await page.screenshot({ path: 'test-results/to-ship-pending-grid-typed-headers.png', fullPage: false });
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

  test('platform column renders a fixed brand mark, never wide text', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const grid = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    const row = grid.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const platformCell = row.locator('[data-col="platform"]').first();
    await expect(platformCell).toHaveCount(1);
    // Fixed narrow icon track (3rem ≈ 48px) — a variable-width marketplace
    // name cannot fit; the mark (SVG brand icon or lettermark box) can.
    const width = (await platformCell.boundingBox())!.width;
    expect(width, 'platform track is the fixed icon width').toBeLessThan(64);

    // Accessible name survives icon-only presentation (sr-only inside the mark
    // button, when the row has a platform at all).
    const markButtons = platformCell.locator('button');
    if ((await markButtons.count()) > 0) {
      await expect(markButtons.first().locator('.sr-only')).toBeAttached();
    }

    await page.screenshot({ path: 'test-results/to-ship-pending-grid-platform-icons.png', fullPage: false });
  });

  test('column reorder: drag Platform before Cond, persist across reload, reset restores canonical', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const grid = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    await expect(grid.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    const headerRow = headerRowIn(grid);
    const platformHeader = headerRow.locator('[data-col="platform"]');
    const condHeader = headerRow.locator('[data-col="condition"]');
    await expect(platformHeader).toBeVisible();
    await expect(condHeader).toBeVisible();

    const condX0 = await leftX(condHeader);
    expect((await leftX(platformHeader)) > condX0, 'canonical: platform right of condition').toBe(true);

    await dragHeader(page, platformHeader, condHeader);

    // Live reorder: platform now left of condition — header AND body agree.
    expect((await leftX(platformHeader)) < (await leftX(condHeader)), 'platform moved before condition').toBe(true);
    const row = grid.locator('[data-order-row-id]').first();
    expect(
      (await leftX(row.locator('[data-col="platform"]'))) < (await leftX(row.locator('[data-col="condition"]'))),
      'body cells follow the header order',
    ).toBe(true);

    // Select + title stay locked first/frozen.
    const titleCell = row.locator('[data-col="title"]');
    expect(await titleCell.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
    expect((await leftX(titleCell)) < (await leftX(row.locator('[data-col="date"], [data-col="platform"]').first()))).toBe(true);

    // Persisted per staff: survive a reload.
    await page.reload();
    await expect(grid.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    const headerRow2 = headerRowIn(grid);
    expect(
      (await leftX(headerRow2.locator('[data-col="platform"]'))) < (await leftX(headerRow2.locator('[data-col="condition"]'))),
      'order persists across reload',
    ).toBe(true);

    await page.screenshot({ path: 'test-results/to-ship-pending-grid-reorder.png', fullPage: false });

    // Reset path: double-click a movable header → canonical order again.
    await headerRow2.locator('[data-col="platform"]').dblclick();
    await page.waitForTimeout(300);
    expect(
      (await leftX(headerRow2.locator('[data-col="platform"]'))) > (await leftX(headerRow2.locator('[data-col="condition"]'))),
      'double-click reset restores canonical order',
    ).toBe(true);
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
    const assign = page.waitForResponse((r) => r.url().includes('/api/orders/assign') && r.request().method() === 'POST');
    await qtyCell.click();
    await qtyCell.locator('input').fill('3');
    await qtyCell.locator('input').press('Enter');
    const res = await assign;
    expect(res.ok(), 'assign commit succeeded').toBe(true);
    await expect(qtyCell).toContainText('3');

    // Restore the original quantity (leave dogfood data as found).
    const restore = page.waitForResponse((r) => r.url().includes('/api/orders/assign') && r.request().method() === 'POST');
    await qtyCell.click();
    await qtyCell.locator('input').fill(before || '1');
    await qtyCell.locator('input').press('Enter');
    await restore;
    await expect(qtyCell).toContainText(before || '1');
  });
});
