import { test, expect, type Page } from '@playwright/test';

/**
 * ⌘K finds PAGES, not just records.
 *
 * The palette was records-only — orders, serials, tracking, titles — so the one
 * thing a keyboard-first operator most wants from a command palette ("take me
 * to that page") was the one thing it could not do. `sidebar-navigation.ts`
 * already claimed top rows "stay in ⌘K"; nothing implemented it.
 *
 * Media Library is the case that proves the keyword path: staff call it
 * "photos", the label says "Media Library", so a label-only match would miss
 * the page it is named after. `keywords` on the registry row is what closes
 * that, and the ranking is unit-tested in `src/lib/search/nav-page-search.test.ts`.
 * What a unit test cannot see is whether the group actually renders in the
 * palette and routes on Enter.
 */

const CMDK_ROOT = '[cmdk-root]';

async function boot(page: Page, route = '/reports') {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.getByTestId('global-find-field').waitFor({ state: 'visible', timeout: 45_000 });
}

async function openPalette(page: Page, query: string) {
  await page.keyboard.press('Meta+k');
  const root = page.locator(CMDK_ROOT).first();
  await expect(root).toBeVisible();
  await page.locator(`${CMDK_ROOT} input`).first().fill(query);
  return root;
}

const pagesGroup = (page: Page) =>
  page.locator(`${CMDK_ROOT} [cmdk-group]`).filter({ hasText: 'Pages' });

test.describe('⌘K page search', () => {
  test.skip(({ isMobile }) => Boolean(isMobile));

  test('"media" finds the Media Library page', async ({ page }) => {
    await boot(page);
    await openPalette(page, 'media');
    await expect(pagesGroup(page).getByText('Media Library')).toBeVisible({ timeout: 8_000 });
  });

  test('"photo" finds it too, though the label never says "photo"', async ({ page }) => {
    // The whole reason the registry row carries `keywords`.
    await boot(page);
    await openPalette(page, 'photo');
    await expect(pagesGroup(page).getByText('Media Library')).toBeVisible({ timeout: 8_000 });
  });

  test('selecting the page routes to it', async ({ page }) => {
    await boot(page);
    await openPalette(page, 'photo library');
    await pagesGroup(page).getByText('Media Library').first().click();
    await page.waitForURL(/\/ops\/photos/, { timeout: 15_000 });
    expect(new URL(page.url()).pathname).toBe('/ops/photos');
  });

  test('a single character does not flood the palette with pages', async ({ page }) => {
    // One letter matches most of the map; pages would bury the record hits the
    // palette is mainly for.
    await boot(page);
    await openPalette(page, 'm');
    await expect(pagesGroup(page)).toHaveCount(0);
  });
});
