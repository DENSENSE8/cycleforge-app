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

  /**
   * The Reset control is a listbox OPTION, not a button.
   * `ToolbarListboxOption` renders a `<button>` element but sets an explicit
   * `role="option"`, and an explicit ARIA role wins over the implicit one — so
   * `getByRole('button', …)` never matched it. That is what made the old
   * `beforeEach` reset a silent no-op and left `qty` hidden in
   * `staff_preferences` for every later spec in the run.
   */
  const resetOption = (page: Page) => page.getByRole('option', { name: /Reset to default/i });

  /**
   * Restore the descriptor default and PROVE it took.
   *
   * The previous version wrapped the click in `if (await reset.isVisible())`, so
   * a locator that matched nothing skipped cleanup instead of failing. A cleanup
   * step that can silently do nothing is worse than none: it reads as hygiene
   * while leaving persisted state behind. `Reset to default` only renders when a
   * delta exists (`dirtyCount > 0`), so its ABSENCE is the legitimate no-op —
   * that case is allowed, and every other case must end at the default.
   */
  const restoreDefaults = async (page: Page) => {
    await openMenu(page);
    if (await resetOption(page).count()) {
      await resetOption(page).click();
      await page.waitForTimeout(250);
    }
    await closeMenu(page);
    // Loud, not hopeful: `qty` is a `core` column and `serial` is `optional`,
    // so this pair is the descriptor default by definition.
    await expect(track(page, 'qty').first()).toBeVisible();
    await expect(track(page, 'serial')).toHaveCount(0);
  };

  test.beforeEach(async ({ page }) => {
    await page.goto(HISTORY_URL);
    await expect(grid(page)).toBeVisible();
    await restoreDefaults(page);
  });

  /**
   * These tests persist a per-staff delta to the DATABASE, so without this they
   * leak into every later spec that asserts on default columns — which is
   * exactly how `ledger-grid-column-display` started failing on a hidden `qty`.
   */
  test.afterEach(async ({ page }) => {
    await page.goto(HISTORY_URL);
    await expect(grid(page)).toBeVisible();
    await restoreDefaults(page);
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
    await resetOption(page).click();
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
