import { test, expect } from '@playwright/test';

/**
 * Receiving collection surfaces and their action planes
 * (`display/workbench.md` → Action planes):
 *
 *   • `/incoming` + standalone `/receiving/history` — two planes:
 *       row body → RECORD; select gutter → MULTI-SELECT
 *   • `/unbox` History (embedded) — click-select golden:
 *       plain click → MULTI-SELECT; double-click → RECORD
 *       (decorative select-track check face; row owns toggle)
 *
 * They used to collapse into one gesture. `useReceivingLineBulkSelection` pins
 * `selectMode` ON for every `isTableOnlyMode` surface, and `handleSelectRow`
 * read `selectMode` as "bulk mode — never open".
 *
 * Run against the QA org (`.claude/rules/verify.md`):
 *   npx playwright test tests/e2e/receiving-row-planes.spec.ts --project=qa-desktop
 */

test.describe('Receiving row action planes', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'receiving grids are a desktop layout');

  async function firstRow(page: import('@playwright/test').Page) {
    const rows = page.locator('[data-line-row-id]');
    const ok = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    return ok ? rows : null;
  }

  test('History: the row body opens the carton READ record, not /unbox', async ({ page }) => {
    await page.goto('/receiving/history');
    const rows = await firstRow(page);
    if (!rows) test.skip(true, 'no History rows on this tenant');

    const row = rows!.first();
    const lineId = await row.getAttribute('data-line-row-id');

    // Standalone History keeps the two-plane gutter law.
    await expect(row).toHaveAttribute('role', 'button');
    await expect(row).toHaveAttribute('aria-label', `Open receiving line ${lineId}`);

    await row.locator('[data-col="title"]').click();

    await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/carton\/\d+$/);
    expect(new URL(page.url()).pathname).not.toContain('/unbox');
  });

  test('History: the gutter checkbox does bulk WITHOUT navigating', async ({ page }) => {
    await page.goto('/receiving/history');
    const rows = await firstRow(page);
    if (!rows) test.skip(true, 'no History rows on this tenant');

    const before = page.url();
    const box = rows!.first().getByRole('checkbox').first();
    await expect(box).toHaveAttribute('aria-checked', 'false');

    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    expect(page.url()).toBe(before);

    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'false');
  });

  test('Unbox History: click selects; double-click opens workspace', async ({ page }) => {
    await page.goto('/unbox');
    const rows = await firstRow(page);
    if (!rows) test.skip(true, 'no Unbox workbench rows on this tenant');

    const row = rows!.first();
    const lineId = await row.getAttribute('data-line-row-id');

    await expect(row).toHaveAttribute('role', 'checkbox');
    await expect(row).toHaveAttribute('aria-label', `Select receiving line ${lineId}`);
    await expect(row.locator('[data-select-chrome]')).toHaveCount(0);

    // Header still owns select-all on the select track.
    const header = page.locator('[data-grid-col-header]');
    await expect(header.getByRole('checkbox', { name: /Select all/i }).first()).toBeVisible();

    await row.click();
    await expect(row).toHaveAttribute('aria-checked', 'true');
    await expect(row).toHaveClass(/bg-blue-50/);
    await expect(page.getByTestId('receiving-workspace')).toHaveCount(0);

    await row.dblclick();
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/openReceivingId=\d+/);
  });
});
