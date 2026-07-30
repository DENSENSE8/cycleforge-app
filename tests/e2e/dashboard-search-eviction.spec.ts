import { test, expect } from '@playwright/test';

/**
 * Search left `/dashboard` — the redirect + surface contract (Phase 1 of
 * `docs/todo/dashboard-ia-rework-PLAN.md`).
 *
 * Replaces `dashboard-search-order-detail.spec.ts` and
 * `dashboard-search-exact-open.spec.ts`, both of which asserted the mode-local
 * `SearchOrderDetailShell` — a third way to look at an order, deleted with the
 * mode. What replaced them is the thing worth guarding: `?mode=search` was a
 * bookmarkable URL, so every shape it could carry must still land somewhere
 * honest.
 *
 * Deliberately **fixture-free and shape-based**: every assertion here is about
 * the URL contract, not about which rows the tenant happens to have today. That
 * is why it can run on the QA project without seeding anything (`verify.md` —
 * "E2E asserts against the QA org, not the dogfood tenant").
 */

const isMobile = () => test.info().project.name === 'mobile';

test.describe('Search eviction from /dashboard', () => {
  test('bare ?mode=search redirects to the default dashboard domain', async ({ page }) => {
    await page.goto('/dashboard?mode=search');
    await expect(page).toHaveURL(/\/dashboard(?!.*mode=search)/);
    await page.waitForURL((url) => !url.searchParams.has('mode'), { timeout: 15_000 });
  });

  test('?mode=search&q= carries the query to the /search route', async ({ page }) => {
    await page.goto('/dashboard?mode=search&q=bose%20remote&map=search');
    await page.waitForURL(/\/search\?/, { timeout: 15_000 });
    const url = new URL(page.url());
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('q')).toBe('bose remote');
    // The retired mode's own params do not survive the move.
    expect(url.searchParams.has('mode')).toBe(false);
    expect(url.searchParams.has('map')).toBe(false);
  });

  test('?mode=search&openOrderId= lands on the one order shell', async ({ page }) => {
    await page.goto('/dashboard?mode=search&openOrderId=2902&map=search&q=2902');
    await page.waitForURL(/\/o\/2902(\?|$)/, { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/o/2902');
  });

  test('/search renders the cross-entity surface, not a dashboard grid', async ({ page }) => {
    await page.goto('/search');
    // Empty-query state teaches rather than showing a bare blank or a 404.
    await expect(page.getByText(/search everything/i)).toBeVisible({ timeout: 15_000 });
    // It is its own route — it must not bounce back into a dashboard mode.
    expect(new URL(page.url()).pathname).toBe('/search');
  });

  test('the dashboard page list no longer offers a Search mode', async ({ page }) => {
    test.skip(isMobile(), 'the spine page list is a desktop-chrome surface');
    await page.goto('/dashboard?unshipped=');
    await page.waitForLoadState('domcontentloaded');

    const showSidebar = page.getByRole('button', { name: /show sidebar/i });
    if (await showSidebar.isVisible().catch(() => false)) await showSidebar.click();

    const pages = page.getByRole('menu', { name: 'Pages' });
    await expect(pages).toBeVisible({ timeout: 15_000 });

    // On dashboard the active page row auto-expands its L2 modes in the spine.
    await expect(pages.getByRole('button', { name: /^shipping$/i })).toHaveCount(1);
    await expect(pages.getByRole('button', { name: /^receiving$/i })).toHaveCount(1);
    await expect(pages.getByRole('button', { name: /^search$/i })).toHaveCount(0);
  });

  test('the inbound domain renders a context panel instead of an empty column', async ({ page }) => {
    test.skip(isMobile(), 'the 360px context column is desktop-only');
    await page.goto('/dashboard?mode=inbound&sort=scanned_newest');
    await page.waitForLoadState('domcontentloaded');
    // Recents fill the void the inbound panel's `return null` used to leave.
    // Shape-based: either the list or its teaching empty proves the panel mounted.
    const panel = page.getByLabel(/^recents$/i).or(page.getByText(/nothing opened yet/i));
    await expect(panel.first()).toBeVisible({ timeout: 15_000 });
  });
});
