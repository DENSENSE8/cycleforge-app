import { test, expect } from '@playwright/test';

/**
 * Add purchase order — intake band lifecycle (replaced the right-rail Add overlay).
 *
 * Predictive UX contract:
 *   - Header CTA opens the inline band under the grid
 *   - Band closes cleanly (no orphaned right-rail create)
 *   - Reopen works immediately
 *
 * QA org only (global-setup handles auth).
 */
test.describe('Add purchase order intake lifecycle', () => {
  test('opens band, closes cleanly, reopens', async ({ page }) => {
    await page.goto('/incoming');
    await page.getByTestId('incoming-add-purchase-order').click();

    const band = page.getByTestId('incoming-po-intake-band');
    await expect(band).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('aside[role="region"][aria-label="Add inbound purchase or return"]'),
    ).toHaveCount(0);

    await band.getByLabel('Close add purchase order').click();
    await expect(band).toBeHidden({ timeout: 10_000 });

    await page.getByTestId('incoming-add-purchase-order').click();
    await expect(page.getByTestId('incoming-po-intake-band')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('inspector Column display stays independent of intake band', async ({ page }) => {
    await page.goto('/incoming');

    await page.getByTestId('incoming-inspector-toggle').click();
    await expect(page.getByText('Column display')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('incoming-add-purchase-order').click();
    await expect(page.getByTestId('incoming-po-intake-band')).toBeVisible({
      timeout: 15_000,
    });
    // Create no longer steals the right edge — Column display can stay up.
    await expect(page.getByText('Column display')).toBeVisible();

    await page.getByTestId('incoming-po-intake-band').getByLabel('Close add purchase order').click();
    await expect(page.getByTestId('incoming-po-intake-band')).toBeHidden({
      timeout: 10_000,
    });
  });
});
