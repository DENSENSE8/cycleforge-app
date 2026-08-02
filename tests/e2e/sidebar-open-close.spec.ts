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
/** `armSidebarPeek`'s dwell before the collapsed spine slides in. */
const EDGE_PEEK_MS = 2_000;

const ROUTE = '/reports';

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
    await expect(toggle).toHaveAttribute('aria-label', 'Show sidebar');

    await toggle.click();
    await expectSpineOpen(page);
    // The control is a state toggle, so it must announce the new state.
    await expect(toggle).toHaveAttribute('aria-label', 'Hide sidebar');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  test('the same control closes it again', async ({ page }) => {
    await gotoSurface(page, ROUTE);

    await toggleSpine(page);
    await expectSpineOpen(page);

    await toggleSpine(page);
    await expectSpineClosed(page);
    await expect(page.locator(SIDEBAR_TOGGLE).first()).toHaveAttribute('aria-label', 'Show sidebar');
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

  test('resting at the left edge opens it after the dwell', async ({ page }) => {
    await gotoSurface(page, ROUTE);
    await expectSpineClosed(page);

    // `armSidebarPeek` — a fixed 24px strip, mounted only while collapsed.
    const box = page.viewportSize()!;
    await page.mouse.move(3, Math.round(box.height / 2));
    await page.waitForTimeout(EDGE_PEEK_MS + 1_000);

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
    const before = page.url();
    await page.getByRole('button', { name: 'Go to Search' }).click();
    await expect.poll(() => page.url(), { message: 'the row navigated' }).not.toBe(before);

    await expectSpineOpen(page);
  });

  test('the open spine reaches its own identity chrome', async ({ page }) => {
    await gotoSurface(page, ROUTE);
    await toggleSpine(page);
    await expectSpineOpen(page);

    // Both ends of the spine: the org control at the top band and the staff
    // footer at the bottom. If MasterNav renders but one of these throws, the
    // list above is still visible — so name them separately.
    await expect(
      page.locator(`${NAV_COLUMN} [data-master-nav-org]`),
      'the org workspace control is missing from the spine top band',
    ).toBeVisible();
    await expect(
      page.locator(`${NAV_COLUMN} [data-staff-account-footer]`),
      'the staff account footer is missing from the spine',
    ).toBeVisible();
  });
});
