import { test, expect, type Page } from '@playwright/test';
import { zIndex } from '../../src/design-system/tokens/z-index.mjs';
import { SCAN_STATION_OVERLAY_COHORT } from '../../src/lib/station/scan-station-overlay-cohort';

/**
 * Collapsed MasterNav hover-peek vs page chrome.
 *
 * Peek is one host (`SidebarNavColumn`) on every desktop route. Station
 * overlays paint at `zIndex.panel` / `panelOverlay`; desks can raise
 * `detailStack`. Peek must use `zIndex.navPeek` on all of them — not Unbox
 * alone.
 */

const NAV_COLUMN = '[data-sidebar-nav-column]';
const PEEK = '[data-testid="sidebar-spine-peek"]';
const TOGGLE = '[data-testid="sidebar-collapse-control"] button';

/** Overlay cohort (the original punch-through) plus L1 desks / extra floors. */
const PEEK_STACK_ROUTES: readonly string[] = [
  ...SCAN_STATION_OVERLAY_COHORT.map((m) => m.route),
  '/pickup',
  '/repair',
  '/',
  '/ops/photos',
  '/incoming',
  '/shipping/orders',
  '/products',
  '/inventory',
  '/dashboard',
  '/operations',
  '/support',
];

async function gotoCollapsed(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(2_000);
  const column = page.locator(NAV_COLUMN);
  await expect(column).toBeAttached();
  if ((await column.getAttribute('data-open')) === 'true') {
    await page.locator(TOGGLE).click();
    await expect(column).toHaveAttribute('data-open', 'false');
  }
}

async function assertPeekStacksAbovePage(page: Page) {
  await page.locator(TOGGLE).hover();
  const peek = page.locator(PEEK);
  await expect(peek).toBeVisible();
  await expect(peek.getByRole('group', { name: 'Pinned' })).toBeVisible();

  const peekZ = await peek.evaluate((el) => Number(getComputedStyle(el).zIndex));
  expect(peekZ, 'peek uses zIndex.navPeek').toBe(zIndex.navPeek);
  expect(peekZ).toBeGreaterThan(zIndex.panelOverlay);
  expect(peekZ).toBeGreaterThan(zIndex.detailStack);

  const box = await peek.boundingBox();
  expect(box).toBeTruthy();
  const hit = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return Boolean(el?.closest('[data-testid="sidebar-spine-peek"]'));
    },
    { x: box!.x + Math.min(48, box!.width / 2), y: box!.y + Math.min(48, box!.height / 2) },
  );
  expect(hit, 'page chrome must not steal hits from the peek card').toBe(true);
}

test.describe('MasterNav collapsed hover-peek stacking', () => {
  test.skip(({ isMobile }) => Boolean(isMobile));

  for (const route of PEEK_STACK_ROUTES) {
    test(`${route}: peek sits above page overlays`, async ({ page }) => {
      await gotoCollapsed(page, route);
      await assertPeekStacksAbovePage(page);
    });
  }
});
