import { test, expect } from '@playwright/test';

/**
 * Add purchase order — keyboard through the shared inspector.
 *
 * Amazon is the default source; Tab walks Order → SKU/item → Quantity.
 *
 * QA org only (global-setup handles auth).
 */
test.describe('Add purchase order — keyboard quick add', () => {
  test('focus starts on order and Tab walks the two required fields', async ({ page }) => {
    await page.goto('/incoming');
    await page.getByTestId('incoming-add-purchase-order').click();
    const form = page.getByTestId('add-inbound-form');
    await expect(form).toBeVisible({ timeout: 15_000 });

    const order = form.getByLabel('Amazon order #');
    const item = form.getByLabel('SKU or item name');
    await expect(order).toBeFocused();

    await order.fill('111-222-333');
    await page.keyboard.press('Tab');
    await expect(item).toBeFocused();

    await item.fill('SKU-TEST-1');
    await page.keyboard.press('Tab');
    await expect(form.getByLabel('Quantity')).toBeFocused();
    await expect(form.getByTestId('add-inbound-submit')).toBeEnabled();
  });
});
