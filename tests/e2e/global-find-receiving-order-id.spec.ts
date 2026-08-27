import { test, expect, type Page } from '@playwright/test';

/**
 * Header find — marketplace # `11-15067-72584` is a receiving carton
 * `source_order_id` (and may also be a live order). Exact match paints in
 * the dropdown; picking the receiving row opens `/search?sel=receiving:…`.
 *
 *   npx playwright test tests/e2e/global-find-receiving-order-id.spec.ts --project=qa-desktop
 */

test.skip(({ browserName }) => browserName === 'webkit', 'header find is a desktop layout');

const HIT = '[data-testid="global-find-hit"]';
const ORDER_ID = '11-15067-72584';

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

const receivingHit = {
  id: 51842,
  entityType: 'receiving',
  title: 'Bose Wave Radio AWR1-1W',
  subtitle: `${ORDER_ID} · USPS`,
  href: '/search?sel=receiving:51842',
  matchField: 'receiving',
  facets: {
    source_order_id: ORDER_ID,
    order_id: ORDER_ID,
    source_platform: 'ebay',
  },
};

const orderHit = {
  id: 9001,
  entityType: 'order',
  title: 'Bose Wave Radio AWR1-1W',
  subtitle: `${ORDER_ID} · EBAY`,
  href: '/search?sel=order:9001',
  matchField: 'order',
  facets: {
    order_id: ORDER_ID,
    source_platform: 'ebay',
  },
};

test.describe('header find receiving marketplace order id', () => {
  test('receiving + order exact # paint; receiving opens the search page', async ({ page }) => {
    await stubFindApis(page, [receivingHit, orderHit]);
    await typeInHeaderFind(page, ORDER_ID);

    const receiving = page.locator(`${HIT}[data-hit-entity="receiving"]`);
    const order = page.locator(`${HIT}[data-hit-entity="order"]`);
    await expect(receiving).toHaveCount(1);
    await expect(order).toHaveCount(1);
    await expect(receiving).toHaveAttribute('data-hit-title', ORDER_ID);
    await expect(order).toHaveAttribute('data-hit-title', ORDER_ID);
    await expect(receiving).toContainText(ORDER_ID);

    await receiving.click();
    await expect(page).toHaveURL(/\/search\?sel=receiving(%3A|:)51842/);
  });

  test('order row opens search feedback for the same marketplace #', async ({ page }) => {
    await stubFindApis(page, [receivingHit, orderHit]);
    await typeInHeaderFind(page, ORDER_ID);
    await page.locator(`${HIT}[data-hit-entity="order"]`).click();
    await expect(page).toHaveURL(/\/search\?sel=order(%3A|:)9001/);
  });

  test('undashed paste still paints the dashed receiving #', async ({ page }) => {
    await stubFindApis(page, [receivingHit]);
    await typeInHeaderFind(page, ORDER_ID);
    const field = page.getByTestId('global-find-field').locator('input');
    const receiving = page.locator(`${HIT}[data-hit-entity="receiving"]`);
    await expect(receiving).toHaveCount(1);
    await field.fill('111506772584');
    await expect(field).toHaveValue('111506772584');
    await field.click();
    await expect(receiving).toHaveCount(1);
    await expect(receiving).toHaveAttribute('data-hit-title', ORDER_ID);
  });
});
