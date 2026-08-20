import { test, expect } from '@playwright/test';

/**
 * Operations → Checks — the daily-check roster report.
 *
 * The viewer's own row is the proof everyone can see the report. That
 * assertion used to live on Home next to the checklist; it moved here with
 * the report.
 *
 * Read-only. Desktop QA org.
 */

const REPORT = '[data-testid="daily-report"]';

test.describe('Operations → Checks', () => {
  test('roster report names the viewer', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'Desktop operations surface');

    await page.goto('/operations?mode=checks');
    await expect(page.getByRole('heading', { name: "Today's roster" })).toBeVisible();
    await expect(page.locator(REPORT)).toBeVisible();
    await expect(page.locator(REPORT).getByText('(you)')).toBeVisible();
  });
});
