import { test, expect, type Page } from '@playwright/test';

/**
 * TEMPORARY verification harness for handoff task G (opening a session is ONE
 * navigation). The old path called `onNavigate('home')` and then pushed
 * `/?session=<id>`, so Back landed on a bare `/` the operator never asked for.
 * Delete after human verification.
 */

const NAV_COLUMN_OPEN = '[data-sidebar-nav-column][data-open="true"]';

async function openSpine(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(2_000);
  if ((await page.locator(NAV_COLUMN_OPEN).count()) === 0) {
    await page.locator('header button').first().click();
  }
  await expect(page.locator(NAV_COLUMN_OPEN)).toBeVisible();
}

test('opening a session pushes once — Back returns to where you were', async ({ page }) => {
  test.setTimeout(120_000);
  await openSpine(page, '/unbox');

  const sessions = page.getByRole('group', { name: 'Recent sessions' });
  await expect(sessions).toBeVisible({ timeout: 20_000 });
  const row = sessions.getByRole('button', { name: /^Open / }).first();
  const title = ((await row.getAttribute('aria-label')) ?? '').replace(/^Open /, '');

  const before = await page.evaluate(() => window.history.length);
  await row.click();
  await page.waitForURL(/\/\?session=/, { timeout: 20_000 });
  await page.waitForTimeout(1_500);
  const after = await page.evaluate(() => window.history.length);
  console.log(`[verify] opened "${title}" · history ${before} → ${after} · ${page.url()}`);

  // ONE entry, not two (a bare `/` push followed by the session push).
  expect(after - before).toBe(1);
  await page.screenshot({ path: 'tests/.artifacts/task-g-1-session-open.png' });

  // Back goes to the desk you came from, not to a phantom `/`.
  await page.goBack();
  await page.waitForTimeout(1_500);
  console.log(`[verify] back → ${page.url()}`);
  expect(new URL(page.url()).pathname).toBe('/unbox');
  await page.screenshot({ path: 'tests/.artifacts/task-g-2-back-to-unbox.png' });
});
