import { test, expect } from '@playwright/test';

/**
 * Unbox Sheets compare chrome — layout toggle + host mount (QA org).
 *
 * Route-mocked enough to assert chrome exists without depending on live rows.
 * Full paint/right-click prefs are covered by unit tests on the display SoT.
 */

test.describe('Unbox Sheets compare chrome', () => {
  test('split layout mounts the compare host', async ({ page }) => {
    await page.route('**/api/receiving-lines**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/unbox?clayout=split&c0=queue&c1=history');
    await expect(page.getByTestId('unbox-compare-host')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('unbox-compare-chrome')).toBeVisible();
    await expect(page.getByTestId('receiving-compare-pane-a')).toBeVisible();
    await expect(page.getByTestId('receiving-compare-pane-b')).toBeVisible();
  });

  test('layout toggle can switch to quad', async ({ page }) => {
    await page.route('**/api/receiving-lines**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0 }),
      });
    });

    await page.goto('/unbox');
    const chrome = page.getByTestId('unbox-compare-chrome');
    await expect(chrome).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('unbox-compare-layout-menu').getByRole('button').click();
    await page.getByRole('option', { name: '4 panes' }).click();
    await expect(page).toHaveURL(/clayout=quad/);
    await expect(page.getByTestId('unbox-compare-host')).toBeVisible();
  });
});
