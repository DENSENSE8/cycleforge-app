import { test, expect } from '@playwright/test';

/**
 * Add purchase order — inline intake band under the Incoming grid.
 *
 * Predictive UX contract:
 *   - Header CTA opens the band (same card width as the table)
 *   - Band can close and reopen immediately
 *   - Right rail is NOT claimed for create
 */
test.describe('Incoming PO intake band', () => {
  test('opens under the table, closes cleanly, reopens', async ({ page }) => {
    await page.goto('/incoming');
    await page.getByTestId('incoming-add-purchase-order').click();

    const band = page.getByTestId('incoming-po-intake-band');
    await expect(band).toBeVisible({ timeout: 15_000 });
    await expect(band.getByText('Add purchase order').first()).toBeVisible();
    await expect(page.getByTestId('po-intake-confirm')).toBeVisible();

    // Create no longer occupies the right rail.
    await expect(page.locator('aside[role="region"][aria-label="Add inbound purchase or return"]')).toHaveCount(0);

    await band.getByLabel('Close add purchase order').click();
    await expect(band).toBeHidden({ timeout: 10_000 });

    await page.getByTestId('incoming-add-purchase-order').click();
    await expect(page.getByTestId('incoming-po-intake-band')).toBeVisible({ timeout: 15_000 });
  });

  test('confirm stays disabled until qty + tracking + order are set', async ({ page }) => {
    await page.goto('/incoming');
    await page.getByTestId('incoming-add-purchase-order').click();
    const band = page.getByTestId('incoming-po-intake-band');
    await expect(band).toBeVisible({ timeout: 15_000 });

    const confirm = band.getByTestId('po-intake-confirm');
    await expect(confirm).toBeDisabled();

    await band.getByLabel('Order / PO #').fill('111-222-333');
    await band.getByLabel('Tracking').fill('1Z999AA10123456784');
    // First line: SKU + qty (flush TextField uses the floating label as accessible name).
    const sku = band.getByLabel('SKU').first();
    const qty = band.getByLabel('Qty').first();
    await sku.fill('SKU-TEST-1');
    await qty.fill('2');

    await expect(confirm).toBeEnabled({ timeout: 5_000 });
  });

  test('can add a second line and another order chip', async ({ page }) => {
    await page.goto('/incoming');
    await page.getByTestId('incoming-add-purchase-order').click();
    const band = page.getByTestId('incoming-po-intake-band');
    await expect(band).toBeVisible({ timeout: 15_000 });

    await band.getByTestId('po-intake-add-line').click();
    await expect(band.getByLabel('Line items').locator('li')).toHaveCount(2);

    await band.getByTestId('po-intake-add-order').click();
    await expect(band.getByTestId('po-intake-order-chip-1')).toBeVisible();
    await expect(band.getByText(/2 orders/)).toBeVisible();
  });
});
