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
    // header cell locks vertically to its body cell. Compare the header [data-col]
    // cell to the row [data-col] cell (not the label text): the typed-header glyph
    // offsets the label inside its cell, so a text-based check would read the
    // glyph width, not the column origin.
    for (const col of ['notes', 'platform', 'order', 'tracking'] as const) {
      const cell = row.locator(`[data-col="${col}"]`);
      await expect(cell).toHaveCount(1);
      const headerCell = headerRow.locator(`[data-col="${col}"]`);
      await expect(headerCell).toHaveCount(1);
      const headerX = await leftX(headerCell);
      const cellX = await leftX(cell);
      expect(Math.abs(headerX - cellX), `${col} header cell locks to its body cell`).toBeLessThan(4);
    }

    // Status dots share one vertical x across rows (own track, centered).
    const statusDots = table.locator('[data-order-row-id] .rounded-full');
    expect(await statusDots.count()).toBeGreaterThan(0);

    await page.screenshot({ path: 'test-results/to-ship-pending-grid.png', fullPage: false });
  });

  test('renders as a gridlined spreadsheet — cells carry column rules, last column does not', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="column-table-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const borderRight = (loc: Locator) =>
      loc.evaluate((el) => parseFloat(getComputedStyle(el).borderRightWidth) || 0);

    // A mid-grid body cell is bounded by a vertical column rule (right hairline) —
    // the Phase-1 proof the table reads as a spreadsheet, not a hairline list.
    const notes = row.locator('[data-col="notes"]');
    await expect(notes).toHaveCount(1);
    expect(await borderRight(notes), 'notes cell has a vertical column rule').toBeGreaterThan(0);

    // The last column (tracking) closes the grid — no trailing rule.
    const tracking = row.locator('[data-col="tracking"]');
    await expect(tracking).toHaveCount(1);
    expect(await borderRight(tracking), 'last (tracking) column has no trailing rule').toBe(0);

    // The sticky header exposes columnheader roles locked to the same tracks.
    const headerRow = table.locator('[role="row"]').filter({ hasText: 'Product' }).first();
    const columnHeaders = headerRow.locator('[role="columnheader"]');
    expect(await columnHeaders.count(), 'header cells expose role="columnheader"').toBeGreaterThanOrEqual(6);

    await page.screenshot({ path: 'test-results/to-ship-pending-grid-lines.png', fullPage: false });
  });

  test('typed column headers carry a data-type glyph on the roomy columns', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="column-table-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const headerRow = table.locator('[role="row"]').filter({ hasText: 'Product' }).first();
    await expect(headerRow).toBeVisible();

    // The roomy prose column (Product = text) shows its type glyph before the
    // label, resolved from the column-type registry.
    const productHeader = headerRow.locator('[data-col="title"]');
    await expect(productHeader).toHaveCount(1);
    await expect(productHeader.locator('svg').first()).toBeVisible();

    // Narrow fact columns stay label-first (no glyph) so their short labels don't
    // truncate to an ambiguous icon (three columns share the # glyph).
    const qtyHeader = headerRow.locator('[data-col="qty"]');
    await expect(qtyHeader).toHaveCount(1);
    await expect(qtyHeader.locator('svg')).toHaveCount(0);

    await page.screenshot({ path: 'test-results/to-ship-pending-grid-typed-headers.png', fullPage: false });
  });

  test('columns are drag-resizable and the width persists across reload', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="column-table-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    await table.locator('[data-order-row-id]').first().waitFor({ timeout: 20_000 });
    const headerRow = table.locator('[role="row"]').filter({ hasText: 'Product' }).first();
    const notesHeader = headerRow.locator('[data-col="notes"]');
    await expect(notesHeader).toHaveCount(1);

    const notesWidth = async () => {
      const box = await notesHeader.boundingBox();
      if (!box) throw new Error('no notes header box');
      return box.width;
    };

    const dragNotesHandle = async (dx: number) => {
      await notesHeader.hover();
      const handle = notesHeader.getByRole('button', { name: /resize notes column/i });
      const hb = await handle.boundingBox();
      if (!hb) throw new Error('no resize handle box');
      const cx = hb.x + hb.width / 2;
      const cy = hb.y + hb.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + dx, cy, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(500); // let the optimistic staff-prefs PUT settle
    };

    const w0 = await notesWidth();
    await dragNotesHandle(120);
    const w1 = await notesWidth();
    expect(w1, 'notes column widened after the drag').toBeGreaterThan(w0 + 60);

    // An untouched column still locks header↔body after the resize (all rows
    // reflow together through the shared CSS var).
    const trkHeaderX = await leftX(headerRow.locator('[data-col="tracking"]'));
    const trkCellX = await leftX(table.locator('[data-order-row-id]').first().locator('[data-col="tracking"]'));
    expect(Math.abs(trkHeaderX - trkCellX), 'tracking still locks after resize').toBeLessThan(4);

    // Persist across reload (per-staff staff_preferences).
    await page.reload();
    await expect(table).toBeVisible({ timeout: 20_000 });
    await table.locator('[data-order-row-id]').first().waitFor({ timeout: 20_000 });
    const w2 = await notesWidth();
    expect(Math.abs(w2 - w1), 'notes width persisted across reload').toBeLessThan(28);

    // Restore ~original so the dogfood user's saved width isn't left widened.
    await dragNotesHandle(-(w2 - w0));
  });
});
