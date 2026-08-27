import { test, expect, type Page } from '@playwright/test';

/**
 * Header find — Ecwid order numbers are 4-digit ids (`4989`).
 *
 *   • Hit → the marketplace # paints in the dropdown. No silent page switch.
 *   • Miss → “No order number found in the system” in that same dropdown.
 *     Enter does not change the URL.
 *
 * Search + lookup are stubbed so this is a component contract, not a live
 * tenant scrape.
 *
 *   npx playwright test tests/e2e/global-find-ecwid-order.spec.ts --project=qa-desktop
 */

test.skip(({ browserName }) => browserName === 'webkit', 'header find is a desktop layout');

const HIT = '[data-testid="global-find-hit"]';
const EMPTY = 'No order number found in the system';
const ECWID_ORDER = '4989';

async function stubFindApis(
  page: Page,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  await page.route('**/api/global-search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rows, total: rows.length }),
    });
  });
  await page.route('**/api/orders/lookup/**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'not_found' }),
    });
  });
}

async function typeInHeaderFind(page: Page, q: string): Promise<void> {
  await page.goto('/search');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });
  const field = page.getByTestId('global-find-field').locator('input');
  await expect(field).toBeVisible({ timeout: 15_000 });
  await field.click();
  await field.fill(q);
}

test.describe('header find Ecwid order number', () => {
  test('miss stays on this page and uses the dropdown empty copy', async ({ page }) => {
    await stubFindApis(page, []);
    await typeInHeaderFind(page, ECWID_ORDER);
    await page.getByTestId('global-find-field').locator('input').click();

    await expect(page.getByText(EMPTY)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(HIT)).toHaveCount(0);

    const urlBeforeEnter = page.url();
    await page.getByTestId('global-find-field').locator('input').press('Enter');
    await expect(page.getByText(EMPTY)).toBeVisible();
    await expect(page).toHaveURL(urlBeforeEnter);
  });

  test('Ecwid 4989 paints in the dropdown and does not auto-open a page', async ({ page }) => {
    await stubFindApis(page, [
      {
        id: 9001,
        entityType: 'order',
        title: 'Bose Wave Radio',
        subtitle: '4989 · ECWID',
        href: '/search?sel=order:9001',
        matchField: 'id',
        facets: {
          order_id: '4989',
          source_platform: 'ecwid',
        },
      },
    ]);
    await typeInHeaderFind(page, ECWID_ORDER);

    const hit = page.locator(HIT);
    await expect(hit).toHaveCount(1);
    await expect(hit).toHaveAttribute('data-hit-title', '4989');
    await expect(hit).toContainText('4989');
    await expect(page.getByText(EMPTY)).toHaveCount(0);
    await expect(page).not.toHaveURL(/sel=order:9001/);
  });
});
