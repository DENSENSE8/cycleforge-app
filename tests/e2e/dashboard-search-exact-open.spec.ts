import { test, expect } from '@playwright/test';

/**
 * Dashboard Search — human eBay-style order # exact-open (dogfood lock).
 *
 * Guards the dual-engine gap: `/api/orders/lookup` can miss or race while
 * `/api/ai/retrieve` still finds the ORDER. Identifier Enter must land on
 * `SearchOrderDetailShell` (spinner → detail), never stick on "1 result for…"
 * until the operator clicks the L2 sidebar.
 *
 * Env (optional; defaults are known dogfood fixtures):
 *   PW_SEARCH_ORDER_HUMAN – human order # (default 27-14721-28101)
 *   PW_SEARCH_ORDER_TITLE – optional title substring for the shell
 */

const HUMAN = (
  process.env.PW_SEARCH_ORDER_HUMAN ||
  process.env.PW_SEARCH_ORDER_ID_HUMAN ||
  '27-14721-28101'
).trim();

const TITLE_HINT = (process.env.PW_SEARCH_ORDER_TITLE || '').trim();

const isMobile = () => test.info().project.name === 'mobile';

/** Main-pane results-list count line, e.g. `1 result for “27-…” · keyword`. */
const resultsCountLine = /results? for [“"]/i;

test.describe('Dashboard Search exact-open (human order #)', () => {
  test('Spec C — lookup API resolves the human order #', async ({ request }) => {
    const lookup = await request.get(`/api/orders/lookup/${encodeURIComponent(HUMAN)}`);
    if (lookup.status() === 404) {
      test.skip(true, `Fixture order ${HUMAN} missing in this tenant — skip exact-open suite`);
    }
    expect(lookup.ok(), `lookup ${HUMAN} → ${lookup.status()}`).toBeTruthy();
    const body = await lookup.json();
    const id = Number(body?.order?.id);
    expect(Number.isFinite(id) && id > 0, 'lookup returns numeric id').toBe(true);
    expect(String(body?.order?.order_id || '').trim()).toBe(HUMAN);

    const byId = await request.get(`/api/orders/${id}`);
    expect(byId.ok(), `GET /api/orders/${id} → ${byId.status()}`).toBeTruthy();
    const byIdBody = await byId.json();
    expect(String(byIdBody?.order?.order_id || '').trim()).toBe(HUMAN);
  });

  test('Spec A — deep-link q-only opens detail without results-list flash', async ({
    page,
  }) => {
    test.skip(isMobile(), 'desktop search sidebar + detail flow');

    let sawResultsList = false;
    await page.exposeFunction('__markHumanResultsList', () => {
      sawResultsList = true;
    });

    await page.goto(
      `/dashboard?mode=search&q=${encodeURIComponent(HUMAN)}&map=search`,
      { waitUntil: 'commit' },
    );

    // Poll while resolving: flag any main-pane results count line flash.
    await page.waitForFunction(() => {
      const root = document.querySelector('main');
      if (!root) return false;
      const flashed = Array.from(root.querySelectorAll('p, span, div')).some((el) =>
        /results? for [“"]/i.test(el.textContent ?? ''),
      );
      if (flashed) {
        (
          window as unknown as { __markHumanResultsList?: () => void }
        ).__markHumanResultsList?.();
      }
      return Boolean(root.querySelector('[data-testid="search-order-context-bar"]'));
    }, { polling: 50, timeout: 25_000 });

    expect(sawResultsList, 'results-list count line flashed before detail').toBe(false);

    await expect(page).toHaveURL(/openOrderId=\d+/);
    const main = page.locator('main');
    await expect(main.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(main.getByTestId('search-order-context-bar')).toBeVisible();
    await expect(main.getByText(HUMAN, { exact: false }).first()).toBeVisible();
    if (TITLE_HINT) {
      await expect(main.getByText(TITLE_HINT, { exact: false }).first()).toBeVisible();
    }
    await expect(main.getByText(resultsCountLine)).toHaveCount(0);

    // Durable: still on detail after settle (no bounce to list / spinner).
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(/openOrderId=\d+/);
    await expect(main.getByTestId('search-order-context-bar')).toBeVisible();
    await expect(main.getByText(/Loading order/i)).toHaveCount(0);
    await expect(main.getByText(resultsCountLine)).toHaveCount(0);

    // Map mode must stay Search (canonicalize must not thrash Recent↔Search).
    await expect(page).toHaveURL(/map=search/);
    await expect(
      page.getByRole('tab', { name: 'Search', selected: true }),
    ).toBeVisible();
  });

  test('Spec B — lookup miss still opens via retrieve bridge (durable)', async ({
    page,
  }) => {
    test.skip(isMobile(), 'desktop search sidebar + detail flow');

    // Force the dual-engine gap: lookup fails, retrieve still finds the ORDER.
    await page.route(`**/api/orders/lookup/**`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'not_found' }),
      });
    });

    await page.goto(
      `/dashboard?mode=search&q=${encodeURIComponent(HUMAN)}&map=search`,
      { waitUntil: 'commit' },
    );

    const main = page.locator('main');
    await expect(page).toHaveURL(/openOrderId=\d+/, { timeout: 25_000 });
    await expect(main.getByTestId('search-order-context-bar')).toBeVisible({
      timeout: 15_000,
    });
    await expect(main.getByRole('tab', { name: 'Overview' })).toBeVisible();
    await expect(main.getByText(resultsCountLine)).toHaveCount(0);

    // No bounce: URL + shell stable for ≥2s.
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(/openOrderId=\d+/);
    await expect(main.getByTestId('search-order-context-bar')).toBeVisible();
    await expect(main.getByText(resultsCountLine)).toHaveCount(0);
  });
});
