import { test, expect, type Locator, type Page } from '@playwright/test';
import { ORDERS_COMPOUND_COLUMNS } from '@/lib/dashboard-order-row-layout';

/**
 * To Ship · Pending → the connected ledger grid.
 *
 * ## Ported to the COMPOUND row, 2026-08-29
 *
 * This file asserted the **flat** column model — `data-col="title"`, `age`,
 * `order`, `tracking`, `qty` as separately locked tracks — and had been failing
 * 8/8 for some time, because To-Ship renders the **compound two-row** model and
 * has since before this port: `useOrdersSpreadsheet` returned
 * `columns: ORDERS_COMPOUND_COLUMNS` at the commit this was written against.
 * Its tracks are `select · thumb · fulfillment · item · state · amount ·
 * actions · _fill`. There is no `title` track, so every locator resolved to
 * zero elements and every assertion failed on a healthy surface.
 *
 * ### What was kept, and what was deleted
 *
 * KEPT — properties that are still true and still worth pinning: the grid
 * mounts and paints rows, the select gutter is a real checkbox, header cells
 * lock to their body cells, the frozen identity pane (`select` + `thumb`) pins
 * under horizontal scroll, and the retired flat tracks stay gone rather than
 * silently returning under their old names.
 *
 * FOUND WHILE PORTING — **sorting is off on this desk.** See the sort test's
 * docblock: `isQueueColumnSort` still accepts only the retired flat keys, so no
 * compound header sorts. The old test hid it by clicking a locator that
 * resolved to nothing.
 *
 * DELETED — assertions about a design that was deliberately replaced:
 *
 * - *"every fact owns its own locked column"* is the flat premise. Under the
 *   compound row a fact lives inside the `fulfillment` / `item` cell, which is
 *   the entire point of the two-row shape.
 * - *"cells carry vertical column rules"* contradicts the shipped skin. The
 *   airtable skin draws BOTTOM-only rules through header and body with no
 *   vertical cage (`table-surface.ts`), and `ledgerGridCell`'s `rule` argument
 *   has been a documented no-op for vertical paint since 2026-08-04. That test
 *   asserted a cage the product removed on purpose.
 *
 * Both deletions are covered elsewhere by tests that pin the CURRENT contract:
 * `compound-row-model.test.ts` (every family declares the same tracks, in the
 * same order) and `unbox-sheets-select-hairlines.spec.ts` (the bottom-only
 * hairline paint).
 */

type CompoundKey = (typeof ORDERS_COMPOUND_COLUMNS)[number]['key'];

test.describe('To Ship · Pending Sheets-like grid', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  const leftX = async (loc: Locator) => {
    const box = await loc.boundingBox();
    if (!box) throw new Error('no bounding box');
    return box.x;
  };

  /** The sticky header row — a row of `columnheader`s, never a body row. */
  const headerRowIn = (table: Locator) =>
    table.locator('[role="row"]:has([role="columnheader"][data-col="item"])').first();

  const gridIn = (page: Page) => page.locator('[data-testid="pending-grid-body"]').first();

  async function openGrid(page: Page) {
    await page.goto('/dashboard?unshipped');
    const table = gridIn(page);
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    return { table, row, headerRow: headerRowIn(table) };
  }

  test('the compound tracks render, and the retired flat ones stay gone', async ({ page }) => {
    const { table, row, headerRow } = await openGrid(page);
    await expect(headerRow).toBeVisible();

    // Every track the mounted model declares is present exactly once on a row.
    // Read from the SoT rather than re-typed: the previous copies of this list
    // drifted the moment a column was renamed, and the stale locators then
    // resolved to zero elements and quietly asserted nothing.
    for (const column of ORDERS_COMPOUND_COLUMNS) {
      await expect(
        row.locator(`[data-col="${column.key}"]`),
        `compound track ${column.key} renders once`,
      ).toHaveCount(1);
    }

    // The flat model this file used to assert must not silently return —
    // `tested` included: the Slice 1 hand-spliced step is now the materialized
    // `status:1` slot track (bound to `orders.picked` in the product default).
    for (const retired of ['title', 'age', 'order', 'tracking', 'qty', 'date', 'sla', 'status', 'platform', 'notes', 'stock', 'tested'] as const) {
      await expect(
        row.locator(`[data-col="${retired}"]`),
        `retired flat track ${retired} stays gone`,
      ).toHaveCount(0);
    }

    // The slot band is REAL on this desk: the product default binds the tested
    // step into status:1, and both header and body paint it under the slot key.
    await expect(headerRow.locator('[data-col="status:1"]')).toHaveCount(1);
    await expect(row.locator('[data-col="status:1"]')).toHaveCount(1);

    // Grid skin: no drag grip on rows; the dense desk has no floating day bands.
    await expect(row.locator('.cursor-grab')).toHaveCount(0);
    await expect(table.locator('[data-grid-day-band]')).toHaveCount(0);
  });

  test('header cells lock to their body cells', async ({ page }) => {
    const { row, headerRow } = await openGrid(page);
    // The alignment invariant survives the model change and is what actually
    // breaks when a template and a header list drift apart.
    for (const key of ['item', 'state', 'amount'] as CompoundKey[]) {
      const headerCell = headerRow.locator(`[data-col="${key}"]`);
      const bodyCell = row.locator(`[data-col="${key}"]`);
      await expect(headerCell).toHaveCount(1);
      await expect(bodyCell).toHaveCount(1);
      expect(
        Math.abs((await leftX(headerCell)) - (await leftX(bodyCell))),
        `${key} header locks to its body cell`,
      ).toBeLessThan(4);
    }
  });

  test('select gutter paints real checkboxes', async ({ page }) => {
    const { row, headerRow } = await openGrid(page);
    // Full-bleed checkmark gutter (`'flush'`), not the flat grid's inset square.
    await expect(
      headerRow.locator('[role="checkbox"][data-select-chrome="flush"]'),
    ).toBeVisible();
    await expect(
      row.locator('[data-select-gutter] [role="checkbox"][data-select-chrome="flush"]'),
    ).toBeVisible();
  });

  /** The named tracks — gutters (`select`, `thumb`, `actions`) and `_fill` are chrome. */
  const NAMED_TRACKS = ['fulfillment', 'item', 'state', 'amount'] as const;

  test('named headers carry a full name, never a truncated A…', async ({ page }) => {
    const { headerRow } = await openGrid(page);
    for (const key of NAMED_TRACKS) {
      const cell = headerRow.locator(`[data-col="${key}"]`);
      await expect(cell).toHaveCount(1);
      const text = (await cell.innerText()).trim();
      const accessible = (await cell.getAttribute('aria-label')) ?? '';
      expect(
        text.includes('…') || text.endsWith('...'),
        `${key} must not truncate its label`,
      ).toBe(false);
      expect(
        text.length > 0 || accessible.length > 0,
        `${key} has an accessible name`,
      ).toBe(true);
    }
  });

  /**
   * Sorting was OFF on this desk, and this test is why it is not any more.
   *
   * The compound header's keys are TRACKS (`fulfillment`, `item`); `?sort=` is
   * written in FACTS (`order`, `title`). Nothing bridged them when To-Ship moved
   * to the two-row row, so `isQueueColumnSort` rejected every header key and a
   * click did nothing. The predecessor of this test clicked `[data-col="title"]`
   * — a track that does not exist — so it failed as "stale test" rather than as
   * "sorting is broken", and the defect sat behind that reading.
   *
   * `queueSortForColumnKey` now maps the two tracks that carry a sortable fact.
   * `state` and `amount` stay unsortable, as they were in the flat model.
   */
  test('a sortable header round-trips through the URL', async ({ page }) => {
    const { headerRow } = await openGrid(page);
    const header = headerRow.locator('[role="columnheader"][data-col="item"]');
    await expect(header).toBeVisible();

    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await expect(header.locator('[data-sort-affordance="asc"]')).toBeVisible();
    // `item` carries the product title, so it writes `?sort=title`.
    await expect(page).toHaveURL(/sort=title/);

    await header.click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    await expect(header.locator('[data-sort-affordance="desc"]')).toBeVisible();
    await expect(page).toHaveURL(/dir=desc/);
  });

  test('the sort arrow sits to the right of the title, and only appears when sorted', async ({
    page,
  }) => {
    const { headerRow } = await openGrid(page);
    const header = headerRow.locator('[role="columnheader"][data-col="item"]');
    await expect(header.locator('[data-sort-affordance]')).toHaveCount(0);

    await header.click();
    await expect(header.locator('[data-sort-affordance="asc"]')).toBeVisible();

    const order = await header.evaluate((el) => {
      const title = [...el.querySelectorAll('span')].find(
        (s) => s.textContent?.trim() === 'Item' && !s.classList.contains('sr-only'),
      );
      const arrow = el.querySelector('[data-sort-affordance]');
      if (!title || !arrow) return { ok: false, reason: 'missing title or arrow' };
      const titleBox = title.getBoundingClientRect();
      const arrowBox = arrow.getBoundingClientRect();
      return {
        ok: true,
        arrowRightOfTitle: arrowBox.left >= titleBox.right - 1,
        titleClass: title.className,
      };
    });
    expect(order.ok, 'Item header has a title and a sort arrow').toBe(true);
    expect(order.arrowRightOfTitle, 'arrow is to the right of Item').toBe(true);
    expect(order.titleClass, 'title is black ink, not muted chrome').toContain(
      'text-text-default',
    );
  });

  test('the image column header is the word Image, not a glyph', async ({ page }) => {
    const { headerRow } = await openGrid(page);
    const thumb = headerRow.locator('[role="columnheader"][data-col="thumb"]');
    await expect(thumb).toBeVisible();
    await expect(thumb).toContainText('Image');
    await expect(thumb.locator('svg')).toHaveCount(0);
  });

  test('a track with no sortable fact does not pretend to sort', async ({ page }) => {
    const { headerRow } = await openGrid(page);
    const before = page.url();
    await headerRow.locator('[data-col="amount"]').click();
    await page.waitForTimeout(200);
    expect(page.url(), 'amount has no sort vocabulary and must not write one').toBe(before);
  });

  test('frozen identity pane pins on horizontal scroll', async ({ page }) => {
    const { table, row } = await openGrid(page);

    // The frozen prefix is `select` + `thumb` — the checkbox and photo gutters.
    // `thumb` is its trailing edge, so it is the one that must stay pinned.
    const frozen = row.locator('[data-col="thumb"]').first();
    await expect(frozen).toHaveCount(1);
    const position = await frozen.evaluate((el) => getComputedStyle(el).position);
    expect(position, 'frozen identity cell is sticky').toBe('sticky');

    const scroller = table.locator('[data-grid-scroll-x]').first();
    if ((await scroller.count()) > 0) {
      const scrolling = row.locator('[data-col="amount"]').first();
      const frozenX0 = await leftX(frozen);
      const scrollX0 = await leftX(scrolling);
      await scroller.evaluate((el) => el.scrollBy({ left: 240 }));
      await page.waitForTimeout(120);
      const frozenX1 = await leftX(frozen);
      const scrollX1 = await leftX(scrolling);
      expect(Math.abs(frozenX1 - frozenX0), 'frozen pane stays pinned').toBeLessThan(3);
      expect(scrollX0 - scrollX1, 'fact columns scroll under the frozen pane').toBeGreaterThan(20);
    }
  });
});
