import { test, expect } from '@playwright/test';

/**
 * Admin inventory DataTable migration smoke.
 *
 * Hits an authenticated RSC admin inventory page and asserts the house
 * DataTable surface (`[data-table-surface]`) rendered — empty or populated.
 * Auth comes from the default desktop `storageState` (admin.json).
 */

test.describe('Admin inventory DataTable', () => {
  test('holds page mounts a DataTable surface', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'Desktop admin surface');

    await page.goto('/admin/inventory/holds');
    await expect(page.getByRole('heading', { name: 'Holds' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Units on hold' })).toBeVisible();
    await expect(page.locator('[data-table-surface]').first()).toBeVisible();
  });
});
