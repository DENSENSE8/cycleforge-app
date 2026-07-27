import { test, expect, type Page } from '@playwright/test';

/**
 * Per-staff grid Fields menu → `staff_preferences.tableColumns` delta.
 *
 * The behaviour this locks is the whole point of the unified visibility waist:
 * a column a staffer turns off loses its TRACK everywhere (header, body rows,
 * group summaries) rather than rendering an empty ruled band — and the choice
 * follows the staffer across reloads because it is persisted, not local state.
 *
 * Asserts:
 *   (1) the grid opens LEAN — `tier: 'optional'` columns (condition / platform /
 *       serial on receiving) are absent until opted into;
 *   (2) opting one IN adds its track to header AND body;
 *   (3) the choice survives a full reload (persisted per staff, not useState);
 *   (4) turning a `core` column OFF removes its track entirely — no empty cell;
 *   (5) Reset restores the descriptor default;
 *   (6) the frozen identity pane (select · title) is never offered.
 */

test.describe('Grid Fields menu — per-staff columns', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'ledger grid is a desktop layout');

  const HISTORY_URL = '/receiving/history';

  const fieldsMenu = (page: Page) => page.locator('[data-grid-fields-menu]').first();
  const grid = (page: Page) => page.getByTestId('receiving-grid-body');
  /** Header + body cells share `data-col`, so one selector proves the whole track. */
  const track = (page: Page, key: string) => grid(page).locator(`[data-col="${key}"]`);

  const openMenu = async (page: Page) => {
    await fieldsMenu(page).getByRole('button', { name: /Fields/i }).click();
    await expect(page.getByRole('listbox', { name: 'Grid fields' })).toBeVisible();
  };

  const toggleField = async (page: Page, key: string) => {
    await page.locator(`[role="option"][data-field-key="${key}"]`).click();
    // The write is optimistic — the grid repaints before the PUT settles.
    await page.waitForTimeout(150);
  };

  const closeMenu = async (page: Page) => {
    await page.keyboard.press('Escape');
  };

  test.beforeEach(async ({ page }) => {
    await page.goto(HISTORY_URL);
    await expect(grid(page)).toBeVisible();
    // Start from the descriptor default so a leftover delta from a prior run
    // cannot make these assertions lie.
    await openMenu(page);
    const reset = page.getByRole('button', { name: /Reset to default/i });
    if (await reset.isVisible().catch(() => false)) {
      await reset.click();
      await page.waitForTimeout(200);
    }
    await closeMenu(page);
  });

  test('opens lean — optional columns are absent until opted in', async ({ page }) => {
    await expect(track(page, 'title').first()).toBeVisible();
    await expect(track(page, 'tracking').first()).toBeVisible();
    for (const optional of ['condition', 'platform', 'serial']) {
      await expect(track(page, optional)).toHaveCount(0);
    }
  });

  test('opting a column in adds its track, and it survives a reload', async ({ page }) => {
    await openMenu(page);
    await toggleField(page, 'serial');
    await closeMenu(page);

    await expect(track(page, 'serial').first()).toBeVisible();

    await page.reload();
    await expect(grid(page)).toBeVisible();
    await expect(track(page, 'serial').first()).toBeVisible();
  });

  test('turning a core column off removes the track, not just its contents', async ({ page }) => {
    const before = await track(page, 'qty').count();
    expect(before).toBeGreaterThan(0);

    await openMenu(page);
    await toggleField(page, 'qty');
    await closeMenu(page);

    // Zero elements — an empty-but-present ruled cell would still match here,
    // which is exactly the regression this asserts against.
    await expect(track(page, 'qty')).toHaveCount(0);
  });

  test('Reset restores the descriptor default', async ({ page }) => {
    await openMenu(page);
    await toggleField(page, 'serial');
    await toggleField(page, 'qty');
    await closeMenu(page);
    await expect(track(page, 'serial').first()).toBeVisible();
    await expect(track(page, 'qty')).toHaveCount(0);

    await openMenu(page);
    await page.getByRole('button', { name: /Reset to default/i }).click();
    await page.waitForTimeout(250);
    await closeMenu(page);

    await expect(track(page, 'qty').first()).toBeVisible();
    await expect(track(page, 'serial')).toHaveCount(0);
  });

  test('never offers the frozen identity pane', async ({ page }) => {
    await openMenu(page);
    await expect(page.locator('[role="option"][data-field-key="select"]')).toHaveCount(0);
    await expect(page.locator('[role="option"][data-field-key="title"]')).toHaveCount(0);
    // …and the tracks themselves stay put.
    await closeMenu(page);
    await expect(track(page, 'title').first()).toBeVisible();
  });
});
