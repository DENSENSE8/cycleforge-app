import { test, expect, type Locator } from '@playwright/test';

/**
 * Outbound spreadsheet skin — Pending + Packed share OrdersGridView / LedgerGrid
 * (Airtable grid skin). Assert both tabs render the same white shell + glyphs;
 * no day-band headers.
 *
 * Shell contract (post minimal-simplify): FULL-BLEED in the workbench gutters —
 * no outer card radius/border; edges come from the skin's internal hairline
 * cell rules only. Header band is opaque white with no backdrop blur.
 *
 * Token truth (light theme — the default under test):
 *   background-surface #ffffff → 255,255,255   (grid header + cells)
 */

const WHITE = '255,255,255';

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

  expect(await bgRgb(header), 'grid header is white').toBe(WHITE);
  expect(await backdropOf(header), 'grid header drops the backdrop blur').toBe('none');

  expect(await glyphCount(header, 'qty'), 'qty has type glyph').toBeGreaterThanOrEqual(1);
  expect(await glyphCount(header, 'age'), 'age has type glyph').toBeGreaterThanOrEqual(1);
  expect(await glyphCount(header, 'order'), 'order has type glyph').toBeGreaterThanOrEqual(1);
  // Narrow tracks: glyph + sr-only (adaptive); never truncated visible "Q…" / "CH…".
  await expect(header.locator('[data-col="qty"] .sr-only')).toHaveText('Qty');
  await expect(header.locator('[data-col="platform"] .sr-only')).toHaveText('Platform');
  await expect(header.locator('[data-col="age"] .sr-only')).toHaveText('Age');

  // No floating day-band headers in the flat spreadsheet.
  await expect(grid.locator('[data-date]')).toHaveCount(0);

  // Full-bleed shell: no outer card radius; the airtable skin surface is white
  // and internal hairline cell rules are the only lines.
  const shell = await grid
    .locator('[data-grid-skin="airtable"]')
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, background: s.backgroundColor };
    });
  expect(parseFloat(shell.radius), 'grid shell is full-bleed (no card radius)').toBe(0);
  expect(toRgb(shell.background), 'grid skin surface is white').toBe(WHITE);
  const firstCell = grid.locator('[data-order-row-id] > [data-col]').first();
  const cellBorder = await firstCell.evaluate(
    (el) => parseFloat(getComputedStyle(el).borderRightWidth) || 0,
  );
  expect(cellBorder, 'internal hairline cell rules draw the grid').toBeGreaterThan(0);
}

test.describe('outbound OrdersGridView / LedgerGrid (Pending + Packed)', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'orders-queue grid is a desktop layout');

  test('Pending GRID — rounded light shell, label+glyph headers, always-select', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const grid = page.locator('[data-testid="pending-grid-body"]').first();
    await assertAirtableGridShell(grid);

    const selectAll = headerRowIn(grid).getByRole('checkbox', { name: /select all/i });
    await expect(selectAll).toBeVisible();
    await expect(page.locator('[data-queue-sort-switch]')).toBeVisible();

    await page.screenshot({ path: 'test-results/orders-queue-scoping-grid-white.png' });
  });

  test('column header stays sticky against the page port while rows scroll', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    // Split-x mode (ancestor page scroll): the surface is [data-cf-grid]; the
    // header band lives OUTSIDE the inner h-scroll box so it can dock to the
    // page port (`pending-grid-scroll` is the inner horizontal scroll body).
    const surface = page.locator('[data-testid="pending-grid-body"] [data-cf-grid]').first();
    await expect(surface).toBeVisible({ timeout: 20_000 });
    await expect(surface.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    const headerBand = surface.locator('[data-grid-col-header]').first();
    await expect(headerBand).toBeVisible();
    const pos = await headerBand.evaluate((el) => getComputedStyle(el).position);
    expect(pos, 'header band is position:sticky').toBe('sticky');
    const top = await headerBand.evaluate((el) => getComputedStyle(el).top);
    expect(top === '0px' || top === '0', 'header band docks at top:0').toBe(true);
    // The header band must NOT sit inside the horizontal scroll container — an
    // overflow-x box would capture its stickiness away from the page port.
    const insideXScroll = await headerBand.evaluate(
      (el) => Boolean(el.closest('[data-testid="pending-grid-scroll"]')),
    );
    expect(insideXScroll, 'header band lives outside the h-scroll body').toBe(false);

    // Scrolling the PAGE port keeps the band pinned + visible over the rows.
    const pageScroll = page.locator('[data-testid="dashboard-scroll"]');
    await pageScroll.evaluate((el) => {
      el.scrollTop = Math.min(el.scrollHeight, 500);
    });
    await page.waitForTimeout(150);
    await expect(headerBand).toBeVisible();
    const bandBox = await headerBand.boundingBox();
    const portBox = await pageScroll.boundingBox();
    expect(bandBox && portBox, 'band + port measurable after scroll').toBeTruthy();
    if (bandBox && portBox) {
      expect(bandBox.y, 'band pinned at/under the port top').toBeGreaterThanOrEqual(portBox.y - 2);
      expect(bandBox.y, 'band did not scroll away with the rows').toBeLessThan(portBox.y + 120);
    }
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
