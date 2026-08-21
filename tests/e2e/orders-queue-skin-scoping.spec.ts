import { test, expect, type Locator } from '@playwright/test';

/**
 * Outbound spreadsheet skin — Pending + Packed share the outbound spreadsheet
 * (`useOrdersSpreadsheet` → `NonlinearTableHost` → LedgerGrid)
 * (Airtable grid skin). Assert both tabs render the same framed table + glyphs;
 * no day-band headers.
 *
 * Shell contract: rounded ops table surface (`TABLE_SURFACE_CLIP_CLASS` /
 * `[data-table-surface]`) — xl radius, border, raised lift, overflow-hidden.
 * Frozen header = strong; body = white. Continuous airtable column lines run
 * through header AND body (clipped at the rounded corners).
 *
 * Token truth (light theme — the default under test):
 *   background-surface #ffffff → 255,255,255   (body cells)
 *   surface-strong     #e2e8f0 → 226,232,240   (frozen header)
 */

const WHITE = '255,255,255';
const STRONG = '226,232,240';

function toRgb(s: string): string {
  let m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return `${Math.round(r)},${Math.round(g)},${Math.round(b)}`;
  }
  m = s.match(/color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/);
  if (m) return `${Math.round(+m[1] * 255)},${Math.round(+m[2] * 255)},${Math.round(+m[3] * 255)}`;
  throw new Error('unparseable color: ' + s);
}

const headerRowIn = (root: Locator) =>
  root.locator('[role="row"]:has([data-col="title"])').first();
const bgRgb = async (loc: Locator) => toRgb(await loc.evaluate((el) => getComputedStyle(el).backgroundColor));
const backdropOf = (loc: Locator) =>
  loc.evaluate((el) => getComputedStyle(el).backdropFilter || (getComputedStyle(el) as { webkitBackdropFilter?: string }).webkitBackdropFilter || 'none');
const glyphCount = (headerRow: Locator, col: string) => headerRow.locator(`[data-col="${col}"] svg`).count();

async function assertAirtableGridShell(grid: Locator) {
  await expect(grid).toBeVisible({ timeout: 20_000 });
  await expect(grid.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

  const header = headerRowIn(grid);
  await expect(header).toBeVisible();

  expect(await bgRgb(header), 'frozen header is strong (depth above white rows)').toBe(STRONG);
  expect(await backdropOf(header), 'grid header drops the backdrop blur').toBe('none');

  expect(await glyphCount(header, 'qty'), 'qty has type glyph').toBeGreaterThanOrEqual(1);
  expect(await glyphCount(header, 'age'), 'age has type glyph').toBeGreaterThanOrEqual(1);
  expect(await glyphCount(header, 'order'), 'order has type glyph').toBeGreaterThanOrEqual(1);
  await expect(header.locator('[data-col="qty"] .sr-only')).toHaveText('Qty');
  await expect(header.locator('[data-col="condition"]')).toContainText('Cond');
  await expect(header.locator('[data-col="age"] .sr-only')).toHaveText('Age');

  await expect(grid.locator('[data-date]')).toHaveCount(0);

  // Rounded raised clip frame.
  const framed = await grid.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      radius: s.borderRadius,
      borderTopWidth: s.borderTopWidth,
      overflow: s.overflow,
    };
  });
  expect(parseFloat(framed.radius), 'ops table shell has xl radius').toBeGreaterThan(0);
  expect(parseFloat(framed.borderTopWidth), 'ops table shell has perimeter border').toBeGreaterThan(0);
  expect(framed.overflow, 'ops table shell clips corners').toBe('hidden');

  // BOTTOM-only row rules (1B): no vertical column cage. Assert a bottom edge.
  const headerCellBorder = await header.locator('[data-col="title"]').evaluate(
    (el) => parseFloat(getComputedStyle(el).borderBottomWidth) || 0,
  );
  expect(headerCellBorder, 'header draws bottom row rules').toBeGreaterThan(0);

  const firstCell = grid.locator('[data-order-row-id] > [data-col]').first();
  const cellBorder = await firstCell.evaluate(
    (el) => parseFloat(getComputedStyle(el).borderBottomWidth) || 0,
  );
  expect(cellBorder, 'body draws bottom row rules').toBeGreaterThan(0);

  const rightBorder = await firstCell.evaluate(
    (el) => parseFloat(getComputedStyle(el).borderRightWidth) || 0,
  );
  expect(rightBorder, 'body has no vertical column rule (1B)').toBe(0);
}

test.describe('outbound spreadsheet / LedgerGrid (Pending + Packed)', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'orders-queue grid is a desktop layout');

  test('Pending GRID — rounded clip shell, bottom row rules, always-select', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const grid = page.locator('[data-testid="pending-grid-body"]').first();
    await assertAirtableGridShell(grid);

    const selectAll = headerRowIn(grid).getByRole('checkbox', { name: /select all/i });
    await expect(selectAll).toBeVisible();
    await expect(page.locator('[data-queue-sort-switch]')).toBeVisible();

    await page.screenshot({ path: 'test-results/orders-queue-scoping-grid-white.png' });
  });

  test('column header is sticky inside the framed grid', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const surface = page.locator('[data-testid="pending-grid-body"] [data-cf-grid]').first();
    await expect(surface).toBeVisible({ timeout: 20_000 });
    await expect(surface.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    const headerBand = surface.locator('[data-grid-col-header]').first();
    await expect(headerBand).toBeVisible();
    const pos = await headerBand.evaluate((el) => getComputedStyle(el).position);
    expect(pos, 'header band is position:sticky').toBe('sticky');
    const top = await headerBand.evaluate((el) => getComputedStyle(el).top);
    expect(top === '0px' || top === '0', 'header band docks at top:0').toBe(true);
  });

  test('Packed tab — same LedgerGrid airtable skin (no day bands)', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const packedTab = page.getByRole('button', { name: 'Packed', exact: true });
    await expect(packedTab).toBeVisible({ timeout: 20_000 });
    await packedTab.click();
    const packed = page.locator('[data-testid="packed-grid-body"]').first();
    await assertAirtableGridShell(packed);

    await page.screenshot({ path: 'test-results/orders-queue-scoping-packed-grid.png' });
  });
});
