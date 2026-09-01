import { test, expect, type Page } from '@playwright/test';
import {
  applyToShipTriageFacet,
  type ToShipTriageFacet,
} from '@/utils/dashboard-search-state';

/**
 * To-ship on `DataTable` — the ONE table display
 * (`docs/todo/one-table-sot-teardown-HANDOFF.md`).
 *
 * Every assertion is about a control's PLACE or its STATE, never its pixels.
 * The teardown deleted the sheet toolbar, its tab band and the whole
 * interactive layer around the grid; what survives is a search field, ONE
 * filter control beside it, ONE sort control beside that, and a bottom strip
 * carrying counts. The triage facets moved from the bottom tab strip INTO the
 * filter control (operator ruling 2026-08-30 — selection tabs are filters),
 * and this file pins that: the facets write the same URL params they always
 * did — the deep-link contract is what every relocation rides on — and the
 * retired tab strip does not come back on this desk.
 *
 * Replaces `sheet-chrome-to-ship.spec.ts`, whose selectors (`data-sheet-toolbar`,
 * `sheet-tab-*`, `sheet-filter-button`, `sheet-status-counts`) all named the
 * deleted shell.
 */

const ROUTE = '/shipping/orders';

/** The two chrome rows `DataTable` draws — above the grid and below it. */
const toolbar = (page: Page) => page.getByTestId('data-table-toolbar').first();
const statusBar = (page: Page) => page.getByTestId('data-table-status').first();

async function topOf(page: Page, testId: string): Promise<number> {
  const box = await page.getByTestId(testId).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${testId}`);
  return box.y;
}

test.describe('To-ship · DataTable chrome', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'ops chrome is a desktop layout');

  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await expect(toolbar(page)).toBeVisible({ timeout: 20_000 });
  });

  test('the bottom strip carries counts, not tabs — facets live in the filter', async ({
    page,
  }) => {
    const bar = statusBar(page);
    await expect(bar).toBeVisible();

    // The tab strip is GONE from this desk (ruling 2026-08-30); the facets are
    // filter options now.
    await expect(bar.locator('[role="tab"]')).toHaveCount(0);
    await expect(bar.getByTestId('data-table-tab-must_ship')).toHaveCount(0);
    await toolbar(page).getByTestId('data-table-filter').click();
    const menu = page.getByTestId('data-table-filter-menu');
    await expect(menu.getByTestId('data-table-filter-must_ship')).toBeVisible();
    await expect(menu.getByTestId('data-table-filter-urgent')).toBeVisible();
    await page.keyboard.press('Escape');

    const toolbarY = await topOf(page, 'data-table-toolbar');
    const barY = await topOf(page, 'data-table-status');
    expect(barY).toBeGreaterThan(toolbarY);
  });

  test('a facet pick still writes the URL — the deep-link contract is unchanged', async ({
    page,
  }) => {
    /*
      The expected params come from `applyToShipTriageFacet`, the SoT the
      options call — NOT from a literal. An earlier draft of this test asserted
      a `?facet=` param that has never existed, and it failed against working
      code while claiming the contract was broken. A test that invents the
      contract it checks is worse than no test.
    */
    const expected = (facet: ToShipTriageFacet) => {
      const params = new URLSearchParams();
      applyToShipTriageFacet(params, facet);
      return params;
    };

    const mustShip = expected('must_ship');
    const all = expected('all');
    /*
      Only the params that DIFFER between the two facets are the refinement.
      `applyToShipTriageFacet` also writes `unshipped=` — the LANE flag, which
      is the same on every facet and correctly survives switching between them.
    */
    const refinement = [...mustShip.entries()].filter(([k]) => !all.has(k));
    expect(refinement.length).toBeGreaterThan(0);

    await toolbar(page).getByTestId('data-table-filter').click();
    const option = page
      .getByTestId('data-table-filter-menu')
      .getByTestId('data-table-filter-must_ship');
    await option.click();
    for (const [key, value] of refinement) {
      await expect(page).toHaveURL(new RegExp(`${key}=${value}`));
    }

    /*
      There is no **All** option: `all` is the absence of a filter, so picking
      the ACTIVE option is what clears back to the unfiltered list.
    */
    await option.click();
    for (const [key] of refinement) {
      await expect(page).not.toHaveURL(new RegExp(`${key}=`));
    }
    // The lane survives the facet switch — it is scope, not refinement.
    for (const [key] of all.entries()) {
      await expect(page).toHaveURL(new RegExp(`${key}=`));
    }
  });

  test('a deep link still lights its facet', async ({ page }) => {
    const params = new URLSearchParams({ unshipped: '' });
    applyToShipTriageFacet(params, 'urgent');
    await page.goto(`/dashboard?${params.toString()}`);
    // The funnel is lit, and the menu shows the facet active.
    await expect(toolbar(page).getByTestId('data-table-filter')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await toolbar(page).getByTestId('data-table-filter').click();
    await expect(
      page.getByTestId('data-table-filter-menu').getByTestId('data-table-filter-urgent'),
    ).toHaveAttribute('data-active', '');
  });

  test('there is no All option — the unfiltered list lights nothing', async ({ page }) => {
    await expect(toolbar(page).getByTestId('data-table-filter')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await toolbar(page).getByTestId('data-table-filter').click();
    await expect(
      page.getByTestId('data-table-filter-menu').getByTestId('data-table-filter-all'),
    ).toHaveCount(0);
  });

  test('the find field is a FIXED width, not the whole left', async ({ page }) => {
    const field = toolbar(page).locator('input[placeholder="Filter orders…"]').first();
    await expect(field).toBeVisible();
    const box = await field.boundingBox();
    const bar = await toolbar(page).boundingBox();
    if (!box || !bar) throw new Error('no bounding box');
    // The point is that it does NOT stretch: on a wide desk the old Band 3's
    // `flex-1` field spent most of the row saying nothing.
    expect(box.width).toBeLessThan(bar.width / 2);
  });

  test('the find field holds text and nothing else', async ({ page }) => {
    /*
      § 2.1 — no funnel, no chips, no paste button, no inline content. The
      clipboard button went with the rest of the in-field chrome; Cmd/Ctrl+V
      still pastes, and it is not a control that has to be drawn.
    */
    const field = toolbar(page).locator('input[placeholder="Filter orders…"]').first();
    await expect(field).toBeVisible();
    await expect(toolbar(page).getByRole('button', { name: 'Paste from clipboard' })).toHaveCount(0);
    // Exactly one filter control on the row, and it is OUTSIDE the field.
    await expect(toolbar(page).getByTestId('data-table-filter')).toHaveCount(1);
  });

  test('the filter button lights and counts when a refinement is on', async ({ page }) => {
    const button = toolbar(page).getByTestId('data-table-filter');
    await expect(button).toBeVisible();
    // Nothing refined yet: the control must NOT be lit. A control that is lit on
    // load teaches an operator to ignore the lit state entirely.
    await expect(button).toHaveAttribute('aria-pressed', 'false');

    await page.goto('/dashboard?unshipped&stage=packed');
    await expect(toolbar(page).getByTestId('data-table-filter')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the filter dropdown opens on click', async ({ page }) => {
    await toolbar(page).getByTestId('data-table-filter').click();
    await expect(page.getByTestId('data-table-filter-menu')).toBeVisible();
  });

  test('the sort control sits in the toolbar and writes ?sort=', async ({ page }) => {
    const sort = toolbar(page).getByTestId('data-table-sort');
    await expect(sort).toBeVisible();
    await expect(sort).toHaveAttribute('aria-pressed', 'false');

    const filterBox = await toolbar(page).getByTestId('data-table-filter').boundingBox();
    const sortBox = await sort.boundingBox();
    expect(filterBox && sortBox).toBeTruthy();
    expect(sortBox!.x).toBeGreaterThan(filterBox!.x);

    await sort.click();
    const menu = page.getByTestId('data-table-sort-menu');
    await expect(menu.getByTestId('data-table-sort-tab-View')).toBeVisible();
    await expect(menu.getByTestId('data-table-sort-tab-Platform')).toBeVisible();
    await expect(menu.getByTestId('data-table-sort-tab-Carriers')).toBeVisible();
    await expect(menu.getByTestId('data-table-sort-tab-Column')).toHaveCount(0);
    await expect(menu.getByTestId('data-table-sort-tab-Channel')).toHaveCount(0);
    await expect(menu.getByText('Priority (due soon)')).toHaveCount(0);

    await expect(menu.getByTestId('data-table-sort-newest')).toBeVisible();
    await expect(menu.getByTestId('data-table-sort-deadline')).toBeVisible();
    await expect(menu.getByTestId('data-table-sort-filter')).toHaveCount(0);
    await expect(menu.getByTestId('data-table-sort-picked')).toHaveCount(0);
    await expect(menu.getByTestId('data-table-sort-packed')).toHaveCount(0);

    await menu.getByTestId('data-table-sort-tab-Carriers').click();
    await expect(menu.getByTestId('data-table-sort-filter')).toBeVisible();
    await expect(menu.getByTestId('data-table-sort-carrier-USPS')).toBeVisible();
    await expect(
      menu.getByTestId('data-table-sort-carrier-USPS').locator('[data-brand-identity]'),
    ).toHaveCount(0);
    await expect(menu.getByTestId('data-table-sort-carrier-USPS').locator('img')).toHaveCount(0);
    await expect(menu.getByTestId('data-table-sort-carrier-UPS')).toBeVisible();
    await expect(menu.getByTestId('data-table-sort-carrier')).toHaveCount(0);
    await expect(menu.getByText('USPS first')).toHaveCount(0);
    await menu.getByTestId('data-table-sort-filter').locator('input').fill('usps');
    await expect(menu.getByTestId('data-table-sort-carrier-USPS')).toBeVisible();
    await expect(menu.getByTestId('data-table-sort-carrier-UPS')).toHaveCount(0);
    await menu.getByTestId('data-table-sort-carrier-USPS').click();
    await expect(page).toHaveURL(/[?&]sort=carrier(:|%3A)USPS/);
    await expect(toolbar(page).getByTestId('data-table-sort')).toHaveAttribute(
      'aria-label',
      'Sort, USPS',
    );
    await expect(toolbar(page).getByTestId('data-table-sort')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  async function openViews(page: Page) {
    const views = toolbar(page).getByTestId('data-table-views');
    await views.getByRole('button').first().click();
    const menu = page.getByTestId('data-table-views-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveClass(/rounded-lg/);
    return { views, menu };
  }

  async function saveCurrentView(page: Page, name: string) {
    const { views, menu } = await openViews(page);
    const saveBtn = menu.getByTestId('data-table-views-save-current');
    for (let i = 0; i < 8 && (await saveBtn.isDisabled()); i += 1) {
      const del = menu.locator('button[aria-label^="Delete view"]').first();
      if ((await del.count()) === 0) break;
      const deleted = page.waitForResponse(
        (r) => /\/api\/saved-views\/\d+$/.test(r.url()) && r.request().method() === 'DELETE',
      );
      await del.click();
      await deleted;
    }
    await expect(saveBtn).toBeEnabled({ timeout: 15_000 });
    await saveBtn.click();
    await page.getByPlaceholder('Name this view…').fill(name);
    await menu.getByTestId('data-table-views-save').click();
    await expect(menu.getByRole('button', { name, exact: true })).toBeVisible({ timeout: 15_000 });
    return { views, menu };
  }

  async function closeViews(page: Page) {
    const menu = page.getByTestId('data-table-views-menu');
    if (!(await menu.isVisible())) return;
    // Escape is swallowed when focus left the portaled panel after Save.
    // The trigger is the same dismiss the operator uses.
    await toolbar(page).getByTestId('data-table-views').getByRole('button').first().click();
    await expect(menu).toBeHidden();
  }

  async function applyNamedView(page: Page, name: string) {
    const { menu } = await openViews(page);
    await menu.getByRole('button', { name, exact: true }).click();
    await expect(page.getByTestId('data-table-views-menu')).toBeHidden();
  }

  async function deleteNamedView(page: Page, name: string) {
    const deleted = page.waitForResponse(
      (r) => /\/api\/saved-views\/\d+$/.test(r.url()) && r.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: `Delete view ${name}` }).click();
    expect((await deleted).ok()).toBe(true);
  }

  test('saved views sit immediately right of sort — filter snapshot applies stored URL params', async ({
    page,
  }) => {
    const sort = toolbar(page).getByTestId('data-table-sort');
    const views = toolbar(page).getByTestId('data-table-views');
    await expect(views).toBeVisible();
    const sortBox = await sort.boundingBox();
    const viewsBox = await views.boundingBox();
    expect(sortBox && viewsBox).toBeTruthy();
    expect(viewsBox!.x).toBeGreaterThan(sortBox!.x);

    const name = `To-ship filter ${Date.now()}`;
    await toolbar(page).getByTestId('data-table-filter').click();
    await page.getByTestId('data-table-filter-menu').getByTestId('data-table-filter-must_ship').click();
    await expect(page).toHaveURL(/[?&]late=/);

    await saveCurrentView(page, name);
    await closeViews(page);

    await toolbar(page).getByTestId('data-table-filter').click();
    await page.getByTestId('data-table-filter-menu').getByTestId('data-table-filter-must_ship').click();
    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/[?&]late=/);

    await applyNamedView(page, name);
    await expect(page).toHaveURL(/[?&]late=/);
    await expect(views.getByRole('button').first()).toHaveAttribute(
      'aria-label',
      `Saved view: ${name}`,
    );

    await openViews(page);
    await deleteNamedView(page, name);
  });

  test('saved views persist a Platform sort pin and restore the exact sort face', async ({
    page,
  }) => {
    await toolbar(page).getByTestId('data-table-sort').click();
    await page.getByTestId('data-table-sort-menu').getByTestId('data-table-sort-tab-Platform').click();
    await page.getByTestId('data-table-sort-channel-Amazon').click();
    await expect(page).toHaveURL(/[?&]sort=channel(:|%3A)Amazon/);
    await expect(toolbar(page).getByTestId('data-table-sort')).toHaveAttribute(
      'aria-label',
      'Sort, Amazon',
    );
    await expect(
      toolbar(page).getByTestId('data-table-sort').locator('[data-brand-identity="platform"]'),
    ).toBeVisible();

    const name = `To-ship Amazon ${Date.now()}`;
    await saveCurrentView(page, name);
    await closeViews(page);

    await toolbar(page).getByTestId('data-table-sort').click();
    await page.getByTestId('data-table-sort-menu').getByTestId('data-table-sort-tab-View').click();
    await page.getByTestId('data-table-sort-deadline').click();
    await expect(page).not.toHaveURL(/[?&]sort=/);

    await applyNamedView(page, name);
    await expect(page).toHaveURL(/[?&]sort=channel(:|%3A)Amazon/);
    await expect(toolbar(page).getByTestId('data-table-sort')).toHaveAttribute(
      'aria-label',
      'Sort, Amazon',
    );
    await expect(
      toolbar(page).getByTestId('data-table-sort').locator('[data-brand-identity="platform"]'),
    ).toBeVisible();

    await openViews(page);
    await deleteNamedView(page, name);
  });

  test('header-click Product sort names the trigger and round-trips through a saved view', async ({
    page,
  }) => {
    const header = page.locator('[role="columnheader"][data-col="item"]').first();
    await expect(header).toBeVisible();
    await header.click();
    await expect(page).toHaveURL(/[?&]sort=title/);
    await expect(toolbar(page).getByTestId('data-table-sort')).toHaveAttribute(
      'aria-label',
      'Sort, Product',
    );
    await expect(toolbar(page).getByTestId('data-table-sort')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const name = `To-ship Product ${Date.now()}`;
    await saveCurrentView(page, name);
    await closeViews(page);

    await toolbar(page).getByTestId('data-table-sort').click();
    await page.getByTestId('data-table-sort-menu').getByTestId('data-table-sort-tab-View').click();
    await page.getByTestId('data-table-sort-deadline').click();
    await expect(page).not.toHaveURL(/[?&]sort=/);
    await expect(toolbar(page).getByTestId('data-table-sort')).toHaveAttribute('aria-label', 'Sort');

    await applyNamedView(page, name);
    await expect(page).toHaveURL(/[?&]sort=title/);
    await expect(toolbar(page).getByTestId('data-table-sort')).toHaveAttribute(
      'aria-label',
      'Sort, Product',
    );

    await openViews(page);
    await deleteNamedView(page, name);
  });

  test('an owned saved view can be renamed in place', async ({ page }) => {
    await toolbar(page).getByTestId('data-table-filter').click();
    await page.getByTestId('data-table-filter-menu').getByTestId('data-table-filter-must_ship').click();
    await expect(page).toHaveURL(/[?&]late=/);

    const name = `To-ship rename ${Date.now()}`;
    const renamed = `${name} b`;
    const { views, menu } = await saveCurrentView(page, name);

    await menu.getByRole('button', { name: `Rename view ${name}` }).click();
    const field = menu.getByPlaceholder('Name this view…');
    await expect(field).toBeFocused();
    const patched = page.waitForResponse(
      (r) => /\/api\/saved-views\/\d+$/.test(r.url()) && r.request().method() === 'PATCH',
    );
    await field.fill(renamed);
    await field.press('Enter');
    expect((await patched).ok()).toBe(true);
    await expect(menu.getByRole('button', { name: renamed, exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(views.getByRole('button').first()).toHaveAttribute(
      'aria-label',
      `Saved view: ${renamed}`,
    );

    await deleteNamedView(page, renamed);
  });

  test('Amazon pin clusters Order-column Amazon last-8s; eBay is not inserted between them', async ({
    page,
  }) => {
    const orderLast8Of = async () =>
      page.locator('[data-order-row-id]').evaluateAll((els) =>
        els.map((el) => {
          const face = el.querySelector('[data-chip-face]');
          return (face?.textContent || '').trim();
        }),
      );

    await toolbar(page).getByTestId('data-table-sort').click();
    const menu = page.getByTestId('data-table-sort-menu');
    await menu.getByTestId('data-table-sort-tab-Platform').click();
    await expect(menu.getByTestId('data-table-sort-filter')).toBeVisible();
    const amazon = menu.getByTestId('data-table-sort-channel-Amazon');
    await expect(amazon.locator('[data-brand-identity]')).toHaveCount(0);
    await expect(amazon.locator('img')).toHaveCount(0);
    await amazon.click();
    await expect(page).toHaveURL(/[?&]sort=channel(:|%3A)Amazon/);
    await expect(toolbar(page).getByTestId('data-table-sort')).toHaveAttribute(
      'aria-label',
      'Sort, Amazon',
    );
    await expect(
      toolbar(page).getByTestId('data-table-sort').locator('[data-brand-identity="platform"]'),
    ).toBeVisible();

    await toolbar(page).getByTestId('data-table-sort').click();
    const reopen = page.getByTestId('data-table-sort-menu');
    await reopen.getByTestId('data-table-sort-tab-Platform').click();
    await expect(reopen.getByTestId('data-table-sort-channel-Amazon')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('Escape');

    const isAmazonLast8 = (s: string) => /^-\d{7}$/.test(s);
    const isEbayLast8 = (s: string) => /^\d{2}-\d{5}$/.test(s);

    await expect
      .poll(async () => (await orderLast8Of()).some(isAmazonLast8), { timeout: 8_000 })
      .toBe(true);

    const last8s = await orderLast8Of();
    const faces = last8s.filter((s) => isAmazonLast8(s) || isEbayLast8(s));
    expect(faces.some(isAmazonLast8), 'desk must show Amazon 3-7-7 last-8s (-XXXXXXX)').toBe(true);

    const firstEbay = faces.findIndex(isEbayLast8);
    if (firstEbay >= 0) {
      expect(
        faces.slice(firstEbay + 1).filter(isAmazonLast8),
        'eBay last-8s must sit after the Amazon cluster, not in the middle',
      ).toEqual([]);
    }
  });

  test('row counts render bottom-right; zero selected renders nothing', async ({ page }) => {
    const bar = statusBar(page);
    await expect(bar.getByTestId('data-table-row-count')).toBeVisible();
    // "0 selected" is a sentence about something that has not happened.
    await expect(bar.getByTestId('data-table-selected-count')).toHaveCount(0);
    // Copy acts on a selection, so it is not on screen before there is one.
    await expect(bar.getByTestId('data-table-copy-selection')).toHaveCount(0);
  });

  test('KPI is gone from the desk', async ({ page }) => {
    await expect(page.locator('[data-workbench-kpi-band]')).toHaveCount(0);
    await expect(page.getByTestId('workbench-kpi-collapse-toggle')).toHaveCount(0);
  });

  test('the desk Add CTA is gone — creation is the global header\'s', async ({ page }) => {
    await expect(page.getByTestId('outbound-chrome-add')).toHaveCount(0);
    // …and the global one is still there, or creation would be unreachable.
    await expect(page.locator('[data-global-add="mounted"]')).toBeVisible();
  });

  test('the sheet toolbar did not come back', async ({ page }) => {
    /*
      The negative half of the teardown. Each of these WAS a control on this
      desk; the fork this rebuild removed is exactly the habit of re-adding one
      "just for this surface", so the list is asserted absent by name.
    */
    await expect(page.locator('[data-sheet-toolbar]')).toHaveCount(0);
    await expect(page.locator('[data-sheet-bottom-bar]')).toHaveCount(0);
    await expect(page.locator('[data-sheet-fullscreen]')).toHaveCount(0);
    await expect(page.locator('[data-grid-zoom]')).toHaveCount(0);
    for (const id of [
      'sheet-copy-all',
      'sheet-export',
      'sheet-print',
      'sheet-zoom-out',
      'sheet-zoom-in',
      'sheet-zoom-level',
      'sheet-bold',
      'sheet-italic',
      'sheet-strike',
      'sheet-text-color',
      'sheet-fill-color',
      'sheet-align-left',
      'sheet-align-center',
      'sheet-align-right',
      'sheet-fullscreen',
      'sheet-format-column',
      'sheet-filter-button',
      'sheet-status-counts',
    ]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  test('no cell opens an editor — correction is on the record plane', async ({ page }) => {
    /*
      In-cell editing was deleted with the rest of the display layer. A cell
      that still took focus and swallowed a keystroke would look editable and
      do nothing, which is worse than a plainly read-only grid.
    */
    // Scoped to a BODY row, not the header: the header cell carries the same
    // `data-col`, and clicking it sorts — which would pass this assertion
    // without ever touching a cell.
    const row = page.getByRole('checkbox', { name: /^Select order / }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    const cell = row.locator('[data-col="item"]').first();
    await expect(cell).toBeVisible({ timeout: 20_000 });
    await cell.click();
    await expect(page.locator('[data-ledger-cell-editor]')).toHaveCount(0);
    await expect(cell.locator('input, textarea')).toHaveCount(0);
  });
});
