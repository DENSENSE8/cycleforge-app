import { test, expect, type Page } from '@playwright/test';

/**
 * Shell regression suite for the sidebar
 * (docs/todo/sidebar-nav-slideout-BRIEFING.md).
 *
 * The model:
 *  - **The page list lives in the spine and nowhere else.** `MasterNav` renders
 *    the page list and cannot render anything else; one control opens the same
 *    surface on every route.
 *  - **The spine is a resident PUSH column**, not a layer. Opening it widens a
 *    real flex sibling, so the frame moves right and nothing is ever covered.
 *    It has no scrim, no dismiss catcher, and no auto-close — closing is the
 *    same toggle that opened it.
 *  - **A route's own sidebar is its own component, mounted beside the
 *    workspace** (`ContextPanelLayout`) — the Media library's facet rail,
 *    Products' picker, the receiving rails, the station benches. It is never a
 *    body of the navigator, so opening the nav cannot take it away.
 */

/** `STATION_SURFACE_ROUTE_KEYS` — bench in the content region, no sidebar column. */
const STATION_ROUTES = ['/unbox', '/triage', '/shipping/labels', '/test', '/pack', '/review'] as const;

/**
 * Routes that have a sidebar of their own — an in-content panel card.
 *
 * `/ops/photos` is here now: the Media library grew a facet rail (lifecycle
 * scope + capture day), so it is no longer the panel-less case.
 */
const SIDEBAR_ROUTES = [
  '/dashboard',
  '/products',
  '/operations',
  '/ops/photos',
] as const;

/**
 * Routes with no sidebar of their own — must never reserve a column.
 *
 * `/inventory` joined them on 2026-09-04: the Inventory rail (ledger recents,
 * graph search, triage queue, pulse picker, replenish filters, the warehouse
 * finder) was six ways to find or narrow rows that the desk's own DataTable
 * search, filter menu and tabs already do. `/warehouse` resolves to the same
 * route key, so it is rail-less by the same drop.
 */
const PANEL_LESS_ROUTES = [
  '/reports',
  '/release-notes',
  '/inventory',
  '/warehouse',
] as const;

const PAGES_MENU = '[role="menu"][aria-label="Pages"]';
/** The push column's host. Present from first paint; `data-open` is the state. */
const NAV_COLUMN = '[data-sidebar-nav-column]';
const NAV_COLUMN_OPEN = '[data-sidebar-nav-column][data-open="true"]';
/** GlobalHeader's sidebar control — the leftmost header button. */
const SIDEBAR_TOGGLE = 'header button';
/** The spine's own width token (`SIDEBAR_SPINE_WIDTH_PX`). */
const SPINE_WIDTH = 240;
/**
 * The in-content context panel, by IDENTITY rather than by width.
 *
 * This used to be `main [class*="w-\\[360px\\]"]` — a selector keyed to a literal
 * arbitrary Tailwind width, so restyling the panel silently broke a test about
 * whether it renders at all. Note the width is NOT the spine's
 * `SIDEBAR_SPINE_WIDTH`: the nav spine and the context panel are two different
 * measurements (spine 240px, panel 360px), and binding the test to either
 * class would re-create the same coupling in a new place.
 */
const CONTEXT_PANEL = 'main [data-context-panel]';

async function gotoSurface(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  // The shell is a client-only dynamic chunk (ssr:false); settle before measuring.
  await page.waitForTimeout(3_000);
}

const toggleSpine = (page: Page) => page.locator(SIDEBAR_TOGGLE).first().click();

/** Settled width of the push column — it tweens, so poll rather than sample. */
async function settledSpineWidth(page: Page): Promise<number> {
  await expect
    .poll(async () => Math.round((await page.locator(NAV_COLUMN).boundingBox())?.width ?? -1), {
      message: 'the push column settles at its token width',
    })
    .toBeGreaterThanOrEqual(0);
  return Math.round((await page.locator(NAV_COLUMN).boundingBox())!.width);
}

/**
 * Width of any ROUTE-OWNED sidebar column in the app frame (0 when there is
 * none). After the move there should never be one: a route's panel lives inside
 * `<main>`, and the only aside in the frame is the nav spine's own.
 */
function residentColumnWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const aside = document.querySelector('body > div aside');
    if (!aside || aside.closest('[data-sidebar-nav-column]')) return 0;
    return Math.round(aside.getBoundingClientRect().width);
  });
}

test.describe('sidebar spine — one grammar, a push column, no empty columns', () => {
  test.skip(({ isMobile }) => Boolean(isMobile));

  for (const route of PANEL_LESS_ROUTES) {
    test(`${route}: no context panel ⇒ nothing reserved`, async ({ page }) => {
      await gotoSurface(page, route);

      expect(
        await residentColumnWidth(page),
        'panel-less route must not reserve a sidebar column',
      ).toBe(0);
      await expect(page.locator(CONTEXT_PANEL)).toHaveCount(0);
      // The spine host exists but is collapsed to zero width.
      await expect(page.locator(NAV_COLUMN)).toHaveAttribute('data-open', 'false');
      expect(await settledSpineWidth(page)).toBe(0);
    });

    test(`${route}: the control still opens the page list`, async ({ page }) => {
      await gotoSurface(page, route);
      await toggleSpine(page);

      await expect(page.locator(NAV_COLUMN_OPEN)).toBeVisible();
      await expect(page.locator(`${NAV_COLUMN} ${PAGES_MENU}`)).toBeVisible();
    });
  }

  test('/incoming: Inbound desk is rail-less (Pattern E)', async ({ page }) => {
    // POS / Email / Removed ride Pipeline facet chrome — no left Views rail.
    await gotoSurface(page, '/incoming');
    await expect(page.locator(CONTEXT_PANEL)).toHaveCount(0);
    expect(await residentColumnWidth(page)).toBe(0);

    await gotoSurface(page, '/incoming?lane=docked');
    await expect(page.locator(CONTEXT_PANEL)).toHaveCount(0);
    expect(await residentColumnWidth(page)).toBe(0);
  });

  test('/: Home → Today is rail-less (Pattern E)', async ({ page }) => {
    await gotoSurface(page, '/');
    await expect(page.locator(CONTEXT_PANEL)).toHaveCount(0);
    expect(await residentColumnWidth(page)).toBe(0);
  });

  for (const route of [...SIDEBAR_ROUTES, ...STATION_ROUTES]) {
    test(`${route}: the route's own sidebar rides in the content region`, async ({ page }) => {
      await gotoSurface(page, route);

      await expect(
        page.locator(CONTEXT_PANEL).first(),
        'a route with a panel keeps it on screen, inside <main>',
      ).toBeVisible();
      // No route-owned aside: the panel is part of the page, not of the nav.
      expect(await residentColumnWidth(page)).toBe(0);
      // …and it is the route's sidebar, not the navigator wearing its slot.
      await expect(page.locator(PAGES_MENU)).toHaveCount(0);
    });

    test(`${route}: opening the spine pushes the panel, never covers it`, async ({ page }) => {
      await gotoSurface(page, route);
      const panel = page.locator(CONTEXT_PANEL).first();
      const before = (await panel.boundingBox())!;

      await toggleSpine(page);
      await expect(page.locator(NAV_COLUMN_OPEN)).toBeVisible();
      expect(await settledSpineWidth(page), 'spine width token').toBe(SPINE_WIDTH);

      // Push, not overlay: the frame moves right by exactly the spine's width,
      // so the route's own rail stays fully visible beside it.
      await expect
        .poll(async () => Math.round((await panel.boundingBox())!.x), {
          message: 'the panel is pushed by exactly the spine width',
        })
        .toBe(Math.round(before.x) + SPINE_WIDTH);
    });

    test(`${route}: the toggle collapses it again`, async ({ page }) => {
      await gotoSurface(page, route);
      const panel = page.locator(CONTEXT_PANEL).first();
      const before = Math.round((await panel.boundingBox())!.x);

      await toggleSpine(page);
      await expect(page.locator(NAV_COLUMN_OPEN)).toBeVisible();
      await toggleSpine(page);

      await expect(page.locator(NAV_COLUMN)).toHaveAttribute('data-open', 'false');
      await expect
        .poll(async () => Math.round((await panel.boundingBox())!.x), {
          message: 'collapsing returns the frame to where it started',
        })
        .toBe(before);
    });
  }

  test('/unbox: the spine occupies the frame edge, and the content starts after it', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await toggleSpine(page);

    const spine = page.locator(`${NAV_COLUMN} aside`);
    await expect(spine).toBeVisible();

    await expect
      .poll(async () => Math.round((await spine.boundingBox())?.x ?? -1), {
        message: 'spine settles anchored to the frame edge',
      })
      .toBe(0);
    expect(Math.round((await spine.boundingBox())!.width), 'spine width token').toBe(SPINE_WIDTH);

    // The header band belongs to the content column, so it starts after the
    // spine — the tell that this is a sibling and not a layer over the frame.
    const header = (await page.locator('header').first().boundingBox())!;
    expect(Math.round(header.x)).toBe(SPINE_WIDTH);
  });

  /**
   * The spine is a resident navigator, not a transient layer. It used to be a
   * portaled `fixed inset-0` slide-over with a transparent light-dismiss
   * catcher — no scrim and no focus trap, which is a permanent-feeling surface
   * pretending to be a modal one. As a push column there is nothing underneath
   * it to dismiss through, so those affordances are gone entirely.
   */
  test('/unbox: the open spine is a column, not a layer', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await toggleSpine(page);
    await expect(page.locator(NAV_COLUMN_OPEN)).toBeVisible();

    // No catcher, no scrim, nothing painting over the work surface.
    await expect(page.locator('[data-sidebar-dismiss]')).toHaveCount(0);

    const aside = page.locator(`${NAV_COLUMN} aside`);
    await expect(aside).toHaveAttribute('role', 'navigation');
    expect(await aside.getAttribute('aria-modal'), 'no aria-modal without a focus trap').toBeNull();
    // In flow, so it never establishes a layer over the frame.
    const position = await aside.evaluate((el) => getComputedStyle(el).position);
    expect(position, 'the spine is laid out, not fixed over the frame').not.toBe('fixed');
  });

  test('/unbox: clicking the work surface leaves the spine open', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await toggleSpine(page);
    await expect(page.locator(NAV_COLUMN_OPEN)).toBeVisible();

    // A push column covers nothing, so an outside click is just a click on the
    // page — it must not double as a dismiss.
    await page.locator('main').first().click({ position: { x: 400, y: 300 } });
    await expect(page.locator(NAV_COLUMN)).toHaveAttribute('data-open', 'true');
  });

  test('/unbox: Stations, Desks, and Operations Studio list under group labels', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await toggleSpine(page);
    await expect(page.locator(PAGES_MENU)).toBeVisible();

    await expect(page.getByRole('button', { name: 'Back to pages' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Scan Stations' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Desks' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Pinned' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Stations' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Desks' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Operations Studio' })).toBeVisible();

    await expect(page.getByRole('button', { name: 'Go to Unbox' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Arrival' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Quality Control' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Picker' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Testing' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Testing' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Go to Repair Service' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Packing' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Packing Review' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add to spine' })).toHaveCount(0);
  });

  test('/products: Stations group is visible without navigating', async ({ page }) => {
    await gotoSurface(page, '/products');
    await toggleSpine(page);
    await expect(page.locator(PAGES_MENU)).toBeVisible();
    const before = page.url();

    await expect(page.getByRole('group', { name: 'Stations' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Unbox' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Packing' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Packing Review' })).toHaveCount(0);
    expect(page.url(), 'listing Stations must not navigate').toBe(before);
  });

  test('/products: Desks group lists pointer desks', async ({ page }) => {
    await gotoSurface(page, '/products');
    await toggleSpine(page);
    await expect(page.locator(PAGES_MENU)).toBeVisible();

    await expect(page.getByRole('group', { name: 'Desks' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Products' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Shipping' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Go to Operations' })).toBeVisible();
  });

  /**
   * One bar, one control — the row spans the list (hover lights the whole row).
   */
  test('/products: a page row is a single control, caret included', async ({ page }) => {
    await gotoSurface(page, '/products');
    await toggleSpine(page);
    await expect(page.locator(PAGES_MENU)).toBeVisible();
    const row = page.getByRole('button', { name: 'Go to Shipping' });
    await expect(row, 'exactly one control per page row').toHaveCount(1);
    const rowBox = (await row.boundingBox())!;
    const listBox = (await page.locator(PAGES_MENU).boundingBox())!;
    expect(
      Math.round(rowBox.width),
      'the bar spans the list, so hover lights the whole row',
    ).toBeGreaterThan(Math.round(listBox.width) - 48);
  });

  test('/unbox: L2 mode control lives in GlobalHeader, not the sidebar rail', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await expect(page.locator('main [aria-label="Receiving mode"]')).toHaveCount(0);
    await expect(page.locator('header [aria-label^="Receiving mode"]')).toHaveCount(1);
    await expect(page.locator('header [aria-label="Recents"]')).toHaveCount(1);
  });

  test('/products: L2 Mode + Recents live in GlobalHeader', async ({ page }) => {
    await gotoSurface(page, '/products');
    await expect(page.locator('main [aria-label="Products view"]')).toHaveCount(0);
    await expect(page.locator('header [aria-label^="Products mode"]')).toHaveCount(1);
    await expect(page.locator('header [aria-label="Recents"]')).toHaveCount(1);
  });

  test('/unbox: the spine header has no modes dropdown trigger', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await toggleSpine(page);
    await expect(page.getByRole('button', { name: /open modes menu/i })).toHaveCount(0);
  });

  test('/products: the page list arrives beside the route sidebar, not over it', async ({ page }) => {
    await gotoSurface(page, '/products');
    const panel = page.locator(CONTEXT_PANEL).first();
    await expect(panel).toBeVisible();

    await toggleSpine(page);

    // The page list is a column of its own — it does NOT replace the route's
    // sidebar in place. A picker that vanishes when you reach for the nav is a
    // navigator wearing the route's slot; these are two surfaces.
    await expect(page.locator(`${NAV_COLUMN} ${PAGES_MENU}`)).toBeVisible();
    await expect(panel, "the route's own sidebar stays on screen").toBeVisible();
  });
});
