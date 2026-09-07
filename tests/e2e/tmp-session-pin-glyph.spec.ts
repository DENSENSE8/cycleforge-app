import { test, expect, type Page } from '@playwright/test';

/**
 * TEMPORARY verification harness for handoff tasks D (session pin wears a chat
 * glyph, not the Home house) and E (the bound thread is in the row's ACCESSIBLE
 * NAME, not only an aria-hidden line). Delete after human verification.
 */

const NAV_COLUMN_OPEN = '[data-sidebar-nav-column][data-open="true"]';
const RENAMED = 'Renamed Thread QA';

async function openSpine(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(2_000);
  if ((await page.locator(NAV_COLUMN_OPEN).count()) === 0) {
    await page.locator('header button').first().click();
  }
  await expect(page.locator(NAV_COLUMN_OPEN)).toBeVisible();
}

test('a pinned session reads as its thread, wears a chat glyph, and announces it', async ({
  page,
}) => {
  test.setTimeout(150_000);
  await openSpine(page, '/');

  const sessions = page.getByRole('group', { name: 'Recent sessions' });
  const cluster = page.getByRole('group', { name: 'Pinned' });
  await expect(sessions).toBeVisible({ timeout: 20_000 });

  const firstRow = sessions.getByRole('button', { name: /^Open / }).first();
  const title = ((await firstRow.getAttribute('aria-label')) ?? '').replace(/^Open /, '');
  console.log(`[verify] pinning thread "${title}"`);

  await firstRow.hover();
  await sessions.getByRole('button', { name: `Session actions — ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Pin to shelf' }).click();

  // D + E(1): the shelf row IS the thread — its own name, not a second "Home".
  const pinRow = cluster.getByRole('button', { name: new RegExp(`^Go to ${title}`) });
  await expect(pinRow).toBeVisible({ timeout: 10_000 });
  console.log(`[verify] pin aria-label: ${await pinRow.getAttribute('aria-label')}`);
  await expect(cluster.getByRole('button', { name: /^Go to Home/ })).toHaveCount(1);

  // D: the glyph is the Sessions-list chat square, not the Home house. Both are
  // inline SVG, so compare path data against each known face.
  const pinIcon = await pinRow.locator('svg').first().innerHTML();
  const homeIcon = await cluster
    .getByRole('button', { name: /^Go to Home/ })
    .locator('svg')
    .first()
    .innerHTML();
  const chatIcon = await sessions
    .getByRole('button', { name: /^Open / })
    .first()
    .locator('svg')
    .first()
    .innerHTML();
  expect(pinIcon).not.toBe(homeIcon);
  expect(pinIcon).toBe(chatIcon);

  await pinRow.hover();
  await page.waitForTimeout(400);
  await cluster.screenshot({ path: 'tests/.artifacts/task-de-1-shelf-chat-glyph.png' });
  await page.screenshot({ path: 'tests/.artifacts/task-de-2-spine.png' });

  // E(2): rename the thread. The pin keeps its snapshot label, so the LIVE
  // title now differs — it must be announced, not just drawn on hover.
  await firstRow.hover();
  await sessions.getByRole('button', { name: `Session actions — ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const input = sessions.getByRole('textbox', { name: `Rename ${title}` });
  await input.fill(RENAMED);
  await input.press('Enter');
  await expect(sessions.getByRole('button', { name: `Open ${RENAMED}` })).toBeVisible({
    timeout: 10_000,
  });

  const boundRow = cluster.getByRole('button', {
    name: new RegExp(`^Go to ${title} — session: ${RENAMED}`),
  });
  await expect(boundRow).toBeVisible({ timeout: 10_000 });
  console.log(`[verify] bound aria-label: ${await boundRow.getAttribute('aria-label')}`);
  await boundRow.hover();
  await page.waitForTimeout(500);
  await expect(cluster.getByText(RENAMED)).toBeVisible();
  await cluster.screenshot({ path: 'tests/.artifacts/task-de-3-bound-session-announced.png' });

  // Leave the shelf and the thread as we found them.
  await boundRow.focus();
  await page.keyboard.press('Alt+Delete');
  await expect(boundRow).toHaveCount(0, { timeout: 10_000 });
  await sessions.getByRole('button', { name: `Open ${RENAMED}` }).hover();
  await sessions.getByRole('button', { name: `Session actions — ${RENAMED}` }).click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const back = sessions.getByRole('textbox', { name: `Rename ${RENAMED}` });
  await back.fill(title);
  await back.press('Enter');
  await expect(sessions.getByRole('button', { name: `Open ${title}` })).toBeVisible({
    timeout: 10_000,
  });
});
