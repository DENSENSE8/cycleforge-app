import { test, expect } from '@playwright/test';

/**
 * Slot-action overlay v1 — To-ship tracking hover Label starts LabelRunBand.
 * Does not open the paperwork walk (`?paperwork=`).
 */

test.describe('To-ship · tracking hover Label run', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'compound identity is a desktop layout');

  test('hover tracking (or empty dash) → Label → band under the row', async ({ page }) => {
    await page.goto('/shipping/orders');
    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });

    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const fulfillment = row.locator('[data-col="fulfillment"]');
    await expect(fulfillment).toBeVisible();

    const hoverTrigger = fulfillment.locator('div.group.relative.inline-flex').last();
    await hoverTrigger.hover();

    const labelItem = page.getByRole('menuitem', { name: 'Label' });
    await expect(labelItem).toBeVisible({ timeout: 8_000 });
    await labelItem.click();

    await expect(page.getByTestId('label-run-band')).toBeVisible();
    expect(new URL(page.url()).searchParams.has('paperwork')).toBe(false);
    await expect(page.getByRole('menuitem', { name: 'Label' })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('label-run-band')).toHaveCount(0);
  });
});
