import { test, expect, type Page } from '@playwright/test';

/**
 * Per-staff grid column fields → `staff_preferences.tableColumns` delta, driven
 * from the **hover-revealed column-display control on the card's top-right
 * corner**.
 *
 * It is the SOLE entry as of 2026-08-02: the chrome `GridFieldsMenu` that used
 * to open a second door onto this same rail was deleted, because Fields mutates
 * the column set of the card it sat above. This spec is what proves the control
 * actually carries every job the retired popover did — otherwise the migration
 * would be a silent capability loss.
 *
 * Its PLACEMENT was ruled twice the same day, and (0) below is what both
 * rulings were about: the control must reserve nothing. A permanent `w-9` header
 * track plus `pr-9` charged every row; a permanent gutter beside the card
 * charged every page. Hover-revealed, it charges neither — so every interaction
 * here hovers the card first, and (0) asserts it is invisible and inert at rest.
 *
 * The behaviour this locks is the whole point of the unified visibility waist:
 * a column a staffer turns off loses its TRACK everywhere (header, body rows,
 * group summaries) rather than rendering an empty ruled band — and the choice
 * follows the staffer across reloads because it is persisted, not local state.
 *
 * Asserts:
 *   (0) the control is invisible + inert at rest and reveals on hover;
 *   (1) the grid opens LEAN — `tier: 'optional'` columns (condition / platform /
 *       serial on receiving) are absent until opted into;
 *   (2) opting one IN adds its track to header AND body;
 *   (3) the choice survives a full reload (persisted per staff, not useState);
 *   (4) turning a `core` column OFF removes its track entirely — no empty cell;
 *   (5) Reset restores the descriptor default, and is absent while pristine;
 *   (6) the frozen identity pane (select · title) is never offered;
 *   (7) highlight wash applies to the track;
 *   (8) no chrome Fields control survives anywhere on the page.
 */

test.describe('Grid column fields — the hover-revealed header control', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'ledger grid is a desktop layout');

  const HISTORY_URL = '/receiving/history';

  const grid = (page: Page) => page.getByTestId('receiving-grid-body');
  /** Header + body cells share `data-col`, so one selector proves the whole track. */
  const track = (page: Page, key: string) => grid(page).locator(`[data-col="${key}"]`);

  /** The reveal wrapper — `toBeVisible()` cannot see `opacity: 0`, so assert CSS. */
  const triggerHost = (page: Page) =>
    page.locator('[data-grid-column-details-trigger]').locator('xpath=ancestor::div[1]');
  const trigger = (page: Page) =>
    page.locator('[data-grid-column-details-trigger]').getByRole('button', {
      name: 'Column display',
    });
  const rail = (page: Page) => page.getByRole('region', { name: 'Column display' });

  /**
   * Hover the CARD, then click. The control is `opacity-0` +
   * `pointer-events-none` at rest, so a bare `.click()` would land on the header
   * cell underneath — the honest consequence of a control that reserves nothing,
   * and exactly what this spec must model.
   */
  const openRail = async (page: Page) => {
    await grid(page).hover();
    await expect(triggerHost(page)).toHaveCSS('opacity', '1');
    await trigger(page).click();
    await expect(rail(page)).toBeVisible();
  };

  const closeRail = async (page: Page) => {
    await rail(page).getByRole('button', { name: 'Done' }).click();
    await expect(rail(page)).toHaveCount(0);
  };

  /**
   * Pick a column in the rail's list, then flip its Visible switch.
   *
   * Waits on the switch's own state flip rather than a fixed sleep: the write
   * is optimistic, so the control reflects it immediately while the PUT settles
   * behind — and a fixed timeout is exactly the kind of race that makes this
   * spec pass alone and fail in a full run.
   */
  const toggleField = async (page: Page, key: string, label: RegExp) => {
    await rail(page).locator(`[role="option"][data-column-details-key="${key}"]`).click();
    const sw = rail(page).getByRole('switch', { name: label });
    const before = await sw.getAttribute('data-state');
    await sw.click();
    await expect(sw).toHaveAttribute(
      'data-state',
      before === 'checked' ? 'unchecked' : 'checked',
    );
  };

  /**
   * Reset now lives in the rail FOOTER as a real button (the retired popover
   * rendered it as a listbox `role="option"`, which is why `getByRole('button')`
   * never matched it there and left cleanup a silent no-op).
   */
  const resetButton = (page: Page) => rail(page).getByRole('button', { name: /Reset/i });

  /**
   * Restore the descriptor default and PROVE it took.
   *
   * A cleanup step that can silently do nothing is worse than none: it reads as
   * hygiene while leaving persisted state behind. `Reset` only renders when a
   * delta exists (`dirtyCount > 0`), so its ABSENCE is the legitimate no-op —
   * that case is allowed, and every other case must end at the default.
   */
  const restoreDefaults = async (page: Page) => {
    await openRail(page);
    if (await resetButton(page).count()) {
      await resetButton(page).click();
      // Reset renders only while a delta exists, so its DISAPPEARANCE is the
      // settle signal — a fixed sleep would be guessing at the same thing.
      await expect(resetButton(page)).toHaveCount(0);
    }
    await closeRail(page);
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

  test('it is the only column control — no chrome Fields survives', async ({ page }) => {
    await grid(page).hover();
    await expect(triggerHost(page)).toHaveCSS('opacity', '1');
    // The retired popover's own marker and its listbox must both be gone.
    await expect(page.locator('[data-grid-fields-menu]')).toHaveCount(0);
    await expect(page.getByRole('listbox', { name: 'Grid fields' })).toHaveCount(0);
  });

  /**
   * THE point of the placement rulings, and the one assertion neither resident
   * version could pass — a `w-9` track and a page gutter are both visible at
   * rest, and both would sail through every other test in this file.
   */
  test('nothing is painted at rest; hover reveals, leaving hides again', async ({ page }) => {
    // Park the pointer off the card — `restoreDefaults` leaves it on the rail's
    // Done button.
    await page.mouse.move(0, 0);
    await expect(triggerHost(page)).toHaveCSS('opacity', '0');
    // Hidden means inert: the header cell underneath keeps its own clicks.
    await expect(triggerHost(page)).toHaveCSS('pointer-events', 'none');

    await grid(page).hover();
    await expect(triggerHost(page)).toHaveCSS('opacity', '1');

    await page.mouse.move(0, 0);
    await expect(triggerHost(page)).toHaveCSS('opacity', '0');
  });

  test('the control stays painted while its own rail is open', async ({ page }) => {
    await openRail(page);
    // Pointer leaves the card entirely — hover alone would drop the trigger out
    // from under the rail it just opened, leaving the panel with no owner.
    await page.mouse.move(0, 0);
    await expect(triggerHost(page)).toHaveCSS('opacity', '1');
    await closeRail(page);
  });

  /**
   * Airtable / Sheets drag-resize. The grip mutates the shared `--cf-col-*` var,
   * so header AND body cells move together — asserting only the header would
   * miss the regression this waist exists to prevent.
   */
  test('a column can be drag-resized, and the width persists per staff', async ({ page }) => {
    const headerCell = grid(page).locator('[role="columnheader"][data-col="title"]');
    const before = (await headerCell.boundingBox())!.width;

    const gripBox = (await headerCell
      .getByRole('button', { name: /Resize .* column/i })
      .boundingBox())!;
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(gripBox.x + 80, gripBox.y + gripBox.height / 2, { steps: 8 });
    await page.mouse.up();

    await expect
      .poll(async () => (await headerCell.boundingBox())!.width)
      .toBeGreaterThan(before + 40);

    // Header and body agree — one var drives both.
    const bodyCell = grid(page).locator('[data-col="title"]').nth(1);
    const bodyWidth = (await bodyCell.boundingBox())!.width;
    expect(Math.abs(bodyWidth - (await headerCell.boundingBox())!.width)).toBeLessThan(2);

    // Persisted, not local state.
    await page.reload();
    await expect(grid(page)).toBeVisible();
    await expect
      .poll(async () => (await headerCell.boundingBox())!.width)
      .toBeGreaterThan(before + 40);
  });

  test('opens lean — optional columns are absent until opted in', async ({ page }) => {
    await expect(track(page, 'title').first()).toBeVisible();
    await expect(track(page, 'tracking').first()).toBeVisible();
    for (const optional of ['condition', 'platform', 'serial']) {
      await expect(track(page, optional)).toHaveCount(0);
    }
  });

  test('opting a column in adds its track, and it survives a reload', async ({ page }) => {
    await openRail(page);
    await toggleField(page, 'serial', /Show Serial/i);
    await closeRail(page);

    await expect(track(page, 'serial').first()).toBeVisible();

    await page.reload();
    await expect(grid(page)).toBeVisible();
    await expect(track(page, 'serial').first()).toBeVisible();
  });

  test('turning a core column off removes the track, not just its contents', async ({ page }) => {
    const before = await track(page, 'qty').count();
    expect(before).toBeGreaterThan(0);

    await openRail(page);
    await toggleField(page, 'qty', /Show Qty/i);
    await closeRail(page);

    // Zero elements — an empty-but-present ruled cell would still match here,
    // which is exactly the regression this asserts against.
    await expect(track(page, 'qty')).toHaveCount(0);
  });

  test('Reset restores the descriptor default', async ({ page }) => {
    await openRail(page);
    await toggleField(page, 'serial', /Show Serial/i);
    await toggleField(page, 'qty', /Show Qty/i);
    await closeRail(page);
    await expect(track(page, 'serial').first()).toBeVisible();
    await expect(track(page, 'qty')).toHaveCount(0);

    await openRail(page);
    await expect(resetButton(page)).toBeVisible();
    await resetButton(page).click();
    await expect(resetButton(page)).toHaveCount(0);
    await closeRail(page);

    await expect(track(page, 'qty').first()).toBeVisible();
    await expect(track(page, 'serial')).toHaveCount(0);
  });

  test('Reset is absent while pristine — it never offers a no-op', async ({ page }) => {
    await openRail(page);
    await expect(resetButton(page)).toHaveCount(0);
    await closeRail(page);
  });

  test('never offers the frozen identity pane', async ({ page }) => {
    await openRail(page);
    await expect(
      rail(page).locator('[role="option"][data-column-details-key="select"]'),
    ).toHaveCount(0);
    await expect(
      rail(page).locator('[role="option"][data-column-details-key="title"]'),
    ).toHaveCount(0);
    await closeRail(page);
    // …and the tracks themselves stay put.
    await expect(track(page, 'title').first()).toBeVisible();
  });

  test('the column-display rail applies a highlight wash to the track', async ({ page }) => {
    await openRail(page);

    // Qty is a core column — set a blue track wash (Sheets-style hex swatch).
    await rail(page).locator('[role="option"][data-column-details-key="qty"]').click();
    await rail(page).locator('[data-highlight="#eff6ff"]').click();
    await closeRail(page);

    // The wash is a DATA-cell affordance: leaf rows carry it, while the column
    // HEADER keeps its own chrome. `track(...).first()` is the header cell, so
    // asserting on it is what the pre-lip version of this spec got wrong — it
    // could only ever have passed if the wash had leaked into the header.
    const qtyData = grid(page).locator('[data-col="qty"]').nth(1);
    await expect(qtyData).toHaveCSS('background-color', 'rgb(239, 246, 255)');
    await expect(track(page, 'qty').first()).not.toHaveCSS(
      'background-color',
      'rgb(239, 246, 255)',
    );

    // Put it back so the wash does not leak into later specs.
    await openRail(page);
    await rail(page).locator('[role="option"][data-column-details-key="qty"]').click();
    await rail(page).locator('[data-highlight="none"]').click();
    await closeRail(page);
  });
});
