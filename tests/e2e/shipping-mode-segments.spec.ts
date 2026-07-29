import { test, expect, type Page } from '@playwright/test';

/**
 * Shipping modes as route segments (nav/routing refactor, Slice 3).
 *
 * The four modes moved off `?mode=` onto their own routes. The segments are not
 * what isolates the params — the boundary parse is — so this asserts both: the
 * mode is the path, AND a switch leaves the previous mode's state behind.
 */

const MODES = [
  { path: '/shipping/labels', label: 'Labels' },
  { path: '/shipping/ready', label: 'Ready' },
  { path: '/shipping/fba', label: 'FBA' },
  { path: '/shipping/scan-out', label: 'Scan out' },
] as const;

const paramsOf = (page: Page): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(new URL(page.url()).search));

async function gotoAuthed(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).pathname === '/signin') {
    test.skip(true, 'no session for this project');
  }
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(2500);
}

test.describe('shipping mode segments', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the mode rail is a desktop surface');

  for (const mode of MODES) {
    test(`${mode.path} renders without a ?mode= param`, async ({ page }) => {
      await gotoAuthed(page, mode.path);
      await expect(page).toHaveURL(new RegExp(mode.path.replace('/', '\\/')));
      expect(paramsOf(page).mode, 'being on the route IS the mode').toBeUndefined();
    });
  }

  test('bare /shipping redirects to the Labels route', async ({ page }) => {
    await gotoAuthed(page, '/shipping');
    await expect(page).toHaveURL(/\/shipping\/labels/);
  });

  test('a legacy ?mode= link lands on the segment and loses the param', async ({ page }) => {
    await gotoAuthed(page, '/shipping?mode=ready');
    await expect(page).toHaveURL(/\/shipping\/ready/);
    // The redirect carries `mode` through; the boundary parse drops it, because
    // no mode spec declares it.
    await expect.poll(() => paramsOf(page).mode, { timeout: 15_000 }).toBeUndefined();
  });

  test('switching modes from the nav navigates, and drops the old mode state', async ({ page }) => {
    // Land on Labels with a focused order, then switch away.
    await gotoAuthed(page, '/shipping/labels?open=123&sort=newest');

    const spine = page.locator('[data-sidebar-slide-over]');
    if ((await spine.count()) === 0) {
      await page.getByRole('button', { name: 'Show sidebar' }).click();
      await page.waitForTimeout(800);
    }
    await page.locator('aside').getByRole('button', { name: 'Ready', exact: true }).first().click();

    await expect(page).toHaveURL(/\/shipping\/ready/);
    const params = paramsOf(page);
    expect(params.open, "Labels' focused order must not ride into Ready").toBeUndefined();
    expect(params.sort, 'nor its display sort').toBeUndefined();
    expect(params.mode, 'the mode is the path, never a param').toBeUndefined();
  });

  test('a foreign param cannot survive landing on a shipping mode', async ({ page }) => {
    // `triq` is Triage's; `state` is Incoming's. Neither is declared here.
    await gotoAuthed(page, '/shipping/ready?triq=BOX-9&state=STALLED&sort=newest');
    await expect.poll(() => paramsOf(page).triq, { timeout: 15_000 }).toBeUndefined();
    const params = paramsOf(page);
    expect(params.state).toBeUndefined();
    // Ready's own declared param survives — isolation is not amnesia.
    expect(params.sort).toBe('newest');
  });
});
