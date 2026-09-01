import { test, expect, type Page } from '@playwright/test';

/**
 * Selection CTA hotkey reveal — keyboard `?` only.
 *
 * SoT: `src/lib/keyboard/shortcut-display-cohort.ts`
 * Law: press `?` → opaque Linear keycap overlays the Button, right-aligned
 * inside the face. Zero layout shift (width, gap, positions of neighbors).
 * No foot `?`. No cheat sheet while selected. No flash on key-repeat.
 *
 * Run: npx playwright test tests/e2e/selection-inline-hotkey-reveal.spec.ts --project=desktop
 */

const ROUTE = '/shipping/orders';

const statusBar = (page: Page) => page.getByTestId('data-table-status').first();
const selectionActions = (page: Page) =>
  page.getByTestId('data-table-selection-actions').first();

async function selectFirstOrder(page: Page) {
  const row = page.locator('[data-order-row-id]').first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const box = row.locator('[data-select-gutter] [role="checkbox"]').first();
  await expect(box).toBeVisible();
  await box.click();
  await expect(selectionActions(page)).toBeVisible({ timeout: 20_000 });
}

test.describe('Selection CTA · keyboard `?` overlay reveal', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'ops chrome is a desktop layout');
  test.skip(({ isMobile }) => isMobile, 'selection foot strip is a desktop layout');

  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await expect(page.getByTestId('data-table-toolbar').first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('`?` overlays Linear keycaps inside the face with zero layout shift', async ({
    page,
  }) => {
    await selectFirstOrder(page);
    await expect(statusBar(page)).toBeVisible();

    await expect(page.getByTestId('data-table-selection-hotkey-hints')).toHaveCount(0);
    await expect(page.getByTestId('data-table-selection-hotkey-cap')).toHaveCount(0);

    const copy = page.getByTestId('data-table-selection-action-copy');
    const deleteBtn = page.getByTestId('data-table-selection-action-delete');
    await expect(copy).toBeVisible();

    const before = await page.evaluate(() => {
      const copyEl = document.querySelector(
        '[data-testid="data-table-selection-action-copy"]',
      ) as HTMLElement;
      const delEl = document.querySelector(
        '[data-testid="data-table-selection-action-delete"]',
      ) as HTMLElement;
      const bar = document.querySelector(
        '[data-testid="data-table-selection-actions"]',
      ) as HTMLElement;
      const c = copyEl.getBoundingClientRect();
      const d = delEl.getBoundingClientRect();
      return {
        copyW: c.width,
        copyX: c.x,
        deleteX: d.x,
        gap: getComputedStyle(bar).gap || getComputedStyle(bar).columnGap,
      };
    });

    await page.keyboard.press('?');

    const caps = page.getByTestId('data-table-selection-hotkey-cap');
    await expect(caps.first()).toBeVisible({ timeout: 5_000 });

    const after = await page.evaluate(() => {
      const copyEl = document.querySelector(
        '[data-testid="data-table-selection-action-copy"]',
      ) as HTMLElement;
      const delEl = document.querySelector(
        '[data-testid="data-table-selection-action-delete"]',
      ) as HTMLElement;
      const bar = document.querySelector(
        '[data-testid="data-table-selection-actions"]',
      ) as HTMLElement;
      const wrap = copyEl.closest(
        '[data-testid="data-table-selection-action-wrap"]',
      ) as HTMLElement;
      const cap = wrap.querySelector(
        '[data-testid="data-table-selection-hotkey-cap"]',
      ) as HTMLElement;
      const c = copyEl.getBoundingClientRect();
      const d = delEl.getBoundingClientRect();
      const k = cap.getBoundingClientRect();
      const cs = getComputedStyle(cap);
      return {
        copyW: c.width,
        copyX: c.x,
        deleteX: d.x,
        gap: getComputedStyle(bar).gap || getComputedStyle(bar).columnGap,
        btnLeft: c.left,
        btnRight: c.right,
        capLeft: k.left,
        capRight: k.right,
        opacity: cs.opacity,
        position: cs.position,
        bg: cs.backgroundColor,
      };
    });

    // Zero layout shift — faces and neighbors stay put.
    expect(Math.abs(after.copyW - before.copyW)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.copyX - before.copyX)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.deleteX - before.deleteX)).toBeLessThanOrEqual(1);
    expect(after.gap).toBe(before.gap);

    // Cap is an overlay inside the Button's horizontal bounds, right-biased.
    expect(after.position).toBe('absolute');
    expect(after.capLeft).toBeGreaterThanOrEqual(after.btnLeft);
    expect(after.capRight).toBeLessThanOrEqual(after.btnRight + 1);
    expect(after.capLeft).toBeGreaterThan((after.btnLeft + after.btnRight) / 2);
    expect(after.opacity).toBe('1');
    expect(after.bg).not.toMatch(/\/\s*0\.2/);

    await expect(page.getByTestId('keyboard-shortcuts-cheat-sheet')).toHaveCount(0);
    await expect(deleteBtn).toBeVisible();

    await page.keyboard.press('?');
    await expect(page.getByTestId('data-table-selection-hotkey-cap')).toHaveCount(0);
  });

  test('`?` reveals overlays even when Filter orders is focused', async ({ page }) => {
    await selectFirstOrder(page);

    const filter = page.getByPlaceholder(/filter orders/i);
    await expect(filter).toBeVisible();
    await filter.click();
    await expect(filter).toBeFocused();

    await expect(page.getByTestId('data-table-selection-hotkey-cap')).toHaveCount(0);
    await page.keyboard.press('?');
    await expect(page.getByTestId('data-table-selection-hotkey-cap').first()).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByTestId('keyboard-shortcuts-cheat-sheet')).toHaveCount(0);
    await expect(filter).toHaveValue('');
  });

  test('holding `?` does not flash (key-repeat ignored)', async ({ page }) => {
    await selectFirstOrder(page);

    await page.keyboard.press('?');
    await expect(page.getByTestId('data-table-selection-hotkey-cap').first()).toBeVisible();
    const mid = await page.getByTestId('data-table-selection-hotkey-cap').count();

    await page.evaluate(() => {
      for (let i = 0; i < 8; i += 1) {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: '?',
            bubbles: true,
            cancelable: true,
            repeat: true,
          }),
        );
      }
    });

    await expect(page.getByTestId('data-table-selection-hotkey-cap')).toHaveCount(mid);
  });
});
