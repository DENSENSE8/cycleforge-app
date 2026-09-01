import { test, expect } from '@playwright/test';

/**
 * Add purchase order classify — keyboard on the inline intake band.
 *
 * Platform is a flush SearchableSelectField; Tab walks Order → Tracking.
 *
 * QA org only (global-setup handles auth).
 */
test.describe('Add purchase order — keyboard classify', () => {
  test('Tab walks Platform → Order → Tracking; typeahead selects platform', async ({
    page,
  }) => {
    await page.goto('/incoming');
    await page.getByTestId('incoming-add-purchase-order').click();
    const band = page.getByTestId('incoming-po-intake-band');
    await expect(band).toBeVisible({ timeout: 15_000 });

    const platform = band.getByTestId('po-intake-platform');
    await platform.focus();
    await expect(platform).toBeFocused();

    await page.keyboard.type('goodwill');
    await page.keyboard.press('Enter');
    await expect(platform).toContainText(/Goodwill/i);

    await page.keyboard.press('Tab');
    await expect(band.getByLabel('Order / PO #')).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(band.getByLabel('Tracking')).toBeFocused();
  });
});
