import { test, expect, type Page } from '@playwright/test';

/**
 * The station history dock is GONE — and the budget it existed for still holds.
 *
 * `StationDeck`, `StationHistoryDock`, `ShippingHistoryDock`, `PackHistoryDock`
 * and `UnboxHistoryDock` were deleted with the display layer on 2026-08-29
 * (`docs/todo/one-table-sot-teardown-HANDOFF.md` § 4.4). This file used to
 * assert the dock was present and leftmost; it now asserts the opposite, plus
 * the thing the dock was justified by, which did NOT go away:
 *
 *   **a status overview costs ≤ 1 interaction** (`AGENTS.md`) — opening the
 *   page is the one, so the station's own list has to be on screen without a
 *   second click.
 *
 * Keeping the budget assertion is the point of rewriting rather than deleting:
 * "the dock is gone" alone would pass just as well on a station that now shows
 * nothing at all, which is the regression worth catching.
 */

const STATIONS: { name: string; route: string }[] = [
  { name: 'Unbox', route: '/unbox' },
  { name: 'Testing', route: '/test?mode=testing' },
  { name: 'Shipping', route: '/test?mode=shipping' },
];

/** Any binding-backed grid body — every station foots one. */
const stationBody = (page: Page) => page.locator('[data-testid$="-grid-body"]').first();

/**
 * Wait for the desk to have MOUNTED its list.
 *
 * Attachment, not visibility: Unbox's desk pane goes `visibility: hidden` while
 * a carton overlay owns the middle, and a station can legitimately restore a
 * carton on load — so a visibility gate here would make every assertion below
 * depend on whether the fixture happens to have one open.
 */
const settled = async (page: Page) => {
  await expect(stationBody(page)).toHaveCount(1, { timeout: 25_000 });
};

test.describe('scan-station history dock — deleted', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'stations are a desktop layout');

  for (const station of STATIONS) {
    test(`${station.name}: the dock and its scroll port are gone`, async ({ page }) => {
      await page.goto(station.route);
      await settled(page);
      await expect(page.locator('[data-station-history-dock]')).toHaveCount(0);
      await expect(page.getByTestId('station-history-dock-scroll')).toHaveCount(0);
    });

    test(`${station.name}: the list is mounted on load — zero interactions`, async ({
      page,
    }) => {
      /*
        The dock's whole justification, re-pinned against what replaced it. The
        station's own list IS the status overview now, so it must be THERE
        without a tab, a filter or an expand — no second fetch, no second click.
      */
      await page.goto(station.route);
      await settled(page);
      await expect(page.locator('[role="columnheader"]').first()).toHaveCount(1);
    });
  }

  test('Unbox hides its desk pane by VISIBILITY, never by unmounting it', async ({ page }) => {
    /*
      `UnboxLineWorkspace` toggles `visibility` on the desk pane while a carton
      overlay owns the middle (handoff § 7.4 — deliberately untouched). The
      mechanism matters: `visibility: hidden` keeps the list mounted, scrolled
      and warm, so closing the carton is a repaint rather than a refetch. That
      is exactly why a status readout could not live inside that pane — it
      disappeared at the one moment "did that scan land?" was being asked, which
      is what the deleted dock was for.

      So this pins the mechanism, not a fixture: the pane is present either way,
      and if it is hidden it is hidden by `visibility` on a mounted ancestor.
    */
    await page.goto('/unbox');
    await settled(page);
    const body = stationBody(page);
    await expect(body).toHaveCount(1);

    const how = await body.evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      while (node) {
        if (getComputedStyle(node).display === 'none') return 'display-none';
        if (node.style.visibility === 'hidden') return 'visibility-hidden';
        node = node.parentElement;
      }
      return 'visible';
    });
    // `display: none` would drop the pane out of layout and cost a re-measure
    // on every carton close — the thing the visibility trick exists to avoid.
    expect(['visible', 'visibility-hidden']).toContain(how);
  });
});
