import { test, expect } from '@playwright/test';

/**
 * Dashboard Search mode — exact order match opens the full detail panel, never
 * a results list (desktop project).
 *
 * The regression this guards: an identifier / order-# query used to mount the
 * cross-entity `SearchResultsSurface` list while three racing effects resolved
 * the exact order, so the operator saw list → detail flash. Resolution now has
 * a single owner (`useDashboardSearchOrder`) with a `resolving` spinner, so an
 * exact match goes spinner → detail and the results-list count line never
 * mounts in the main pane.
 *
 * Env:
 *   PW_SEARCH_ORDER_ID – a resolvable (non-FBA) order id to search (default 2902)
 */

const ORDER_ID = Number(
  process.env.PW_SEARCH_ORDER_ID ||
    process.env.PW_FULLPAGE_ORDER_ID ||
    process.env.PW_TRACKING_ORDER_ID ||
    '2902',
);

const isMobile = () => test.info().project.name === 'mobile';

/** The main-pane results-list count line, e.g. `2 results for “2902” · keyword`. */
const resultsCountLine = /results? for [“"]/i;

test.describe('Dashboard Search order detail', () => {
  test('an exact order # query opens the detail panel, not the results list', async ({
    page,
  }) => {
    test.skip(isMobile(), 'desktop search sidebar + detail flow');

    await page.goto(`/dashboard?mode=search&q=${ORDER_ID}`);

    const main = page.locator('main');

    // Settles on the single-lane Search order detail (uniform section tabs),
    // Overview selected by default and carrying the at-a-glance facts.
    const overviewTab = main.getByRole('tab', { name: 'Overview' });
    await expect(overviewTab).toBeVisible({ timeout: 25_000 });
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    await expect(main.getByRole('tab', { name: 'Shipping' })).toBeVisible();
    await expect(main.getByRole('tab', { name: 'Timeline' })).toBeVisible();
    // Identity bookmark (station entity-context chrome) + two-column Overview
    // (packing-photos-first main column + side meta).
    await expect(main.getByTestId('search-order-context-bar')).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Packing photos' })).toBeVisible();
    await expect(main.getByRole('heading', { name: 'Product' })).toBeVisible();

    // The cross-entity results list never took over the main pane (scoped to
    // <main> — the global header dropdown + sidebar map legitimately count).
    await expect(main.getByText(resultsCountLine)).toHaveCount(0);

    // The URL still targets this order (openOrderId canonical, or the identifier
    // query the hook re-resolves from) — never bounced to a bare list.
    await expect(page).toHaveURL(new RegExp(`(openOrderId=${ORDER_ID}|q=${ORDER_ID})`));
    // And the detail persists — it does not get replaced by the results list.
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
    await expect(main.getByTestId('search-order-context-bar')).toBeVisible();
  });

  test('the exact-match load never flashes the results list', async ({ page }) => {
    test.skip(isMobile(), 'desktop search sidebar + detail flow');

    // Watch the whole load window: the results count line must not appear at
    // any point between navigation and the detail settling.
    let sawResultsList = false;
    await page.exposeFunction('__markResultsList', () => {
      sawResultsList = true;
    });

    await page.goto(`/dashboard?mode=search&q=${ORDER_ID}`, { waitUntil: 'commit' });

    // Poll the DOM aggressively while the detail resolves; flag any moment the
    // main pane's results-list count line is present (scoped to <main> — the
    // header dropdown + sidebar map count legitimately).
    const poll = page.waitForFunction(() => {
      const root = document.querySelector('main');
      if (!root) return false;
      const flashed = Array.from(root.querySelectorAll('p, span, div')).some((el) =>
        /results? for [“"]/i.test(el.textContent ?? ''),
      );
      if (flashed) {
        (window as unknown as { __markResultsList?: () => void }).__markResultsList?.();
      }
      // Resolve once the detail tablist is present in the main pane.
      return Boolean(root.querySelector('[role="tab"]'));
    }, { polling: 50, timeout: 25_000 });

    await poll;
    await expect(page.locator('main').getByRole('tab', { name: 'Timeline' })).toBeVisible({
      timeout: 10_000,
    });
    expect(sawResultsList, 'results-list count line flashed before detail').toBe(false);
  });

  test('a non-order query still shows the cross-entity results list', async ({ page }) => {
    test.skip(isMobile(), 'desktop search sidebar + detail flow');

    // Letters-only, digit-free → not identifier-shaped → straight to the list
    // phase (no exact-match resolution), and unlikely to match a sole order.
    await page.goto('/dashboard?mode=search&q=zznomatchqq');

    // Results surface owns the pane (its "no matches" teaching line), and the
    // order-detail tabs are absent.
    const main = page.locator('main');
    await expect(main.getByText(/No matches for/i)).toBeVisible({ timeout: 25_000 });
    await expect(main.getByRole('tab', { name: 'Timeline' })).toHaveCount(0);
  });
});
