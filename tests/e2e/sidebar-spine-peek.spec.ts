import { test, expect, type Page } from '@playwright/test';
import { zIndex } from '../../src/design-system/tokens/z-index.mjs';

/**
 * Collapsed MasterNav hover-peek vs station overlay stack.
 *
 * Unbox (and every scan-station overlay) paints at `zIndex.panel` (100) and
 * popovers at `panelOverlay` (130). The peek used `dropdown` (50), so Unbox
 * item chrome (green tag, ITEMS rail) punched through the card and clipped
 * "Pins". The peek must stack at `zIndex.navPeek`.
 */

const NAV_COLUMN = '[data-sidebar-nav-column]';
const PEEK = '[data-testid="sidebar-spine-peek"]';
const TOGGLE = '[data-testid="sidebar-collapse-control"] button';

async function gotoCollapsedUnbox(page: Page) {
  await page.goto('/unbox', { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(3_000);
  const open = await page.locator(NAV_COLUMN).getAttribute('data-open');
  if (open === 'true') {
    await page.locator(TOGGLE).click();
    await expect(page.locator(NAV_COLUMN)).toHaveAttribute('data-open', 'false');
  }
}

test.describe('MasterNav collapsed hover-peek stacking', () => {
  test.skip(({ isMobile }) => Boolean(isMobile));

  test('/unbox: peek sits above station panel overlays', async ({ page }) => {
    await gotoCollapsedUnbox(page);

    await page.locator(TOGGLE).hover();
    const peek = page.locator(PEEK);
    await expect(peek).toBeVisible();
    await expect(peek.getByRole('group', { name: 'Pinned' })).toBeVisible();

    const peekZ = await peek.evaluate((el) => Number(getComputedStyle(el).zIndex));
    expect(peekZ, 'peek uses zIndex.navPeek').toBe(zIndex.navPeek);
    expect(peekZ).toBeGreaterThan(zIndex.panelOverlay);

    const box = await peek.boundingBox();
    expect(box).toBeTruthy();
    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return Boolean(el?.closest('[data-testid="sidebar-spine-peek"]'));
      },
      { x: box!.x + Math.min(48, box!.width / 2), y: box!.y + Math.min(48, box!.height / 2) },
    );
    expect(hit, 'station overlay must not steal hits from the peek card').toBe(true);
  });
});
