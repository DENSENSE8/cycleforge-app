import { test, expect } from '@playwright/test';

/**
 * Header find — outside click / Escape dismisses the centered ⌘K dialog.
 *
 *   npx playwright test tests/e2e/global-find-click-off.spec.ts --project=qa-desktop
 */

const FIND = '[data-testid="global-find-field"]';
const INPUT = '[data-testid="global-find-input"]';
const CMDK = '[cmdk-root]';

test.describe('header find — click-off closes the dialog', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'header find is desktop chrome');

  test('opens on icon click and closes on outside click', async ({ page }) => {
    await page.goto('/unbox', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(FIND)).toBeVisible({ timeout: 45_000 });

    await page.locator(FIND).click();
    await expect(page.locator(INPUT)).toBeVisible();
    await expect(page.locator(CMDK).first()).toBeVisible();

    await page.locator('[data-radix-dialog-overlay]').click({ position: { x: 8, y: 8 } });

    await expect(page.locator(INPUT)).toHaveCount(0);
  });

  test('Escape also closes the dialog', async ({ page }) => {
    await page.goto('/unbox', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(FIND)).toBeVisible({ timeout: 45_000 });

    await page.locator(FIND).click();
    await expect(page.locator(INPUT)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator(INPUT)).toHaveCount(0);
  });
});
