import { test, expect, type Locator } from '@playwright/test';

/**
 * Pending Grid skin SCOPING guard.
 *
 * Pending is grid-only (`OrdersGridView` / `LedgerGrid`). Shared queue components
 * are ALSO imported by Packed (`OrdersQueueTable`). This spec proves the skin is
 * OPT-IN and never leaks: Packed stays GRAY / hairline / label-first.
 *
 * Token truth (light theme — the default under test):
 *   background-canvas #f8fafc → 248,250,252   (packed header, /95 alpha)
 *   background-surface #ffffff → 255,255,255   (grid header + cells)
 *   border-hairline #f1f5f9 → 241,245,249      (packed cell gridline)
 *   border-subtle  #e2e8f0 → 226,232,240      (grid-skin outer shell + internal)
 */

const CANVAS_GRAY = '248,250,252';
const WHITE = '255,255,255';
const HAIRLINE = '241,245,249';
const SUBTLE = '226,232,240';

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
const cellBorderRgb = async (root: Locator) =>
  toRgb(await root.locator('[data-order-row-id]').first().locator('[data-col="stock"]').evaluate((el) => getComputedStyle(el).borderRightColor));
const glyphCount = (headerRow: Locator, col: string) => headerRow.locator(`[data-col="${col}"] svg`).count();

test.describe('orders-queue Airtable skin scoping (shared components stay gray off-skin)', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'orders-queue grid is a desktop layout');

  test('Pending GRID — rounded light shell, icon-only headers, always-select, flush padding', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const grid = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    await expect(grid.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    const header = headerRowIn(grid);
    await expect(header).toBeVisible();

    expect(await bgRgb(header), 'grid header is white').toBe(WHITE);
    expect(await backdropOf(header), 'grid header drops the backdrop blur').toBe('none');

    // Icon-only — glyphs visible; text labels are sr-only.
    expect(await glyphCount(header, 'qty'), 'qty has type glyph').toBeGreaterThanOrEqual(1);
    expect(await glyphCount(header, 'age'), 'age has type glyph').toBeGreaterThanOrEqual(1);
    expect(await glyphCount(header, 'order'), 'order has type glyph').toBeGreaterThanOrEqual(1);
    await expect(header.locator('[data-col="qty"] .sr-only')).toHaveText('Qty');

    const selectAll = header.getByRole('checkbox', { name: /select all/i });
    await expect(selectAll).toBeVisible();
    const rowSelect = grid.locator('[data-order-row-id]').first().getByRole('checkbox').first();
    await expect(rowSelect).toBeVisible();
    expect(await rowSelect.evaluate((el) => getComputedStyle(el).opacity), 'row select visible').toBe('1');

    await expect(page.locator('[data-queue-sort-switch]')).toBeVisible();

    const stockCell = grid.locator('[data-order-row-id]').first().locator('[data-col="stock"]');
    const stockStyle = await stockCell.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.borderRightWidth, color: s.borderRightColor };
    });
    expect(parseFloat(stockStyle.width), 'grid mid-cell has a vertical rule').toBeGreaterThan(0);
    expect(toRgb(stockStyle.color), 'grid vertical is border-subtle').toBe(SUBTLE);

    // Row container has no vertical pad — cells own the inset so borders connect.
    const rowPad = await grid.locator('[data-order-row-id]').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { top: parseFloat(s.paddingTop), bottom: parseFloat(s.paddingBottom), left: parseFloat(s.paddingLeft) };
    });
    expect(rowPad.top, 'grid row top pad is 0').toBe(0);
    expect(rowPad.bottom, 'grid row bottom pad is 0').toBe(0);
    expect(rowPad.left, 'grid row left pad is 0 (flush to shell)').toBe(0);

    const trackingCell = grid.locator('[data-order-row-id]').first().locator('[data-col="tracking"]');
    expect(await trackingCell.evaluate((el) => getComputedStyle(el).borderRightWidth), 'last col no trailing vertical').toBe('0px');

    const shell = await grid.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, color: s.borderTopColor, width: s.borderTopWidth };
    });
    expect(parseFloat(shell.radius), 'grid shell is rounded').toBeGreaterThan(0);
    expect(parseFloat(shell.width), 'grid shell has a border').toBeGreaterThan(0);
    expect(toRgb(shell.color), 'grid shell is border-subtle').toBe(SUBTLE);

    await page.screenshot({ path: 'test-results/orders-queue-scoping-grid-white.png' });
  });

  test('column header stays sticky at the grid scrollport top', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const grid = page.locator('[data-testid="pending-grid-scroll"]').first();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    await expect(grid.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    const headerBand = grid.locator('[data-grid-col-header]').first();
    await expect(headerBand).toBeVisible();
    const pos = await headerBand.evaluate((el) => getComputedStyle(el).position);
    expect(pos, 'header band is position:sticky').toBe('sticky');
    const top = await headerBand.evaluate((el) => getComputedStyle(el).top);
    expect(top === '0px' || top === '0', 'header band docks at top:0').toBe(true);

    // Scroll rows; sticky band stays at the scrollport top.
    const before = await headerBand.boundingBox();
    await grid.evaluate((el) => {
      el.scrollTop = Math.min(240, el.scrollHeight);
    });
    const after = await headerBand.boundingBox();
    expect(before && after, 'header still measurable after scroll').toBeTruthy();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0)), 'sticky header y stays put').toBeLessThan(2);
  });

  test('Packed tab — a second OrdersQueueTable consumer stays GRAY (no skin leak)', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const packedTab = page.getByRole('button', { name: 'Packed', exact: true });
    await expect(packedTab).toBeVisible({ timeout: 20_000 });
    await packedTab.click();
    const packed = page.locator('[data-testid="column-table-body"]').first();
    await expect(packed).toBeVisible({ timeout: 20_000 });
    await expect(packed.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    const header = headerRowIn(packed);
    await expect(header).toBeVisible({ timeout: 20_000 });

    expect(await bgRgb(header), 'packed header is the canvas-gray token, not white').toBe(CANVAS_GRAY);
    expect(await backdropOf(header), 'packed header keeps its backdrop blur').toContain('blur');
    expect(await glyphCount(header, 'qty'), 'packed qty header stays label-first').toBe(0);
    expect(await cellBorderRgb(packed), 'packed cell gridline is the hairline token').toBe(HAIRLINE);

    await page.screenshot({ path: 'test-results/orders-queue-scoping-packed-gray.png' });
  });
});
