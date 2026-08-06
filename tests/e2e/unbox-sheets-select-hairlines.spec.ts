import { test, expect, type Locator, type Page } from '@playwright/test';

/**
 * Unbox History Sheets geometry: airtable cell hairlines + click-select.
 * Select track stays for header select-all; body paints decorative
 * `GridClickSelectFace` when selected (not an interactive gutter checkbox).
 * Hairlines live in `globals.css` on `[data-grid-skin='airtable']`.
 *
 * Run against the QA org (`.claude/rules/verify.md`):
 *   npx playwright test tests/e2e/unbox-sheets-select-hairlines.spec.ts --project=qa-desktop
 */

test.describe('Unbox History — sheet hairlines + click-select wash', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grids are a desktop layout');

  async function historyRows(page: Page) {
    await page.goto('/unbox');
    const rows = page.locator('[data-line-row-id]');
    const ok = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    return ok ? rows : null;
  }

  async function cellBorderBottom(loc: Locator) {
    return loc.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        width: parseFloat(cs.borderBottomWidth) || 0,
        style: cs.borderBottomStyle,
        color: cs.borderBottomColor,
      };
    });
  }

  test('airtable skin paints cell border-bottom hairlines including the select track', async ({
    page,
  }) => {
    const rows = await historyRows(page);
    if (!rows) test.skip(true, 'no Unbox History rows on this tenant');

    const grid = page.locator('[data-grid-skin="airtable"]').first();
    await expect(grid).toBeVisible({ timeout: 15_000 });

    const row = rows!.first();
    const selectCell = row.locator(':scope > *').first();
    const orderCell = row.locator('[data-col="order"]').first();
    await expect(selectCell).toBeVisible();
    await expect(orderCell).toBeVisible();
    // Body has no interactive select chrome — click-select owns the row;
    // membership paints via data-click-select-face when checked.
    await expect(row.locator('[data-select-chrome]')).toHaveCount(0);
    await expect(row.locator('[data-click-select-face="off"]')).toHaveCount(1);

    const selectBorder = await cellBorderBottom(selectCell);
    const orderBorder = await cellBorderBottom(orderCell);
    expect(selectBorder.width, 'select track must carry the sheet bottom hairline').toBeGreaterThan(
      0,
    );
    expect(selectBorder.style).not.toBe('none');
    expect(orderBorder.width, 'order cell must carry the same bottom hairline').toBeGreaterThan(0);
    expect(selectBorder.color).toBe(orderBorder.color);
    expect(selectBorder.color).not.toMatch(/rgba?\(0,\s*0,\s*0,\s*0\)/);
    expect(selectBorder.color).not.toBe('transparent');

    const rowBottom = await row.evaluate((el) => parseFloat(getComputedStyle(el).borderBottomWidth) || 0);
    expect(rowBottom).toBe(0);
  });

  test('row click washes the row and keeps cell hairlines', async ({ page }) => {
    const rows = await historyRows(page);
    if (!rows) test.skip(true, 'no Unbox History rows on this tenant');

    const row = rows!.first();
    const selectCell = row.locator(':scope > *').first();

    await expect(row).toHaveAttribute('role', 'checkbox');
    await expect(row).toHaveAttribute('aria-checked', 'false');
    await expect(row).not.toHaveClass(/bg-blue-50/);

    await row.click();
    await expect(row).toHaveAttribute('aria-checked', 'true');
    await expect(row).toHaveClass(/bg-blue-50/);
    await expect(row.locator('[data-click-select-face="on"]')).toHaveCount(1);
    await expect(page.getByTestId('receiving-workspace')).toHaveCount(0);

    const after = await cellBorderBottom(selectCell);
    expect(after.width, 'wash must not erase the select-cell bottom hairline').toBeGreaterThan(0);
    expect(after.style).not.toBe('none');

    await row.click();
    await expect(row).toHaveAttribute('aria-checked', 'false');
    await expect(row).not.toHaveClass(/bg-blue-50/);
    await expect(row.locator('[data-click-select-face="off"]')).toHaveCount(1);
  });

  test('header + body share continuous bottom hairlines under airtable', async ({ page }) => {
    const rows = await historyRows(page);
    if (!rows) test.skip(true, 'no Unbox History rows on this tenant');

    const headerRow = page.locator('[data-grid-col-header] [role="row"]').first();
    await expect(headerRow).toBeVisible({ timeout: 15_000 });
    const headerSelect = headerRow.locator(':scope > *').first();
    const bodySelect = rows!.first().locator(':scope > *').first();

    const headerBorder = await cellBorderBottom(headerSelect);
    const bodyBorder = await cellBorderBottom(bodySelect);
    expect(headerBorder.width).toBeGreaterThan(0);
    expect(bodyBorder.width).toBeGreaterThan(0);
    expect(headerBorder.color).toBe(bodyBorder.color);
  });
});
