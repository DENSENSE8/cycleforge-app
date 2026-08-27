/**
 * Global Header Add — must paint in the beam actions zone and open/close.
 *
 * Run: `npx playwright test tests/e2e/global-header-add-menu.spec.ts --project=qa-desktop`
 */

import { test, expect } from '@playwright/test';

test.describe('Global Header Add menu', () => {
  test('Add lives in header actions and opens parent → child dropdown', async ({ page }) => {
    await page.goto('/incoming');

    const actions = page.locator('[data-header-zone="actions"]');
    await expect(actions).toBeVisible({ timeout: 20_000 });

    const add = actions.getByTestId('global-header-add');
    await expect(add).toBeVisible({ timeout: 15_000 });
    await expect(add).toHaveAttribute('aria-label', 'Add');

    // Left of goal chip (work-orders / pace ring) when both are present.
    const goal = actions.locator('button').filter({ hasText: /^\d+$/ }).first();
    if (await goal.isVisible().catch(() => false)) {
      const addBox = await add.boundingBox();
      const goalBox = await goal.boundingBox();
      expect(addBox && goalBox).toBeTruthy();
      expect(addBox!.x).toBeLessThan(goalBox!.x);
    }

    // Open
    await add.click();
    const menu = page.getByTestId('global-header-add-menu');
    await expect(menu).toBeVisible({ timeout: 5_000 });
    await expect(add).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('global-add-group-outbound')).toBeVisible();
    await expect(page.getByTestId('global-add-group-inbound')).toBeVisible();

    // Parent → child
    await page.getByTestId('global-add-group-outbound').hover();
    await expect(page.getByTestId('global-add-submenu-outbound')).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId('global-add-orders-manual')).toBeVisible();

    // Close via Escape
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden({ timeout: 5_000 });
    await expect(add).toHaveAttribute('aria-expanded', 'false');

    // Re-open then close by clicking outside
    await add.click();
    await expect(menu).toBeVisible({ timeout: 5_000 });
    await page.locator('main').click({ position: { x: 40, y: 40 }, force: true });
    await expect(menu).toBeHidden({ timeout: 5_000 });
  });
});
