import { test, expect } from '@playwright/test';

/**
 * Shipped · All layout must paint rows (or a teaching empty) inside a non-zero
 * scroll viewport. Regression guard for the card-wrapped list collapsing to 0px
 * height (virtualizer then renders nothing).
 *
 * Desktop-only: mobile user agents route to /m/* surfaces, not the dashboard table.
 */
test('shipped all layout paints a scrollable table body', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Shipped All column table is a desktop dashboard surface');
  await page.goto('/dashboard?shipped=&layout=all', { waitUntil: 'domcontentloaded' });

  const body = page.locator('[data-testid="column-table-body"]:visible');
  await expect(body).toBeVisible({ timeout: 45_000 });

  await expect
    .poll(async () => body.evaluate((el) => el.clientHeight), { timeout: 15_000 })
    .toBeGreaterThan(120);

  const hasRows = await page.locator('[data-index]').count();
  const hasSkeleton = await page.locator('[data-testid="column-table-body"]:visible .animate-pulse').count();
  const hasEmpty = await page.getByText(/No shipped records for this week/i).count();

  expect(hasRows + hasSkeleton + hasEmpty).toBeGreaterThan(0);
});