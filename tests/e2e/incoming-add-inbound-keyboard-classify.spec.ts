import { test, expect } from '@playwright/test';

/**
 * Add Inbound classify band — keyboard-only navigation.
 *
 * Root Index → Add PO leaf. Platform · Priority are flush SearchableSelectField
 * comboboxes (Type is chosen by the index row, not a third combobox).
 *
 * QA org only (global-setup handles auth).
 */
test.describe('Add inbound classify — keyboard only', () => {
  const OVERLAY = 'aside[role="region"][aria-label="Add inbound purchase or return"]';

  test('index → Add PO; Tab walks Platform → Priority; typeahead + Enter selects each', async ({
    page,
  }) => {
    await page.goto('/incoming');
    await page.getByRole('button', { name: 'Add inbound purchase or return' }).click();
    const overlay = page.locator(OVERLAY);
    await expect(overlay).toBeVisible();

    // Root Index — pick Add PO.
    await expect(overlay.getByTestId('station-displays-index')).toBeVisible();
    await overlay.getByTestId('station-displays-index-add-po').click();

    const platform = overlay.getByTestId('add-inbound-platform');
    const priority = overlay.getByTestId('add-inbound-priority');

    await platform.focus();
    await expect(platform).toBeFocused();

    // Platform — typeahead opens the list, filter, Enter picks Goodwill.
    await page.keyboard.type('goodwill');
    await page.keyboard.press('Enter');
    await expect(platform).toContainText(/Goodwill/i);
    await expect(platform).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(priority).toBeFocused();

    // Leave Priority on Auto — filter + Enter should still commit the row.
    await page.keyboard.type('auto');
    await page.keyboard.press('Enter');
    await expect(priority).toContainText(/Auto/i);
    await expect(priority).toBeFocused();

    // Next Tab lands on the order identity field (Goodwill label after platform swap).
    await page.keyboard.press('Tab');
    await expect(overlay.getByLabel(/Goodwill order/i)).toBeFocused();

    // Back returns to the two-row index.
    await overlay.getByRole('button', { name: 'Back to methods' }).click();
    await expect(overlay.getByTestId('station-displays-index-add-return')).toBeVisible();
  });
});
