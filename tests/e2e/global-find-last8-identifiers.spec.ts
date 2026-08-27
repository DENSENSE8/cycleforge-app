import { test, expect, type Page } from '@playwright/test';

/**
 * Header find — exact last-8 of marketplace order # and unit serials.
 * Dashed and undashed pastes are the same identifier. Hits stay in the
 * dropdown (no page switch). Misses use the same empty copy in that list.
 *
 *   npx playwright test tests/e2e/global-find-last8-identifiers.spec.ts --project=qa-desktop
 */

test.skip(({ browserName }) => browserName === 'webkit', 'header find is a desktop layout');

const HIT = '[data-testid="global-find-hit"]';
const EMPTY_ORDER = 'No order number found in the system';
const EBAY = '02-14684-13689';
const SERIAL = 'C02-XMH-12345678';

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
  await expect(field).toHaveValue(q);
  await field.click();
}

const ebayHit = {
  id: 9001,
  entityType: 'order',
  title: 'Bose Wave Radio',
  subtitle: `${EBAY} · EBAY`,
  href: '/search?sel=order:9001',
  matchField: 'order',
  facets: { order_id: EBAY, source_platform: 'ebay' },
};

const serialHit = {
  id: 4102,
  entityType: 'unit',
  title: SERIAL,
  subtitle: `${SERIAL} · IN_STOCK`,
  href: '/inventory/units?unit=4102',
  matchField: 'serial',
  facets: { serial_number: SERIAL },
};

test.describe('header find last-8 order number', () => {
  test('dashed and undashed last-8 / full id paint the marketplace #', async ({ page }) => {
    await stubFindApis(page, [ebayHit]);
    const queries = ['68413689', '6841-3689', '021468413689', EBAY, '84-13689'];
    await typeInHeaderFind(page, queries[0]);
    const field = page.getByTestId('global-find-field').locator('input');
    const hit = page.locator(HIT);
    for (const q of queries) {
      await field.fill(q);
      await expect(field).toHaveValue(q);
      await field.click();
      await expect(hit).toHaveCount(1);
      await expect(hit).toHaveAttribute('data-hit-title', EBAY);
      await expect(hit).toContainText(EBAY);
    }
    await expect(page).not.toHaveURL(/sel=order:9001/);
  });

  test('last-8 miss stays in the dropdown', async ({ page }) => {
    await stubFindApis(page, []);
    await typeInHeaderFind(page, '68413689');
    await page.getByTestId('global-find-field').locator('input').click();
    await expect(page.getByText(EMPTY_ORDER)).toBeVisible({ timeout: 10_000 });
    const urlBeforeEnter = page.url();
    await page.getByTestId('global-find-field').locator('input').press('Enter');
    await expect(page.getByText(EMPTY_ORDER)).toBeVisible();
    await expect(page).toHaveURL(urlBeforeEnter);
  });
});

test.describe('header find last-8 serial', () => {
  test('dashed and undashed last-8 / full serial paint the serial', async ({ page }) => {
    await stubFindApis(page, [serialHit]);
    const queries = ['12345678', '1234-5678', 'C02XMH12345678', SERIAL];
    await typeInHeaderFind(page, queries[0]);
    const field = page.getByTestId('global-find-field').locator('input');
    const hit = page.locator(HIT);
    for (const q of queries) {
      await field.fill(q);
      await expect(field).toHaveValue(q);
      await field.click();
      await expect(hit).toHaveCount(1);
      await expect(hit).toHaveAttribute('data-hit-title', SERIAL);
      await expect(hit).toContainText(SERIAL);
    }
    await expect(page).not.toHaveURL(/unit=4102/);
  });
});
