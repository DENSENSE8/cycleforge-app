import { test, expect, type Page } from '@playwright/test';

/**
 * Receiving History's grid draws its columns from the BINDING and nothing else.
 *
 * Replaces `grid-column-display-hover.spec.ts`, which drove the Band-3 column
 * display (▦) rail: per-staff column visibility, per-column highlight wash,
 * cell mode, text emphasis, drag-resize and exact width / min / max. All of it
 * was deleted with the display layer on 2026-08-29
 * (`docs/todo/one-table-sot-teardown-HANDOFF.md` § 4.2), and the prefs the rail
 * wrote went with it: nothing writes `tableColumns[...].display` now, so every
 * read was returning a preference no operator could set.
 *
 * So the assertions invert. The old spec proved a control carried every job the
 * popover before it did; this one proves the control is gone and that the grid
 * is honest without it — one column set, declared once, identical for every
 * staffer. A per-staff column delta is exactly the fork the teardown removed,
 * and the cheapest way for it to come back is for someone to re-add "just a
 * small" column menu to one desk.
 */

test.describe('Receiving History · grid columns come from the binding', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'ledger grid is a desktop layout');

  const HISTORY_URL = '/receiving/history';

  const grid = (page: Page) => page.getByTestId('receiving-grid-body');
  /**
   * Header + body cells share `data-col`, so one selector proves the whole
   * track. Index 0 is the HEADER cell — a body assertion takes `.nth(1)`.
   */
  const track = (page: Page, key: string) => grid(page).locator(`[data-col="${key}"]`);

  test.beforeEach(async ({ page }) => {
    await page.goto(HISTORY_URL);
    await expect(grid(page)).toBeVisible({ timeout: 20_000 });
  });

  test('every mounted track renders — there is no per-staff subset', async ({ page }) => {
    /*
      The desk mounts the COMPOUND model, so these are its six tracks. The old
      column-display rail could hide any of them per staffer (and `tier:
      'optional'` columns started hidden until opted into); with the rail gone
      the mounted model IS what renders, for everyone. Asserting the full set
      present is what catches a re-introduced visibility filter — the failure
      mode is a silently narrower grid, which looks like a working page.
    */
    for (const key of ['fulfillment', 'thumb', 'item', 'state', 'amount']) {
      await expect(track(page, key).first()).toBeVisible();
    }
  });

  test('the column set survives a reload — it is declared, not remembered', async ({ page }) => {
    const headers = () => grid(page).locator('[role="columnheader"]');
    // `count()` does not retry, and the grid paints a skeleton first — read the
    // number only once the header row is actually there.
    await expect(headers().first()).toBeVisible({ timeout: 25_000 });
    const before = await headers().count();
    expect(before).toBeGreaterThan(0);

    await page.reload();
    await expect(grid(page)).toBeVisible({ timeout: 25_000 });
    // A cold reload refetches the week before it can paint a header row.
    await expect(headers().first()).toBeVisible({ timeout: 25_000 });
    await expect(headers()).toHaveCount(before);
  });

  test('no column-display control survives anywhere on the page', async ({ page }) => {
    await expect(page.locator('[data-grid-column-details-trigger]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Column display' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Column display' })).toHaveCount(0);
    // The popover the rail itself replaced must not have come back either.
    await expect(page.locator('[data-grid-fields-menu]')).toHaveCount(0);
    await expect(page.getByRole('listbox', { name: 'Grid fields' })).toHaveCount(0);
  });

  test('a column header carries no resize grip', async ({ page }) => {
    // Drag-resize (`ColumnResizeHandle`, `grid-column-resize-edges`) is gone.
    // A grip that still rendered would be a handle onto prefs nothing reads.
    const header = grid(page).locator('[role="columnheader"]').first();
    await expect(header).toBeVisible();
    await expect(grid(page).getByRole('button', { name: /Resize .* column/i })).toHaveCount(0);
  });

  test('a header opens no menu, and offers no sort it cannot perform', async ({ page }) => {
    /*
      `LedgerGridColumnContextMenu` was deleted, so a header click must do
      nothing but sort — and on this desk's compound model nothing IS sortable
      (`isReceivingGridSortable` is keyed on the flat tracks). A header that
      still advertised a sort here would be a control the engine will not honour,
      which is the same defect as a cell that looks editable and is not.
    */
    const header = grid(page).locator('[role="columnheader"][data-col="state"]').first();
    await expect(header).toBeVisible();

    // Counted before AND after, because the sidebar is itself a `role="menu"` —
    // asserting zero menus on the page would fail on chrome that has nothing to
    // do with the grid. What must not change is that a header click opens one.
    const menusBefore = await page.getByRole('menu').count();
    await header.click();
    await expect(page.getByRole('menu')).toHaveCount(menusBefore);
    await expect(header).not.toHaveAttribute('aria-sort', /ascending|descending/);
    await expect(header.locator('button')).toHaveCount(0);
  });

  test('no cell carries a per-column wash', async ({ page }) => {
    /*
      `display.highlight` painted a `#rrggbb` onto a whole track. Nothing writes
      it now, so a data cell must render the surface's own background — a wash
      surviving here would mean a stale stored pref is still being read.
    */
    const bodyCell = track(page, 'state').nth(1);
    await expect(bodyCell).toBeVisible();
    const bg = await bodyCell.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(['rgba(0, 0, 0, 0)', 'transparent']).toContain(bg);
  });
});
