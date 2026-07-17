import { test, expect } from '@playwright/test';

/**
 * Dashboard · Inbound mode (FOH/BOH split, plan 04).
 *
 * Inbound History lives at `/dashboard?mode=inbound` as its own domain: the
 * carton lifecycle facets (Unboxed · Scanned) over the receiving activity trail.
 * The load-bearing guarantee is that inbound cartons never intermix with the
 * outbound order tables — so this asserts both what renders AND what must not.
 */

test.describe('dashboard inbound mode', () => {
  test('renders the inbound facets over the carton trail, not outbound orders', async ({ page }) => {
    const feeds: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (url.includes('/api/receiving-lines')) feeds.push(url);
    });

    await page.goto('/dashboard?mode=inbound');

    // Chrome: both lifecycle facets, from HISTORY_SORT_OPTIONS.
    await expect(page.getByRole('button', { name: 'Unboxed', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scanned', exact: true })).toBeVisible();

    // The relocated search box (was the sidebar's ReceivingHistorySearchSection).
    await expect(page.getByPlaceholder(/^Filter /)).toBeVisible();

    // The table asked for the History feed (view=activity) — the same feed
    // `/receiving/history` mounts, never an outbound orders query.
    await expect
      .poll(() => feeds.some((u) => u.includes('view=activity')), { timeout: 15_000 })
      .toBe(true);

    // Domain isolation: the outbound lifecycle tabs must be absent here.
    await expect(page.getByRole('button', { name: 'Packed', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Shipped', exact: true })).toHaveCount(0);
  });

  test('switching a facet writes the sort axis and keeps the default clean', async ({ page }) => {
    await page.goto('/dashboard?mode=inbound');

    await page.getByRole('button', { name: 'Scanned', exact: true }).click();
    await expect(page).toHaveURL(/sort=scanned_newest/);

    // Unboxed is the implicit default — it drops out of the URL.
    await page.getByRole('button', { name: 'Unboxed', exact: true }).click();
    await expect(page).not.toHaveURL(/sort=/);
    await expect(page).toHaveURL(/mode=inbound/);
  });

  test('outbound domain is unaffected', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('button', { name: 'Packed', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unboxed', exact: true })).toHaveCount(0);
  });
});
