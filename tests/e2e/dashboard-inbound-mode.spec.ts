import { test, expect } from '@playwright/test';

/**
 * Inbound desk · History lane (former Dashboard inbound / Receiving Board).
 *
 * The desk's two LANES are its tab row (operator 2026-09-14): **Inbound** is
 * bare `/incoming`, **History** is `?lane=docked` — the landed-activity trail,
 * which serves the SAME product history as Unbox History (`view=activity`).
 * Load-bearing guarantee: inbound cartons never intermix with outbound order
 * tables. Legacy `/dashboard?mode=inbound` redirects here.
 *
 * ## What this spec stopped asserting (2026-09-14)
 *
 * It required `Arrival` and `Unbox` facet buttons on this lane. That sort-axis
 * switcher (`DASHBOARD_RECEIVING_TABS` in `inbound-docked-tabs.ts`) lost its
 * last mount in the table-display teardown (`c5422f097`) and has had **no
 * importer in `src/`** since, so the assertions were pinning a UI that cannot
 * render. The lane's ordering now rides the shared sort control.
 */

test.describe('inbound desk history lane', () => {
  test('History is a tab on the desk, not a hand-typed param', async ({ page }) => {
    await page.goto('/incoming');

    const tabs = page.getByRole('tab');
    await expect(tabs.filter({ hasText: 'Inbound' })).toHaveAttribute('aria-selected', 'true');

    const history = tabs.filter({ hasText: 'History' });
    await expect(history).toBeVisible();
    await history.click();

    await expect(page).toHaveURL(/lane=docked/);
    await expect(history).toHaveAttribute('aria-selected', 'true');

    // Back to the default lane DROPS the param — it never becomes lane=pipeline.
    await tabs.filter({ hasText: 'Inbound' }).click();
    await expect(page).not.toHaveURL(/lane=/);

    // The retired parent pair must not come back under either label.
    await expect(page.getByRole('button', { name: 'Docked', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pipeline', exact: true })).toHaveCount(0);
  });

  test('serves the product history feed, not outbound orders', async ({ page }) => {
    const feeds: string[] = [];
    page.on('request', (r) => {
      const url = r.url();
      if (url.includes('/api/receiving-lines')) feeds.push(url);
    });

    await page.goto('/incoming?lane=docked');

    await expect(page.getByPlaceholder(/^Filter /)).toBeVisible();

    // `view=activity` is history's own feed — Unbox-touched work. Under `all`
    // the incoming POs leak in (receiving-modes.ts), which is the bug this
    // assertion exists to catch.
    await expect
      .poll(() => feeds.some((u) => u.includes('view=activity')), { timeout: 15_000 })
      .toBe(true);
    expect(feeds.some((u) => u.includes('view=incoming'))).toBe(false);

    await expect(page.getByRole('button', { name: 'Packed', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Shipped', exact: true })).toHaveCount(0);
  });

  test('a row opens the History triage rail, like Unbox History', async ({ page }) => {
    await page.goto('/incoming?lane=docked');

    const row = page.locator('[data-line-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.click();

    // `detail:history` — the same occupant Unbox History opens. Before the desk
    // mounted HistoryTriageMount this click dispatched into no listener at all.
    await expect(page.getByLabel(/^History triage for /)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/lane=docked/);
  });

  test('legacy dashboard inbound redirects to the History lane', async ({ page }) => {
    await page.goto('/dashboard?mode=inbound&sort=scanned_newest');
    await expect(page).toHaveURL(/\/incoming/);
    await expect(page).toHaveURL(/lane=docked/);
    await expect(page).toHaveURL(/sort=scanned_newest/);
  });

  test('outbound domain is unaffected — no inbound facets leak onto the desk', async ({ page }) => {
    // `/dashboard` is a legacy path that 307s to `/shipping/orders` (verified
    // 2026-09-14). This used to assert a `button` named "Packed", which stopped
    // existing when the dashboard became the Shipping DESK: its lanes are now
    // `tab` roles named Pending · To ship · Amazon Prep · Shipped · Exceptions.
    // The assertion had been failing on that rename, not on any inbound change.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/shipping\/orders/);

    const tabs = page.getByRole('tab');
    await expect(tabs.filter({ hasText: 'To ship' })).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.filter({ hasText: 'Pending' })).toBeVisible();

    // The load-bearing half: inbound vocabulary must never appear on an
    // outbound desk, in EITHER role — that is the domain bleed this guards.
    await expect(page.getByRole('button', { name: 'Arrival', exact: true })).toHaveCount(0);
    await expect(tabs.filter({ hasText: 'Arrival' })).toHaveCount(0);
    await expect(tabs.filter({ hasText: 'History' })).toHaveCount(0);
  });
});
