import { test, expect, type Page } from '@playwright/test';

/**
 * ⌘K — one chord, one surface, reachable from anywhere.
 *
 * Two defects sat on top of each other here:
 *
 *  1. **Two owners.** `CommandBar` and `useQuickAccessHotkey` both bound the
 *     chord on `window`, and the Quick Access claim defaulted ON — so one press
 *     opened the palette *and* the Quick Access menu. Both called
 *     `preventDefault`, so neither could yield. Pinned at the source by
 *     `src/components/layout/cmdk-owner.guard.test.ts`.
 *  2. **Unreachable from a text field.** The surviving handler bailed whenever
 *     focus was in an input/textarea/select/contenteditable. That is the right
 *     rule for a BARE-key hotkey (the user is trying to type that character)
 *     and the wrong one for a modifier chord — nobody types ⌘K — so the palette
 *     was dead exactly when an operator was mid-task and most wanted to jump.
 *
 * A source guard cannot see (2): the handler existed and looked correct. Only
 * pressing the key with focus somewhere real shows it.
 */

const CMDK_ROOT = '[cmdk-root]';

async function boot(page: Page, route = '/reports') {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  // The palette is a `ssr:false` dynamic chunk — its listener attaches when the
  // split chunk lands, not at hydration.
  await page.waitForTimeout(4_000);
}

const paletteOpen = (page: Page) => page.locator(CMDK_ROOT).count();

test.describe('⌘K palette', () => {
  test.skip(({ isMobile }) => Boolean(isMobile));

  test('opens with the chord and is actually visible', async ({ page }) => {
    await boot(page);
    expect(await paletteOpen(page), 'starts closed').toBe(0);

    await page.keyboard.press('Meta+k');
    const root = page.locator(CMDK_ROOT).first();
    await expect(root).toBeVisible();
    // Rendered, not just mounted at zero size.
    const box = (await root.boundingBox())!;
    expect(box.width).toBeGreaterThan(200);
    expect(box.height).toBeGreaterThan(100);
  });

  test('Ctrl+K works too (the chord is not Mac-only)', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('Control+k');
    await expect(page.locator(CMDK_ROOT).first()).toBeVisible();
  });

  test('the chord toggles — a second press closes it', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('Meta+k');
    await expect(page.locator(CMDK_ROOT).first()).toBeVisible();

    await page.keyboard.press('Meta+k');
    await expect(page.locator(CMDK_ROOT)).toHaveCount(0);
  });

  test('Escape closes it', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('Meta+k');
    await expect(page.locator(CMDK_ROOT).first()).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator(CMDK_ROOT)).toHaveCount(0);
  });

  test('opens from INSIDE a text field — the regression that made it feel dead', async ({
    page,
  }) => {
    await boot(page);
    // The sidebar filter is a real input an operator is routinely typing in.
    await page.locator('header button').first().click();
    await expect(page.locator('[data-sidebar-nav-column][data-open="true"]')).toBeVisible();
    const filter = page.locator('[data-sidebar-nav-column] input');
    await filter.click();
    await filter.fill('some query');
    await expect(filter).toBeFocused();

    await page.keyboard.press('Meta+k');
    await expect(
      page.locator(CMDK_ROOT).first(),
      'a modifier chord is not a typed character — it must not stand down for inputs',
    ).toBeVisible();
  });

  test('exactly ONE surface answers the chord', async ({ page }) => {
    await boot(page);
    await page.keyboard.press('Meta+k');
    await expect(page.locator(CMDK_ROOT).first()).toBeVisible();

    // The Quick Access menu used to open on the same press. Its popover is a
    // dialog labelled "Quick access"; nothing but the palette may appear.
    await expect(page.locator('[role="dialog"][aria-label="Quick access"]')).toHaveCount(0);
  });

  test('identifier-shaped query switches to find mode (no spine page titles)', async ({
    page,
  }) => {
    await boot(page);
    await page.keyboard.press('Meta+k');
    const root = page.locator(CMDK_ROOT).first();
    await expect(root).toBeVisible();

    // Empty / word mode shows spine bands (e.g. Receiving). Identifier mode
    // must hide those and lead with Find triage instead.
    const input = root.locator('[cmdk-input]');
    await input.fill('1Z999AA10123456784');
    await expect(root.getByText('Find', { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      root.getByText('See all results for', { exact: false }).first(),
    ).toBeVisible();
    // Spine section headings should not compete with identifier triage.
    await expect(root.getByText('Child pages', { exact: true })).toHaveCount(0);
  });
});
