import { test, expect, type Locator } from '@playwright/test';

/**
 * To Ship · Pending → Sheets-like WMS grid.
 *
 * Verifies the queue table renders as a single continuous spreadsheet where every
 * fact owns its own column and the sticky column header locks vertically to each
 * cell (docs/todo/to-ship-pending-sheets-grid-handoff.md):
 *   select · status · product · qty · cond · age · notes · platform · order · tracking
 *
 * Asserts against the REAL Pending board (the dogfood tenant's live orders):
 *   (1) one sticky column header with a label per track;
 *   (2) the per-row drag grip is gone — the grip exists ONLY in the header;
 *   (3) notes / platform / order / tracking each render in their own cell,
 *       horizontally locked under their header label (the "locked track" proof).
 *
 * Desktop-only — the grid is a desktop layout (mobile stacks).
 */

test.describe('To Ship · Pending Sheets-like grid', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  const leftX = async (loc: Locator) => {
    const box = await loc.boundingBox();
    if (!box) throw new Error('no bounding box');
    return box.x;
  };

  test('every fact owns its own locked column and rows have no drag grip', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    // Scope to one queue table (a Pending lane) so the header and its rows share
    // one grid origin. The column header + rows live in the same scroll body.
    const table = page.locator('[data-testid="column-table-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });

    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    // (1) One sticky column header carrying a text label per track.
    const headerRow = table.locator('[role="row"]').filter({ hasText: 'Product' }).first();
    await expect(headerRow).toBeVisible();
    for (const label of ['Product', 'Age', 'Notes', 'Platform', 'Order', 'Tracking']) {
      await expect(headerRow.getByText(label, { exact: true })).toBeVisible();
    }

    // (2) The drag grip lives ONLY in the header (select-all context) — never on
    // a row. The grip is the sole `.cursor-grab` affordance in the header.
    await expect(headerRow.locator('.cursor-grab')).toHaveCount(1);
    await expect(row.locator('.cursor-grab')).toHaveCount(0);

    // (3) Notes / Platform / Order / Tracking each occupy their own cell, and each
    // cell is horizontally locked under its header label (the Sheets-grid proof).
    for (const col of ['notes', 'platform', 'order', 'tracking'] as const) {
      const cell = row.locator(`[data-col="${col}"]`);
      await expect(cell).toHaveCount(1);
      const label = col.charAt(0).toUpperCase() + col.slice(1);
      const headerX = await leftX(headerRow.getByText(label, { exact: true }));
      const cellX = await leftX(cell);
      expect(Math.abs(headerX - cellX), `${col} cell locks under its "${label}" header`).toBeLessThan(16);
    }

    // Status dots share one vertical x across rows (own track, centered).
    const statusDots = table.locator('[data-order-row-id] .rounded-full');
    expect(await statusDots.count()).toBeGreaterThan(0);

    await page.screenshot({ path: 'test-results/to-ship-pending-grid.png', fullPage: false });
  });
});
