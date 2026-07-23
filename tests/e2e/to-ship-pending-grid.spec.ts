import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * To Ship · Pending → connected ledger grid (grid-only; Board|Grid retired).
 *
 * Asserts against the live Pending spreadsheet (`pending-grid-body` / LedgerGrid):
 *   (1) sticky column header with a label per track;
 *   (2) drag grip only in the header (grid skin: no grip — select-all only);
 *   (3) platform / order / tracking lock under their headers;
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
    // Adaptive headers: label when track fits; otherwise glyph + sr-only (no A…).
    const expectHeader = async (col: string, visibleOrSr: string) => {
      const cell = headerRow.locator(`[data-col="${col}"]`);
      await expect(cell).toHaveCount(1);
      await expect(cell.locator('svg')).toHaveCount(1);
      const sr = cell.locator('.sr-only');
      if ((await sr.count()) > 0) {
        await expect(sr.first()).toHaveText(visibleOrSr);
      } else {
        await expect(cell).toContainText(visibleOrSr === 'Ship by' ? 'By' : visibleOrSr === 'Platform' ? 'Ch.' : visibleOrSr);
      }
    };
    await expectHeader('title', 'Product');
    await expectHeader('date', 'Ship by');
    await expectHeader('age', 'Age');
    await expectHeader('status', 'Status');
    await expectHeader('platform', 'Platform');
    await expectHeader('order', 'Order');
    await expectHeader('tracking', 'Tracking');

    // Grid skin: no drag grip on rows; header may omit grip (select-all only).
    await expect(row.locator('.cursor-grab')).toHaveCount(0);

    // Flat Ship-by column — no floating day-band chrome; Status is a first-class
    // column (Pending / Tested / Out of stock); no retired notes / stock columns.
    await expect(table.locator('[data-grid-day-band]')).toHaveCount(0);
    await expect(row.locator('[data-col="status"]')).toHaveCount(1);
    await expect(row.locator('[data-col="notes"]')).toHaveCount(0);
    await expect(row.locator('[data-col="stock"]')).toHaveCount(0);
    await expect(row.locator('[data-col="date"]')).toHaveCount(1);
    await expect(row.locator('[data-col="age"]')).toHaveCount(1);
    // No empty-tracking rows on Pending (filtered client-side).
    await expect(row.locator('[data-add-label]')).toHaveCount(0);
    const dateHeader = headerRow.locator('[data-col="date"]');
    const ageHeader = headerRow.locator('[data-col="age"]');
    const statusHeader = headerRow.locator('[data-col="status"]');
    await expect(dateHeader).toHaveCount(1);
    expect(Math.abs((await leftX(dateHeader)) - (await leftX(row.locator('[data-col="date"]'))))).toBeLessThan(4);
    expect((await leftX(ageHeader)) > (await leftX(dateHeader)), 'Age header sits right of Ship by').toBe(true);
    expect((await leftX(statusHeader)) > (await leftX(ageHeader)), 'Status header sits right of Age').toBe(true);

    for (const col of ['platform', 'order', 'tracking'] as const) {
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

    const platform = row.locator('[data-col="platform"]');
    await expect(platform).toHaveCount(1);
    expect(await borderRight(platform), 'platform cell has a vertical column rule').toBeGreaterThan(0);

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

    for (const col of ['title', 'date', 'qty', 'age'] as const) {
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

  test('platform column renders a fixed brand mark, never wide text', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const grid = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    const row = grid.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const platformCell = row.locator('[data-col="platform"]').first();
    await expect(platformCell).toHaveCount(1);
    // Fixed narrow icon track (3.5rem ≈ 56px) — a variable-width marketplace
    // name cannot fit; the fixed-footprint PlatformMark can.
    const width = (await platformCell.boundingBox())!.width;
    expect(width, 'platform track is the fixed icon width').toBeLessThan(64);

    // Accessible name on the mark button (sr-only), when the row has a platform.
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

    // Self-heal a stale persisted order from an earlier failed run: double-click
    // resets to canonical when a custom order is active, and is a no-op when
    // the order is already canonical (no reset handler armed).
    await platformHeader.dblclick();
    await page.waitForTimeout(400);

    const condX0 = await leftX(condHeader);
    expect((await leftX(platformHeader)) > condX0, 'canonical: platform right of condition').toBe(true);

    // The order persists via a BACKGROUND PUT — capture it so the later reload
    // can't race (and abort) the in-flight save under parallel-worker load.
    const prefsSaved = page.waitForResponse(
      (r) => r.url().includes('/api/staff-preferences') && r.request().method() === 'PUT',
    );
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

    // Persisted per staff: survive a reload. The header renders canonical until
    // the staff-prefs fetch resolves — poll, don't one-shot (slow under load).
    const saveRes = await prefsSaved;
    expect(saveRes.ok(), 'staff-preferences order PUT succeeded').toBe(true);
    await page.reload();
    await expect(grid.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });
    const headerRow2 = headerRowIn(grid);
    await expect
      .poll(
        async () =>
          (await leftX(headerRow2.locator('[data-col="platform"]'))) <
          (await leftX(headerRow2.locator('[data-col="condition"]'))),
        { timeout: 10_000, message: 'order persists across reload' },
      )
      .toBe(true);

    await page.screenshot({ path: 'test-results/to-ship-pending-grid-reorder.png', fullPage: false });

    // Reset path: double-click a movable header → canonical order again.
    await headerRow2.locator('[data-col="platform"]').dblclick();
    await expect
      .poll(
        async () =>
          (await leftX(headerRow2.locator('[data-col="platform"]'))) >
          (await leftX(headerRow2.locator('[data-col="condition"]'))),
        { timeout: 10_000, message: 'double-click reset restores canonical order' },
      )
      .toBe(true);
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

  test('status chip renders; KPI scrolls away; column header sticks under chrome', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const chrome = page.locator('[data-dashboard-chrome]').first();
    const scroll = page.locator('[data-testid="dashboard-scroll"]').first();
    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const statusCell = row.locator('[data-col="status"]');
    await expect(statusCell).toBeVisible();
    const statusText = ((await statusCell.innerText()) || '').trim().toUpperCase();
    expect(
      /PENDING|TESTED|OUT OF STOCK/.test(statusText),
      `status chip reads a fulfillment lane (got "${statusText}")`,
    ).toBe(true);

    const kpi = page.locator('[aria-label="Outbound attention"]').first();
    await expect(kpi).toBeVisible();

    const headerBand = table.locator('[data-grid-col-header]').first();
    await expect(headerBand).toBeVisible();

    // Scroll the page port far enough that the KPI leaves and the sticky
    // column header docks under the pinned context chrome.
    await scroll.evaluate((el) => {
      el.scrollTop = Math.min(el.scrollHeight, 600);
    });
    await page.waitForTimeout(200);

    const chromeBox = await chrome.boundingBox();
    const headerBox = await headerBand.boundingBox();
    const kpiBox = await kpi.boundingBox();
    expect(chromeBox && headerBox, 'chrome + header measurable after scroll').toBeTruthy();
    // KPI should have scrolled up out of (or mostly out of) the scrollport.
    if (kpiBox && chromeBox) {
      expect(kpiBox.y + kpiBox.height, 'KPI fully or mostly above the scroll top').toBeLessThanOrEqual(
        chromeBox.y + chromeBox.height + 24,
      );
    }
    if (chromeBox && headerBox) {
      expect(
        headerBox.y,
        'sticky header sits at or just below pinned chrome',
      ).toBeGreaterThanOrEqual(chromeBox.y + chromeBox.height - 2);
      expect(
        headerBox.y,
        'sticky header does not float far below chrome',
      ).toBeLessThan(chromeBox.y + chromeBox.height + 8);
    }
  });
});
