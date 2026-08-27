import { test, expect, type Page } from '@playwright/test';

/**
 * Header find — title-only preview + sole-match opens the record.
 *
 * Mocks `/api/global-search` so the assertion is about the dropdown chrome,
 * not the QA corpus. Runs on `/search` so Unbox scan/deep-link stickiness
 * cannot steal the commit.
 *
 *   npx playwright test tests/e2e/global-find-title-only.spec.ts --project=qa-desktop
 */

const FIND = '[data-testid="global-find-field"]';
const HIT = '[data-testid="global-find-hit"]';

const MULTI_ROWS = [
  {
    id: 101,
    entityType: 'receiving',
    title: 'Bose Wave Radio AWR1-1W',
    subtitle: 'R-101 · UPS',
    href: '/search?sel=receiving:101',
    matchField: 'receiving',
    facets: { tracking_number: '1Z999', status: 'RECEIVED' },
  },
  {
    id: 102,
    entityType: 'receiving',
    title: 'Bose SoundLink Flex',
    subtitle: 'R-102 · UPS',
    href: '/search?sel=receiving:102',
    matchField: 'receiving',
    facets: { tracking_number: '1Z888', status: 'RECEIVED' },
  },
];

const SOLE_ROW = [
  {
    id: 51908,
    entityType: 'receiving',
    title: 'Bose TV Speaker Black',
    subtitle: '#51908 · Support',
    href: '/search?sel=receiving:51908',
    matchField: 'receiving',
    facets: { tracking_number: '1Z777', status: 'RECEIVED' },
  },
];

async function mockGlobalSearch(page: Page, rows: typeof MULTI_ROWS) {
  await page.route(/\/api\/global-search(\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify({ rows }),
    });
  });
}

async function openFindAndQuery(page: Page, query: string) {
  await page.goto('/search', { waitUntil: 'domcontentloaded' });
  await expect(page.locator(FIND)).toBeVisible({ timeout: 45_000 });
  const input = page.locator(FIND).locator('input');
  await input.click();
  const response = page.waitForResponse(
    (res) => res.url().includes('/api/global-search') && res.ok(),
    { timeout: 15_000 },
  );
  await input.fill(query);
  await response;
}

test.describe('header find — title-only + sole match', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'header find is desktop chrome');

  test('preview paints product titles only — no entity header, glyph mash, or photo count', async ({
    page,
  }) => {
    await mockGlobalSearch(page, MULTI_ROWS);
    await openFindAndQuery(page, 'Bose Wave');

    await expect(page.locator(HIT)).toHaveCount(2, { timeout: 10_000 });
    await expect(page.locator(HIT).first()).toHaveAttribute(
      'data-hit-title',
      'Bose Wave Radio AWR1-1W',
    );
    await expect(page.locator(HIT).nth(1)).toHaveAttribute(
      'data-hit-title',
      'Bose SoundLink Flex',
    );

    // Title-only: no RECEIVING group header, no icons inside the hit, no id mash.
    await expect(page.getByText('RECEIVING', { exact: true })).toHaveCount(0);
    await expect(page.locator(`${HIT} svg`)).toHaveCount(0);
    await expect(page.locator(HIT).first()).toHaveText('Bose Wave Radio AWR1-1W');
  });

  test('sole matching result opens the searched page instantly', async ({ page }) => {
    await mockGlobalSearch(page, SOLE_ROW);
    await openFindAndQuery(page, 'Bose TV Speaker');

    await expect(page).toHaveURL(/\/search\?sel=receiving:51908/, { timeout: 15_000 });
  });
});
