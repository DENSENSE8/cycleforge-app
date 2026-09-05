import { test, expect, type Page } from '@playwright/test';

/**
 * Sidebar spine — the open/close lifecycle, on its own.
 *
 * `sidebar-nav-column.spec.ts` is the broad shell suite (push-vs-overlay
 * geometry, per-route panel contracts, row grammar). This file is the narrow
 * one: **does the control open the navigator, and does it close it again.**
 *
 * It exists because the broad suite cannot tell the two failure modes apart,
 * and they have opposite fixes:
 *
 *  1. **The column never widens.** `navOpen` is unpersisted `useState(false)` in
 *     `ResponsiveLayout`, threaded to `SidebarNavColumn` and back out to
 *     `GlobalHeader.onToggleSidebar`. A break here is in that wiring.
 *  2. **The column widens but is EMPTY.** `ResponsiveLayout` wraps the spine in
 *     `<ErrorBoundary fallback={() => null}>`, so anything that throws inside
 *     `MasterNav` — a nav-registry refactor mid-flight, a missing group id —
 *     renders a 240px band of nothing. To an operator that is indistinguishable
 *     from "the sidebar doesn't open", but the fix is in the nav tree, not in
 *     the toggle.
 *
 * So every open assertion checks BOTH the geometry and the content, and says
 * which one failed.
 *
 * Route: `/reports` is panel-less (`PANEL_LESS_ROUTES`), so nothing else
 * competes for the left edge and the measurements are unambiguous.
 */

/** The push column's host. Present from first paint; `data-open` is the state. */
const NAV_COLUMN = '[data-sidebar-nav-column]';
/** The spine's page list — proof the navigator actually rendered. */
const PAGES_MENU = '[role="menu"][aria-label="Pages"]';
/** GlobalHeader's sidebar control — the leftmost header button. */
const SIDEBAR_TOGGLE = 'header button';
/** `SIDEBAR_SPINE_WIDTH_PX`. */
const SPINE_WIDTH = 240;

const ROUTE = '/reports';

/**
 * Routes the geometry probe runs on, chosen to bracket the map's real range.
 *
 * Children are drawn for the ACTIVE page only, so the map's height depends on
 * which page you are standing on — measuring one route measures one point on a
 * curve. `/reports` owns no spine row, so nothing expands: the floor. `/products`
 * is Catalog, the widest page in the registry at 7 children: the ceiling.
 */
const MEASURED_SURFACES = [
  /**
   * `belowFoldBudget` is a **ratchet, and it only ever shrinks** — the house
   * rule for every other baseline in this repo. It records what is true today,
   * not what is acceptable forever.
   *
   * The floor's budget is 0 and must stay 0. The ceiling's is 1: on `/products`
   * the map measures 732px against a 685px port, so the last row (Support) sits
   * just past the edge. That predates this phase and is not introduced by it —
   * it is the honest cost of drawing seven child pages under the widest page in
   * the registry, and 47px of scroll on one route is a different order of
   * problem from the 335px the two-line pattern would have cost everywhere.
   */
  { name: 'floor — no page expanded', route: '/reports', belowFoldBudget: 0 },
  { name: 'ceiling — Catalog, 7 children', route: '/products', belowFoldBudget: 1 },
] as const;

async function gotoSurface(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  // The shell is a client-only dynamic chunk (ssr:false); settle before measuring.
  await page.waitForTimeout(3_000);
}

const toggleSpine = (page: Page) => page.locator(SIDEBAR_TOGGLE).first().click();

/** Settled width of the push column — it tweens, so poll rather than sample. */
async function spineWidth(page: Page, expected: number, message: string) {
  await expect
    .poll(
      async () => Math.round((await page.locator(NAV_COLUMN).boundingBox())?.width ?? -1),
      { message },
    )
    .toBe(expected);
}

/**
 * The full open assertion: the column widened AND the navigator is inside it.
 *
 * Checking the content is not belt-and-braces — it is the only thing that
 * separates failure mode 2 from a working spine, because the error boundary
 * swallows the throw and leaves the geometry perfectly correct.
 */
async function expectSpineOpen(page: Page) {
  await expect(page.locator(NAV_COLUMN), 'the toggle did not flip data-open').toHaveAttribute(
    'data-open',
    'true',
  );
  await spineWidth(page, SPINE_WIDTH, 'the open column settles at the spine width token');
  await expect(
    page.locator(`${NAV_COLUMN} ${PAGES_MENU}`),
    'the column opened but rendered nothing — MasterNav threw and the ' +
      'sidebar-nav-column ErrorBoundary swallowed it (fallback returns null)',
  ).toBeVisible();
}

async function expectSpineClosed(page: Page) {
  await expect(page.locator(NAV_COLUMN)).toHaveAttribute('data-open', 'false');
  await spineWidth(page, 0, 'the closed column collapses to zero width');
}

test.describe('sidebar spine — open and close', () => {
  test.skip(({ isMobile }) => Boolean(isMobile));

  test('starts collapsed, and the host is present from first paint', async ({ page }) => {
    await gotoSurface(page, ROUTE);

    // The host is always mounted (it is the flex sibling that reserves the
    // edge); only its width is state. A missing host is a layout regression,
    // not a closed sidebar.
    await expect(page.locator(NAV_COLUMN), 'the push column host must always exist').toHaveCount(1);
    await expectSpineClosed(page);
  });

  test('the header control opens it', async ({ page }) => {
    await gotoSurface(page, ROUTE);

    const toggle = page.locator(SIDEBAR_TOGGLE).first();
    await expect(toggle, 'the sidebar control must be reachable').toBeVisible();
    await expect(toggle).toHaveAttribute('aria-label', 'Show navigation');

    await toggle.click();
    await expectSpineOpen(page);
    // The control is a state toggle, so it must announce the new state.
    await expect(toggle).toHaveAttribute('aria-label', 'Hide navigation');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('the same control closes it again', async ({ page }) => {
    await gotoSurface(page, ROUTE);

    await toggleSpine(page);
    await expectSpineOpen(page);

    await toggleSpine(page);
    await expectSpineClosed(page);
    await expect(page.locator(SIDEBAR_TOGGLE).first()).toHaveAttribute('aria-label', 'Show navigation');
  });

  test('open → close → open again (the toggle is not one-shot)', async ({ page }) => {
    await gotoSurface(page, ROUTE);

    await toggleSpine(page);
    await expectSpineOpen(page);
    await toggleSpine(page);
    await expectSpineClosed(page);

    // Re-opening exercises the `everOpened` latch: the spine stays mounted
    // after the first open, so the second one must show the SAME list rather
    // than an empty column left behind by the close animation.
    await toggleSpine(page);
    await expectSpineOpen(page);
  });

  test('collapsed toggle hover does not peek top destinations', async ({ page }) => {
    await gotoSurface(page, ROUTE);
    await expectSpineClosed(page);

    const toggle = page.locator(SIDEBAR_TOGGLE).first();
    await expect(toggle).toHaveAttribute('aria-label', 'Show navigation');

    await toggle.hover();
    // Former peek openDelay was 180ms — wait past it so a regression would flash.
    await page.waitForTimeout(300);
    await expect(page.getByTestId('sidebar-top-pins-peek')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Quick destinations' })).toHaveCount(0);

    await toggle.click();
    await expectSpineOpen(page);
  });

  test('the open spine survives an in-app jump to another page', async ({ page }) => {
    await gotoSurface(page, ROUTE);
    await toggleSpine(page);
    await expectSpineOpen(page);

    // A CLIENT-SIDE jump, not `page.goto`: `navOpen` is component state in
    // `ResponsiveLayout`, so a full document load legitimately resets it and
    // would make this test assert the opposite of the contract.
    //
    // The contract: a push column covers nothing, so auto-closing on navigation
    // would reflow the frame twice per jump for no gain — closing is the
    // toggle and nothing else (`ResponsiveLayout`'s navOpen docblock).
    //
    // Addressed by aria-label PREFIX, not by name. This used to click
    // "Go to Search", which stopped being a spine row on 2026-08-03 when
    // Home/Search/Media/Chat became `HeaderTopPins` icons — the test then failed
    // for a reason that had nothing to do with the contract it exists to pin.
    // Any destination row proves "a client-side jump leaves the column open".
    const before = page.url();
    await page.locator(`${NAV_COLUMN} ${PAGES_MENU} button[aria-label^="Go to "]`).first().click();
    await expect.poll(() => page.url(), { message: 'the row navigated' }).not.toBe(before);

    await expectSpineOpen(page);
  });

  test('the open spine reaches its own identity chrome', async ({ page }) => {
    await gotoSurface(page, ROUTE);
    await toggleSpine(page);
    await expectSpineOpen(page);

    // The staff footer is the spine's identity chrome now. The org control that
    // used to sit in the 40px top band was deleted 2026-08-03 — single-org is
    // the norm, so a permanent row naming it restated something that never
    // changes. Home · Media Library are ordinary map rows (2026-08-28).
    // Assert the footer.
    await expect(
      page.locator(`${NAV_COLUMN} [data-staff-account-footer]`),
      'the staff account footer is missing from the spine',
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Home' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Media Library' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Stations' })).toBeVisible();
  });

  /**
   * ## The geometry gate for every spine layout change
   *
   * Not a pass/fail assertion about taste — a **measurement**, reported to the
   * log, with one hard assertion: the map must not grow so far past its port
   * that the spine stops being a map. `.claude/rules/verify.md` is explicit that
   * geometry claims come from the real runner, and the numbers in the phase
   * handoffs before this one were MODELLED (rows × an assumed row height) and
   * labelled as such precisely because a model is not a result.
   *
   * It also measures the **two-line row** cost in situ rather than estimating
   * it. The search-results list already renders exactly the pattern a
   * "Cloudflare-shaped" row would use — bold label over a muted parent line —
   * so the honest way to price that pattern is to render one and measure it,
   * not to guess at 44–48px.
   */
  for (const surface of MEASURED_SURFACES) {
    test(`MEASURE — the flat map against its scrollport (${surface.name})`, async ({ page }) => {
      await gotoSurface(page, surface.route);
      await toggleSpine(page);
      await expectSpineOpen(page);

      const map = await page.evaluate(() => {
        const port = document.querySelector<HTMLElement>('[data-spine-scrollport]');
        // The MAP's own box, not `port.scrollHeight`. scrollHeight can never
        // report less than clientHeight, so on a map that fits it returns the
        // PORT's height and the overflow reads as a flat 0 — which looks like a
        // measurement and is really just the port measuring itself.
        const list = port?.querySelector<HTMLElement>('ul[aria-label="Sections"]');
        if (!port || !list) return null;
        const portRect = port.getBoundingClientRect();
        const rows = Array.from(port.querySelectorAll<HTMLElement>('button')).map((b) => {
          const r = b.getBoundingClientRect();
          return {
            label: (b.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 32),
            top: Math.round(r.top),
            height: Math.round(r.height),
          };
        });
        return {
          portHeight: Math.round(portRect.height),
          portBottom: Math.round(portRect.bottom),
          contentHeight: Math.round(list.getBoundingClientRect().height),
          rows,
        };
      });
      expect(map, 'the scrollport probe handle is missing').not.toBeNull();

      // A row whose TOP is past the port's bottom edge cannot be seen at rest.
      // The port clips every row, so its edge is the honest thing to measure —
      // the same reasoning the grid specs use for a virtualized last row.
      const belowFold = map!.rows.filter((r) => r.top >= map!.portBottom);
      const heights = map!.rows.map((r) => r.height);
      const childRow = heights.length ? Math.min(...heights) : 0;
      const pageRow = heights.length ? Math.max(...heights) : 0;

      // In-spine "Go to…" was removed 2026-08-28 — destination find is ⌘K.
      // Geometry here is the map as built (no projected two-line search rows).
      /* eslint-disable no-console */
      console.log(
        `\n=== SPINE MAP GEOMETRY @ 1440x900 — ${surface.name} (${surface.route}) ===\n` +
          `port height          : ${map!.portHeight}px\n` +
          `map content height   : ${map!.contentHeight}px\n` +
          `headroom             : ${map!.portHeight - map!.contentHeight}px\n` +
          `rows                 : ${map!.rows.length}\n` +
          `page row / child row : ${pageRow}px / ${childRow}px\n` +
          `below the fold (${belowFold.length}) : ${belowFold.map((r) => r.label).join(' | ') || '—'}\n` +
          '==========================================================\n',
      );
      /* eslint-enable no-console */

      // The one hard line, and it is about the map AS BUILT — not the projection.
      // The flatten exists so the map is navigable at rest; rows past the port's
      // edge are the failure the previous two phases were bought to avoid, so
      // the budget ratchets DOWN and is never raised to land a layout change.
      expect(
        belowFold.length,
        `${belowFold.length} row(s) sit below the fold on ${surface.route} ` +
          `(map ${map!.contentHeight}px vs port ${map!.portHeight}px), budget ` +
          `${surface.belowFoldBudget}: ${belowFold.map((r) => r.label).join(', ')} — ` +
          'a spine change just cost the map its at-rest legibility. Baselines only ' +
          'shrink; see docs/todo/spine-cloudflare-nav-HANDOFF.md §4',
      ).toBeLessThanOrEqual(surface.belowFoldBudget);
    });
  }
});
