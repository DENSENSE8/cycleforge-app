import { test, expect } from '@playwright/test';

/**
 * Add purchase order — table XOR record walk (exceptions / Labels chrome).
 *
 * QA org only (global-setup handles auth).
 */
test.describe('Add purchase order walk', () => {
  test('opens the desk form beside the kind rail', async ({ page }) => {
    await page.goto('/incoming');
    await page.getByTestId('incoming-add-purchase-order').click();

    await expect(page.getByTestId('incoming-add-walk')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('add-inbound-form')).toBeVisible();
    await expect(page.getByTestId('incoming-add-kind-po')).toBeVisible();
    await expect(page.getByTestId('data-table-toolbar')).toHaveCount(0);
  });

  test('return is a rail row on the same walk', async ({ page }) => {
    await page.goto('/incoming');
    await page.getByTestId('incoming-add-purchase-order').click();
    await expect(page.getByTestId('incoming-add-walk')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('incoming-add-kind-return').click();
    await expect(page.getByTestId('add-inbound-form').getByLabel('RMA / return id')).toBeVisible();
  });

  test('the header CTA toggles the walk off', async ({ page }) => {
    await page.goto('/incoming');

    const add = page.getByTestId('incoming-add-purchase-order');
    await add.getByRole('button', { name: 'Add purchase order' }).click();
    await expect(page.getByTestId('incoming-add-walk')).toBeVisible({ timeout: 15_000 });

    await add.getByRole('button', { name: 'Close add purchase order' }).click();
    await expect(page.getByTestId('incoming-add-walk')).toHaveCount(0);
    await expect(page.getByTestId('data-table-toolbar')).toBeVisible();
  });
});
