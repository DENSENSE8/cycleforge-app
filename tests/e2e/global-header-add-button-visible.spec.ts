/**
 * Global Header Add — the button must *display*, on every desk, always.
 *
 * Scope is deliberately narrow: presence and paint of the trigger in the
 * header actions zone. Opening the menu, submenu order and intent parking are
 * covered by `global-header-add-menu.spec.ts` — this spec stays green even if
 * the catalog empties out, because the trigger is never gated on it.
 *
 * Run: `npx playwright test tests/e2e/global-header-add-button-visible.spec.ts --project=qa-desktop`
 */

import { test, expect } from '@playwright/test';

// The actions rail is desktop-only — mobile mounts no part of it.
const ROUTES = ['/incoming', '/dashboard', '/reports'];

test.describe('Global Header Add button displays', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'actions rail is desktop-only');

  for (const route of ROUTES) {
    test(`renders in the header actions zone on ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      const actions = page.locator('[data-header-zone="actions"]');
      await expect(actions).toBeVisible({ timeout: 30_000 });

      const add = actions.getByTestId('global-header-add');
      await expect(add).toBeVisible({ timeout: 15_000 });
      await expect(add).toHaveAttribute('aria-label', 'Add');

      // Painted at a real hit target, not mounted at zero size or off-beam.
      const addBox = (await add.boundingBox())!;
      expect(addBox).toBeTruthy();
      expect(addBox.width).toBeGreaterThan(16);
      expect(addBox.height).toBeGreaterThan(16);

      const actionsBox = (await actions.boundingBox())!;
      expect(addBox.x).toBeGreaterThanOrEqual(actionsBox.x - 1);
      expect(addBox.x + addBox.width).toBeLessThanOrEqual(
        actionsBox.x + actionsBox.width + 1,
      );

      // Add is the first control in the cluster.
      await expect(actions).toHaveAttribute('data-global-add', 'mounted');
    });
  }
});
