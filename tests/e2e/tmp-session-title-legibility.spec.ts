import { test, expect, type Page } from '@playwright/test';

/**
 * TEMPORARY verification harness for handoff task C (legible session titles).
 * Two seeded rows carry raw Harmony markup:
 *   harmonyprobe-final    → a `final` channel survives → "Packing Pace By Packer"
 *   harmonyprobe-analysis → pure analysis, no name → "Untitled session"
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

test('a stale Harmony title never renders a control token', async ({ page }) => {
  test.setTimeout(120_000);
  await openSpine(page, '/');

  const sessions = page.getByRole('group', { name: 'Recent sessions' });
  await expect(sessions).toBeVisible({ timeout: 20_000 });

  // The whole nav column: no `<|` anywhere, in any row, at any truncation.
  const navText = (await page.locator(NAV_COLUMN_OPEN).innerText()).replace(/\s+/g, ' ');
  console.log(`[verify] nav rows: ${navText.slice(0, 400)}`);
  expect(navText).not.toContain('<|');
  expect(navText).not.toContain('channel');

  // The `final` channel is what the operator gets to read.
  await expect(sessions.getByRole('button', { name: 'Open Packing Pace By Packer' })).toBeVisible();
  // A pure-analysis title carries no name at all — say so, do not paint it.
  await expect(sessions.getByRole('button', { name: 'Open Untitled session' })).toBeVisible();

  await page.screenshot({ path: 'tests/.artifacts/task-c-1-spine-clean.png' });

  // Same guard on the header switcher's list (it filters on the clean text too).
  await page.locator('[data-session-switcher] button').first().click();
  const menuText = (await page.locator('[data-session-switcher]').innerText()).replace(/\s+/g, ' ');
  expect(menuText).not.toContain('<|');
  await expect(
    page.locator('[data-session-switcher]').getByText('Packing Pace By Packer'),
  ).toBeVisible();
  await page.screenshot({ path: 'tests/.artifacts/task-c-2-switcher-clean.png' });
});
