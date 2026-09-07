import { test, expect, type Page } from '@playwright/test';

/**
 * TEMPORARY verification harness for handoff task A (delete Undo + restore).
 * Screenshots land in tests/.artifacts/. Delete after human verification.
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

test('delete a session → Undo restores it', async ({ page }) => {
  test.setTimeout(120_000);
  await openSpine(page, '/');

  const sessions = page.getByRole('group', { name: 'Recent sessions' });
  await expect(sessions).toBeVisible({ timeout: 20_000 });

  const firstRow = sessions.getByRole('button', { name: /^Open / }).first();
  await expect(firstRow).toBeVisible();
  const rowLabel = (await firstRow.getAttribute('aria-label')) ?? '';
  const title = rowLabel.replace(/^Open /, '');
  const rowCountBefore = await sessions.getByRole('button', { name: /^Open / }).count();
  console.log(`[verify] deleting "${title}" (rows before: ${rowCountBefore})`);

  await firstRow.hover();
  await sessions.getByRole('button', { name: `Session actions — ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  // The proof shot: the row is gone AND the toast offers a real Undo.
  const undo = page.getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(`Deleted “${title}”`)).toBeVisible();
  await expect(sessions.getByRole('button', { name: `Open ${title}` })).toHaveCount(0);
  await page.screenshot({ path: 'tests/.artifacts/task-a-1-undo-offered.png', fullPage: false });

  await undo.click();
  await expect(page.getByText(`Restored “${title}”`)).toBeVisible({ timeout: 10_000 });
  await expect(sessions.getByRole('button', { name: `Open ${title}` })).toBeVisible({
    timeout: 10_000,
  });
  await page.screenshot({ path: 'tests/.artifacts/task-a-2-restored.png', fullPage: false });

  const rowCountAfter = await sessions.getByRole('button', { name: /^Open / }).count();
  expect(rowCountAfter).toBe(rowCountBefore);
});
