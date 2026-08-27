import { test, expect } from '@playwright/test';

/**
 * Header find — click-off dismisses the Search-by picker.
 *
 * The panel stays open while either `focused` or `hoverHeld` is true. Outside
 * click used to clear only focus, so the hover-leave delay (or a stuck
 * hoverHeld) left "Search by" painted over the page. Pins that both gates
 * clear on dismiss.
 *
 *   npx playwright test tests/e2e/global-find-click-off.spec.ts --project=qa-desktop
 */

const FIND = '[data-testid="global-find-field"]';
const METHODS = '[data-testid="global-search-by-methods"]';

test.describe('header find — click-off closes Search by', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'header find is desktop chrome');

  test('Search by opens on focus and closes on outside click', async ({ page }) => {
    await page.goto('/unbox', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(FIND)).toBeVisible({ timeout: 45_000 });

    await page.locator(FIND).locator('input').click();
    await expect(page.locator(METHODS)).toBeVisible();
    await expect(page.getByText('Search by', { exact: true })).toBeVisible();

    // Click the main work surface — not the find cell or the portaled panel.
    await page.locator('main').first().click({ position: { x: 40, y: 40 }, force: true });

    await expect(page.locator(METHODS)).toHaveCount(0);
  });

  test('Escape also closes Search by', async ({ page }) => {
    await page.goto('/unbox', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(FIND)).toBeVisible({ timeout: 45_000 });

    await page.locator(FIND).locator('input').click();
    await expect(page.locator(METHODS)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator(METHODS)).toHaveCount(0);
  });
});
