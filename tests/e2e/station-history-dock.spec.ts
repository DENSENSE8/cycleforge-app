import { test, expect, type Page } from '@playwright/test';

/**
 * The station history dock — `docs/todo/one-sheet-table-sot-PLAN.md` Phase 7.
 *
 * The dock's whole justification is the interaction budget: a status overview
 * costs **≤ 1 interaction**, and opening the page is the one. So the assertions
 * are about it being THERE and being LEFTMOST on load — not about its contents,
 * which are the station's data and change every shift.
 */

const STATIONS: { name: string; route: string }[] = [
  { name: 'Unbox', route: '/unbox' },
  { name: 'Testing', route: '/test?mode=testing' },
  { name: 'Shipping', route: '/test?mode=shipping' },
];

const dock = (page: Page) => page.locator('[data-station-history-dock]').first();

test.describe('scan-station history dock', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'stations are a desktop layout');

  for (const station of STATIONS) {
    test(`${station.name}: history is visible on load — zero interactions`, async ({ page }) => {
      await page.goto(station.route);
      await expect(dock(page)).toBeVisible({ timeout: 20_000 });
    });

    test(`${station.name}: the dock is the LEFTMOST column`, async ({ page }) => {
      await page.goto(station.route);
      const d = dock(page);
      await expect(d).toBeVisible({ timeout: 20_000 });

      const dockBox = await d.boundingBox();
      if (!dockBox) throw new Error('no dock bounding box');

      // Nothing inside the station's own body may start left of the dock. The
      // grid's frozen identity pane is the thing that must not be covered — an
      // operator matching a scan against the list needs both at once.
      const body = page.locator('[data-sheet-toolbar], [data-testid$="-grid-body"]').first();
      if (await body.count()) {
        const bodyBox = await body.boundingBox();
        if (bodyBox) expect(bodyBox.x).toBeGreaterThanOrEqual(dockBox.x);
      }
    });

    test(`${station.name}: the dock is not collapsible chrome`, async ({ page }) => {
      await page.goto(station.route);
      const d = dock(page);
      await expect(d).toBeVisible({ timeout: 20_000 });
      // No toggle inside it. A rail an operator can collapse is a rail the next
      // operator inherits collapsed, which puts the glance back over budget.
      await expect(d.locator('button[aria-expanded]')).toHaveCount(0);
    });
  }

  test('the dock scrolls independently of the sheet', async ({ page }) => {
    await page.goto('/unbox');
    const d = dock(page);
    await expect(d).toBeVisible({ timeout: 20_000 });
    // Its own port: scrolling back through the morning's scans must not move
    // the row the operator is about to act on.
    //
    // Located by testid, not by `div:nth(1)`. The positional form passed or
    // failed on the dock's internal markup rather than on the property being
    // asserted — it broke the moment the header gained a wrapper.
    const port = d.locator('[data-testid="station-history-dock-scroll"]');
    await expect(port).toHaveCount(1);
    const overflow = await port.evaluate((el) => getComputedStyle(el).overflowY);
    expect(['auto', 'scroll']).toContain(overflow);
  });
});
