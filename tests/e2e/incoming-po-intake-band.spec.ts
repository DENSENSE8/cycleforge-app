import { test, expect } from '@playwright/test';

/**
 * Add purchase order — desk triage cards on the record walk.
 */
test.describe('Incoming PO quick add', () => {
  test('opens the purchase form from the header CTA', async ({ page }) => {
    await page.goto('/incoming');
    await page.getByTestId('incoming-add-purchase-order').click();

    const form = page.getByTestId('add-inbound-form');
    await expect(form).toBeVisible({ timeout: 15_000 });
    await expect(form.getByLabel('Amazon order #')).toBeFocused();
    await expect(form.getByLabel('SKU or item name')).toBeVisible();
    await expect(form.getByLabel('Quantity')).toHaveValue('1');
    await expect(page.getByTestId('incoming-first-paint')).toHaveCount(0);
  });

  test('needs only order and item for a purchase', async ({ page }) => {
    await page.goto('/incoming');
    await page.getByTestId('incoming-add-purchase-order').click();
    const form = page.getByTestId('add-inbound-form');
    await expect(form).toBeVisible({ timeout: 15_000 });

    const confirm = form.getByTestId('add-inbound-submit');
    await expect(confirm).toBeDisabled();

    await form.getByLabel('Amazon order #').fill('111-222-333');
    await form.getByLabel('SKU or item name').fill('SKU-TEST-1');

    await expect(confirm).toBeEnabled({ timeout: 5_000 });
  });
});
