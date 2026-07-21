import { test, expect, type Locator } from '@playwright/test';

/**
 * Pending Grid skin SCOPING guard.
 *
 * The Pending → Grid view (`?view=grid`) re-skins the SHARED orders-queue
 * components into a light connected spreadsheet (rounded shell, hairline
 * internal grid, label-only headers). Those exact components are ALSO imported
 * by the flat/shelf `OrdersQueueTable` (Pending board, Packed, …). This spec
 * proves the skin is OPT-IN and never leaks: board stays GRAY / hairline /
 * label-first.
 *
 * Token truth (light theme — the default under test):
 *   background-canvas #f8fafc → 248,250,252   (board header, /95 alpha)
 *   background-surface #ffffff → 255,255,255   (grid header + cells)
 *   border-hairline #f1f5f9 → 241,245,249      (board cell gridline)
 *   border-subtle  #e2e8f0 → 226,232,240      (grid-skin outer shell)
 *   border-default #cbd5e1 → 203,213,225      (grid-skin internal 2px stroke)
 */

const CANVAS_GRAY = '248,250,252'; // board/packed header fill
const WHITE = '255,255,255'; // grid header + cells
const HAIRLINE = '241,245,249'; // board cell gridline
const SHELL = '226,232,240'; // grid outer shell (border-subtle)
const GRID_STROKE = '203,213,225'; // grid internal stroke (border-default)

/** Normalize any computed color — `rgb()`, `rgba()`, or CSS Color-4
 *  `color(srgb r g b / a)` — to `r,g,b` ints. */
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
  toRgb(await root.locator('[data-order-row-id]').first().locator('[data-col="notes"]').evaluate((el) => getComputedStyle(el).borderRightColor));
const glyphCount = (headerRow: Locator, col: string) => headerRow.locator(`[data-col="${col}"] svg`).count();

test.describe('orders-queue Airtable skin scoping (shared components stay gray off-skin)', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'orders-queue grid is a desktop layout');

  test('Pending BOARD — imported header + cells stay GRAY / hairline (no skin leak)', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const board = page.locator('[data-testid="column-table-body"]').first();
    await expect(board).toBeVisible({ timeout: 20_000 });
    await expect(board.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    const header = headerRowIn(board);
    await expect(header).toBeVisible();

    expect(await bgRgb(header), 'board header is the canvas-gray token, not white').toBe(CANVAS_GRAY);
    expect(await backdropOf(header), 'board header keeps its backdrop blur').toContain('blur');

    expect(await glyphCount(header, 'qty'), 'board qty header has no glyph').toBe(0);
    expect(await glyphCount(header, 'order'), 'board order header has no glyph').toBe(0);

    expect(await cellBorderRgb(board), 'board cell gridline is the hairline token').toBe(HAIRLINE);

    await page.screenshot({ path: 'test-results/orders-queue-scoping-board-gray.png' });
  });

  test('Pending GRID view — rounded light shell, icon headers, always-select, compact', async ({ page }) => {
    await page.goto('/dashboard?unshipped&view=grid');
    const grid = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(grid).toBeVisible({ timeout: 20_000 });
    await expect(grid.locator('[data-order-row-id]').first()).toBeVisible({ timeout: 20_000 });

    const header = headerRowIn(grid);
    await expect(header).toBeVisible();

    // Skin ON: opaque white header, no backdrop blur.
    expect(await bgRgb(header), 'grid header is white').toBe(WHITE);
    expect(await backdropOf(header), 'grid header drops the backdrop blur').toBe('none');

    // Icon-only typed headers (T / # / tags / clock / …) — each narrow fact
    // column leads with a type glyph; human labels live in tooltips.
    expect(await glyphCount(header, 'qty'), 'grid qty header shows # glyph').toBeGreaterThan(0);
    expect(await glyphCount(header, 'condition'), 'grid cond header shows tags glyph').toBeGreaterThan(0);
    expect(await glyphCount(header, 'age'), 'grid age header shows clock glyph').toBeGreaterThan(0);
    expect(await glyphCount(header, 'platform'), 'grid platform header shows external glyph').toBeGreaterThan(0);
    expect(await glyphCount(header, 'order'), 'grid order header shows # glyph').toBeGreaterThan(0);
    expect(await glyphCount(header, 'tracking'), 'grid tracking header shows map glyph').toBeGreaterThan(0);

    // Select bubble always visible (not hover-reveal).
    const selectAll = header.getByRole('checkbox', { name: /select all/i });
    await expect(selectAll).toBeVisible();
    const rowSelect = grid.locator('[data-order-row-id]').first().getByRole('checkbox').first();
    await expect(rowSelect).toBeVisible();
    const rowSelectOpacity = await rowSelect.evaluate((el) => getComputedStyle(el).opacity);
    expect(rowSelectOpacity, 'row select bubble is fully visible').toBe('1');

    // Connected internal vertical: mid cell has a visible 2px stroke (not black,
    // not near-invisible hairline).
    const notesCell = grid.locator('[data-order-row-id]').first().locator('[data-col="notes"]');
    const notesStyle = await notesCell.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: s.borderRightWidth, color: s.borderRightColor };
    });
    expect(parseFloat(notesStyle.width), 'grid mid-cell stroke is ≥2px (anchor)').toBeGreaterThanOrEqual(2);
    expect(toRgb(notesStyle.color), 'grid vertical is border-default (visible)').toBe(GRID_STROKE);

    // Compact row padding — spreadsheet density, not comfortable pillow.
    const rowPad = await grid.locator('[data-order-row-id]').first().evaluate((el) => {
      const s = getComputedStyle(el);
      return { top: parseFloat(s.paddingTop), bottom: parseFloat(s.paddingBottom) };
    });
    expect(rowPad.top, 'grid row top pad is compact (≤4px / py-1)').toBeLessThanOrEqual(4);
    expect(rowPad.bottom, 'grid row bottom pad is compact (≤4px / py-1)').toBeLessThanOrEqual(4);

    // Last column closes against the shell — no trailing vertical.
    const trackingCell = grid.locator('[data-order-row-id]').first().locator('[data-col="tracking"]');
    const trackRight = await trackingCell.evaluate((el) => getComputedStyle(el).borderRightWidth);
    expect(trackRight, 'last column has no trailing vertical').toBe('0px');

    // Rounded light outer shell.
    const shell = await grid.evaluate((el) => {
      const s = getComputedStyle(el);
      return { radius: s.borderRadius, color: s.borderTopColor, width: s.borderTopWidth };
    });
    expect(parseFloat(shell.radius), 'grid shell is rounded').toBeGreaterThan(0);
    expect(parseFloat(shell.width), 'grid shell has a border').toBeGreaterThan(0);
    expect(toRgb(shell.color), 'grid shell is border-subtle (light)').toBe(SHELL);

    await page.screenshot({ path: 'test-results/orders-queue-scoping-grid-white.png' });
  });

  test('Packed tab — a second OrdersQueueTable consumer also stays GRAY', async ({ page }) => {
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

    await page.screenshot({ path: 'test-results/orders-queue-scoping-packed-gray.png' });
  });
});
