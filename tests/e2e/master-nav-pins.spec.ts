import { test, expect, type Page } from '@playwright/test';

/**
 * MasterNav Pinned cluster — pin this page, unpin, hold-drag a catalog leaf
 * onto the drop well.
 *
 * Home is the ONLY structural row. Media Library was structural too until
 * 2026-09-05, on the grounds that it already sat above Pinned — which is what a
 * pin is for, so it spent spine real estate no operator could reclaim. Its
 * pin/unpin round trip lives in `master-nav-pin-drag.spec.ts`.
 */

const PAGES_MENU = '[role="menu"][aria-label="Pages"]';
const NAV_COLUMN_OPEN = '[data-sidebar-nav-column][data-open="true"]';

async function openSpine(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(2_000);
  if (await page.locator(NAV_COLUMN_OPEN).count() === 0) {
    await page.locator('header button').first().click();
  }
  await expect(page.locator(NAV_COLUMN_OPEN)).toBeVisible();
  await expect(page.locator(PAGES_MENU)).toBeVisible();
}

async function unpinAll(page: Page) {
  const cluster = page.getByRole('group', { name: 'Pinned' });
  await expect(cluster).toBeVisible();
  const expander = cluster.getByRole('button', { name: 'Pinned' });
  if ((await expander.getAttribute('aria-expanded')) === 'false') {
    await expander.click();
  }
  for (let i = 0; i < 20; i++) {
    const unpin = cluster.getByRole('button', { name: /^Unpin / });
    if ((await unpin.count()) === 0) break;
    await unpin.first().click();
  }
}

async function holdDrag(page: Page, source: ReturnType<Page['locator']>, dest: ReturnType<Page['locator']>) {
  const from = await source.boundingBox();
  const to = await dest.boundingBox();
  if (!from || !to) throw new Error('missing drag boxes');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.mouse.move(to.x + to.width / 2, to.y + Math.min(24, to.height / 2), { steps: 16 });
  await page.mouse.up();
}

test.describe('MasterNav pins', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Home cannot be pinned — the spine root is not a shortcut', async ({ page }) => {
    await openSpine(page, '/');
    await unpinAll(page);
    // On Home itself, there is nothing to pin.
    await expect(page.getByRole('button', { name: 'Pin this page' })).toHaveCount(0);

    const home = page.getByRole('button', { name: 'Go to Home' });
    const cluster = page.getByRole('group', { name: 'Pinned' });
    await holdDrag(page, home, cluster);
    await expect(page.getByRole('button', { name: 'Unpin Home' })).toHaveCount(0);
  });

  test('Pin this page and hold-drag a station leaf into Pinned', async ({ page }) => {
    await openSpine(page, '/unbox');
    await expect(page.getByRole('group', { name: 'Top pages' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to spine' })).toHaveCount(0);

    await unpinAll(page);

    const pinThis = page.getByRole('button', { name: 'Pin this page' });
    await expect(pinThis).toBeVisible();
    await pinThis.click();
    await expect(page.getByRole('button', { name: 'Unpin Unbox' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pin this page' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Unpin Unbox' }).click();
    await expect(page.getByRole('button', { name: 'Pin this page' })).toBeVisible();

    const arrival = page.getByRole('button', { name: 'Go to Arrival' });
    const cluster = page.getByRole('group', { name: 'Pinned' });
    await holdDrag(page, arrival, cluster);
    await expect(page.getByRole('button', { name: 'Unpin Arrival' })).toBeVisible({
      timeout: 8_000,
    });
  });
});
