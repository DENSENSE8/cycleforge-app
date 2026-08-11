import { test, expect } from '@playwright/test';

/**
 * Inbound desk · Docked lane (former Dashboard inbound / Receiving Board).
 *
 * Docked lives at `/incoming?lane=docked`: Arrival · Unbox facets over the
 * receiving activity trail. Load-bearing guarantee: inbound cartons never
 * intermix with outbound order tables. Legacy `/dashboard?mode=inbound`
 * redirects here.
 */

test.describe('inbound desk docked lane', () => {
  test('renders Docked facets over the carton trail, not outbound orders', async ({ page }) => {
    const feeds: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (url.includes('/api/receiving-lines')) feeds.push(url);
    });

    await page.goto('/incoming?lane=docked');

    // Docked URL keeps Arrival | Unbox on Band-1 (Pipeline|Docked parent deleted).
    await expect(page.getByRole('button', { name: 'Docked', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pipeline', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Arrival', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unbox', exact: true })).toBeVisible();

    await expect(page.getByPlaceholder(/^Filter /)).toBeVisible();

    await expect
      .poll(() => feeds.some((u) => u.includes('view=activity')), { timeout: 15_000 })
      .toBe(true);

    await expect(page.getByRole('button', { name: 'Packed', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Shipped', exact: true })).toHaveCount(0);
  });

  test('switching a facet writes the sort axis and keeps the default clean', async ({ page }) => {
    await page.goto('/incoming?lane=docked');

    await page.getByRole('button', { name: 'Arrival', exact: true }).click();
    await expect(page).toHaveURL(/sort=scanned_newest/);
    await expect(page).toHaveURL(/lane=docked/);

    // Unbox is the implicit history default — it drops sort out of the URL.
    await page.getByRole('button', { name: 'Unbox', exact: true }).click();
    await expect(page).not.toHaveURL(/sort=/);
    await expect(page).toHaveURL(/lane=docked/);
  });

  test('legacy dashboard inbound redirects to Docked', async ({ page }) => {
    await page.goto('/dashboard?mode=inbound&sort=scanned_newest');
    await expect(page).toHaveURL(/\/incoming/);
    await expect(page).toHaveURL(/lane=docked/);
    await expect(page).toHaveURL(/sort=scanned_newest/);
  });

  test('outbound domain is unaffected', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: 'Packed', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Arrival', exact: true })).toHaveCount(0);
  });
});
