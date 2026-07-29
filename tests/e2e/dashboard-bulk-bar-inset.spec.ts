import { test, expect, type Page } from '@playwright/test';

/**
 * Dashboard bulk bar — the bounded grid host reserves room for the capsule.
 *
 * The pinned selection capsule is `fixed` to the viewport, and the outbound
 * grids self-scroll inside a **bounded** host (`workbenchTableViewportClass`),
 * so grid content ends at the host's bottom edge — not the page's. Padding the
 * page's outer scroll body does nothing; only the bounded host can move that
 * edge, which is why `bulkBarInset` is threaded down to it.
 *
 * The guarantee under test is geometric, not cosmetic: **the grid's scrollport
 * must end above the capsule's top while a selection is live.** Without the
 * reserve that margin was 2px, produced by the surrounding chrome rather than
 * by any rule — one header/KPI/padding change away from going negative.
 *
 * The scrollport edge is the assertion (not "the last row"): the grid is
 * virtualized, so the last row in the DOM belongs to the render window and can
 * sit below the fold. Rows are clipped by the port, so `portBottom` is the
 * lowest pixel any row can ever occupy — a stronger claim than sampling one row
 * and one that does not move when row height or overscan changes.
 *
 * Both lanes are covered because they reach the host through independent
 * chains: Pending via `UnshippedTable → UnshippedShelfBoard`, Packed via
 * `PackedOrdersTable`. A regression in either prop hand-off shows up here.
 */

/** Padding the host carries with no capsule over it (`pb-3`). */
const IDLE_INSET = '12px';
/** Padding the host carries while the capsule is up (`pb-20`). */
const RESERVED_INSET = '80px';
/**
 * Floor for the visible gap. Measured clearance at desktop 1440x900 is +45px
 * with the reserve and **-23px** without it, so a floor comfortably between the
 * two catches a dropped or under-sized reserve without breaking on a row-height
 * or density tweak. (An intermediate `pb-8` was tried and measured -3px — still
 * overlapping; that is the failure this floor exists to catch.)
 */
const MIN_CLEARANCE_PX = 16;

interface Geometry {
  padBottom: string;
  /** Bottom edge of the grid's own scrollport — rows are clipped at this line. */
  portBottom: number;
  capsuleTop: number | null;
  /** Bottom of the last row currently rendered, for failure diagnostics only. */
  lastRenderedRowBottom: number | null;
}

async function measure(page: Page, gridTestId: string): Promise<Geometry> {
  return page.evaluate((id) => {
    const grid = document.querySelector(`[data-testid="${id}"]`);
    if (!grid) throw new Error(`grid ${id} not mounted`);
    // The bounded host is the grid's direct parent (see the lane components).
    const host = grid.parentElement as HTMLElement;
    const port = (grid.querySelector('[data-cf-grid]') ?? grid) as HTMLElement;
    const rows = port.querySelectorAll('[role="row"]');
    const last = rows[rows.length - 1] as HTMLElement | undefined;
    const bar = document.querySelector('[role="toolbar"][aria-label^="Bulk actions"]');
    const capsule = bar?.parentElement?.getBoundingClientRect() ?? null;
    return {
      padBottom: getComputedStyle(host).paddingBottom,
      portBottom: Math.round(port.getBoundingClientRect().bottom),
      capsuleTop: capsule ? Math.round(capsule.top) : null,
      lastRenderedRowBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null,
    };
  }, gridTestId);
}

/** Drive the grid's own Y scroll to the end — the page scroll never reaches it. */
async function scrollGridToEnd(page: Page, gridTestId: string): Promise<void> {
  await page.evaluate((id) => {
    const grid = document.querySelector(`[data-testid="${id}"]`);
    const outer = document.querySelector('[data-testid="dashboard-scroll"]');
    if (outer) outer.scrollTop = outer.scrollHeight;
    const port = grid?.querySelector('[data-cf-grid]') ?? grid;
    if (port) port.scrollTop = port.scrollHeight;
  }, gridTestId);
  await page.waitForTimeout(400);
}

test.describe('Dashboard bulk bar — grid reserves room for the capsule', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  function laneTest(lane: string, query: string, gridTestId: string) {
    test(`${lane}: the grid clears the capsule once a row is selected`, async ({ page }) => {
      await page.goto(`/dashboard?${query}`);

      const rows = page.locator('[data-order-row-id]');
      await expect(rows.first()).toBeVisible({ timeout: 30_000 });

      // Baseline: no capsule, so the host keeps its ordinary inset.
      const idle = await measure(page, gridTestId);
      expect(idle.padBottom).toBe(IDLE_INSET);
      expect(idle.capsuleTop).toBeNull();

      await rows.first().getByRole('checkbox').first().check();

      const bar = page.getByRole('toolbar', { name: /^Bulk actions/ });
      await expect(bar).toBeVisible({ timeout: 20_000 });

      // Scroll the grid to its end so a real last row is on screen — the
      // clearance claim is only meaningful for a fully-scrolled grid.
      await scrollGridToEnd(page, gridTestId);
      const reserved = await measure(page, gridTestId);

      // The reserve reached the bounded host through this lane's own chain.
      expect(reserved.padBottom).toBe(RESERVED_INSET);

      // …and it buys real clearance: no row can paint below the port edge,
      // and the port edge sits above the capsule.
      expect(reserved.capsuleTop).not.toBeNull();
      const clearance = reserved.capsuleTop! - reserved.portBottom;
      expect(
        clearance,
        `grid scrollport (${reserved.portBottom}) must clear the capsule (${reserved.capsuleTop})`,
      ).toBeGreaterThanOrEqual(MIN_CLEARANCE_PX);
    });
  }

  laneTest('Pending', 'unshipped', 'pending-grid-body');
  laneTest('Packed', 'packed', 'packed-grid-body');

  test('the reserve is released when the selection clears', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const rows = page.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });

    const checkbox = rows.first().getByRole('checkbox').first();
    await checkbox.check();
    await expect(page.getByRole('toolbar', { name: /^Bulk actions/ })).toBeVisible({
      timeout: 20_000,
    });
    expect((await measure(page, 'pending-grid-body')).padBottom).toBe(RESERVED_INSET);

    // Deselecting must give the rows back — a permanent reserve would cost
    // ~half a row of a warehouse monitor for a bar that is usually absent.
    await checkbox.uncheck();
    await expect
      .poll(async () => (await measure(page, 'pending-grid-body')).padBottom, { timeout: 10_000 })
      .toBe(IDLE_INSET);
  });
});
