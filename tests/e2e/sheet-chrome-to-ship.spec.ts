import { test, expect, type Page } from '@playwright/test';
import {
  applyToShipTriageFacet,
  type ToShipTriageFacet,
} from '@/utils/dashboard-search-state';

/**
 * The Sheets shell on To-ship — `docs/todo/one-sheet-table-sot-PLAN.md`
 * Phases 1–3, exit criteria.
 *
 * Every assertion here is about a control's PLACE or its STATE, never its
 * pixels: the plan moved chrome without changing what any of it does, so what
 * needs pinning is that the move happened and that nothing it moved past
 * changed behaviour. In particular the tab strip still writes the same URL
 * param it always did — the deep-link contract is what the whole relocation
 * rides on.
 */

const ROUTE = '/dashboard?unshipped';

/** The sheet's chrome rows. */
const toolbar = (page: Page) => page.locator('[data-sheet-toolbar]').first();
const bottomBar = (page: Page) => page.locator('[data-sheet-bottom-bar]').first();

async function topOf(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  return box.y;
}

test.describe('To-ship · Sheets chrome', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'ops chrome is a desktop layout');

  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE);
    await expect(toolbar(page)).toBeVisible({ timeout: 20_000 });
  });

  test('tabs sit BELOW the grid, and the toolbar above it', async ({ page }) => {
    const bar = bottomBar(page);
    await expect(bar).toBeVisible();

    // A tab is in the bottom bar, not in a header band.
    const allTab = bar.locator('[data-testid="sheet-tab-all"]');
    await expect(allTab).toBeVisible();

    const toolbarY = await topOf(page, '[data-sheet-toolbar]');
    const barY = await topOf(page, '[data-sheet-bottom-bar]');
    expect(barY).toBeGreaterThan(toolbarY);
  });

  test('a tab click still writes the URL — the deep-link contract is unchanged', async ({
    page,
  }) => {
    /*
      The assertion the whole relocation depends on: if tabs stopped being
      URL-addressable, every bookmark would break silently while the strip still
      looked right.

      The expected params come from `applyToShipTriageFacet`, the SoT the tabs
      call — NOT from a literal. An earlier draft of this test asserted a
      `?facet=` param that has never existed, and it failed against working code
      while claiming the contract was broken. A test that invents the contract it
      checks is worse than no test.
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
      An earlier draft asserted that "All" cleared every param `must_ship`
      wrote, and failed on `unshipped=` while the behaviour was right.
    */
    const refinement = [...mustShip.entries()].filter(([k]) => !all.has(k));
    expect(refinement.length).toBeGreaterThan(0);

    await bottomBar(page).locator('[data-testid="sheet-tab-must_ship"]').click();
    for (const [key, value] of refinement) {
      await expect(page).toHaveURL(new RegExp(`${key}=${value}`));
    }

    await bottomBar(page).locator('[data-testid="sheet-tab-all"]').click();
    for (const [key] of refinement) {
      await expect(page).not.toHaveURL(new RegExp(`${key}=`));
    }
    // The lane survives the facet switch — it is scope, not refinement.
    for (const [key] of all.entries()) {
      await expect(page).toHaveURL(new RegExp(`${key}=`));
    }
  });

  test('a deep link still selects its tab', async ({ page }) => {
    const params = new URLSearchParams({ unshipped: '' });
    applyToShipTriageFacet(params, 'urgent');
    await page.goto(`/dashboard?${params.toString()}`);
    const tab = bottomBar(page).locator('[data-testid="sheet-tab-urgent"]');
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  });

  test('the find field is a FIXED width, not the whole left', async ({ page }) => {
    const field = toolbar(page).locator('input[placeholder="Filter orders…"]').first();
    await expect(field).toBeVisible();
    const box = await field.boundingBox();
    const bar = await toolbar(page).boundingBox();
    if (!box || !bar) throw new Error('no bounding box');
    // 220px by design. The point is that it does NOT stretch: on a wide desk
    // Band 3's `flex-1` field spent most of the row saying nothing.
    expect(box.width).toBeLessThan(bar.width / 2);
  });

  test('the filter button lights and counts when a refinement is on', async ({ page }) => {
    const button = toolbar(page).locator('[data-testid="sheet-filter-button"]');
    await expect(button).toBeVisible();
    // Nothing refined yet: the control must NOT be lit. A control that is lit on
    // load teaches an operator to ignore the lit state entirely.
    await expect(button).toHaveAttribute('aria-pressed', 'false');

    await page.goto('/dashboard?unshipped&attention=1');
    await expect(toolbar(page).locator('[data-testid="sheet-filter-button"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('the filter dropdown opens on click', async ({ page }) => {
    await toolbar(page).locator('[data-testid="sheet-filter-button"]').click();
    await expect(page.locator('[data-testid="sheet-filter-menu"]')).toBeVisible();
  });

  test('row counts render bottom-right; zero selected renders nothing', async ({ page }) => {
    const counts = bottomBar(page).locator('[data-testid="sheet-status-counts"]');
    await expect(counts).toBeVisible();
    await expect(counts.locator('[data-testid="sheet-row-count"]')).toBeVisible();
    // "0 selected" is a sentence about something that has not happened.
    await expect(counts.locator('[data-testid="sheet-selected-count"]')).toHaveCount(0);
  });

  test('KPI is gone from the sheet', async ({ page }) => {
    await expect(page.locator('[data-workbench-kpi-band]')).toHaveCount(0);
    await expect(page.locator('[data-testid="workbench-kpi-collapse-toggle"]')).toHaveCount(0);
  });

  test('the desk Add CTA is gone — creation is the global header\'s', async ({ page }) => {
    await expect(page.locator('[data-testid="outbound-chrome-add"]')).toHaveCount(0);
    // …and the global one is still there, or creation would be unreachable.
    await expect(page.locator('[data-global-add="mounted"]')).toBeVisible();
  });

  test('the Sheets verbs are on the row', async ({ page }) => {
    const bar = toolbar(page);
    for (const id of [
      'sheet-copy-all',
      'sheet-export',
      'sheet-print',
      'sheet-zoom-out',
      'sheet-zoom-in',
      'sheet-bold',
      'sheet-italic',
      'sheet-strike',
      'sheet-text-color',
      'sheet-fill-color',
      'sheet-align-left',
      'sheet-align-center',
      'sheet-align-right',
      'sheet-fullscreen',
    ]) {
      await expect(bar.locator(`[data-testid="${id}"]`)).toBeVisible();
    }
  });

  test('format marks are inert until a column is targeted', async ({ page }) => {
    // A mark that fired with no target would paint a column the operator never
    // chose — the reason the picker leads the group.
    await expect(toolbar(page).locator('[data-testid="sheet-bold"]')).toBeDisabled();
    await toolbar(page).locator('[data-testid="sheet-format-column"]').click();
    await expect(page.locator('[data-testid="sheet-format-column-menu"]')).toBeVisible();
  });

  test('zoom steps the grid density without a transform', async ({ page }) => {
    const host = page.locator('[data-grid-zoom]').first();
    await expect(host).toHaveAttribute('data-grid-zoom', '100');

    await toolbar(page).locator('[data-testid="sheet-zoom-out"]').click();
    await expect(host).toHaveAttribute('data-grid-zoom', '90');

    // The percentage is the reset affordance.
    await toolbar(page).locator('[data-testid="sheet-zoom-level"]').click();
    await expect(host).toHaveAttribute('data-grid-zoom', '100');

    // Never `transform: scale()` — it blurs text and moves the resize grips
    // away from their hit targets.
    const transform = await host.evaluate((el) => getComputedStyle(el).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
  });

  test('fullscreen fills the frame and Esc leaves it', async ({ page }) => {
    await toolbar(page).locator('[data-testid="sheet-fullscreen"]').click();
    await expect(page.locator('[data-sheet-fullscreen]')).toBeVisible();
    // The toolbar and the bottom bar survive — an operator who maximised a
    // sheet has not asked to lose its controls.
    await expect(toolbar(page)).toBeVisible();
    await expect(bottomBar(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-sheet-fullscreen]')).toHaveCount(0);
  });
});
