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
  '/inventory',
  '/ops/photos',
] as const;

/** Routes with no sidebar of their own — must never reserve a column. */
const PANEL_LESS_ROUTES = ['/reports', '/release-notes'] as const;

const PAGES_MENU = '[role="menu"][aria-label="Pages"]';
const MODES_MENU = '[role="menu"][aria-label="Modes"]';
const MODES_TRIGGER = 'button[aria-label="Open modes menu"]';
/** The push column's host. Present from first paint; `data-open` is the state. */
const NAV_COLUMN = '[data-sidebar-nav-column]';
const NAV_COLUMN_OPEN = '[data-sidebar-nav-column][data-open="true"]';
/** GlobalHeader's sidebar control — the leftmost header button. */
const SIDEBAR_TOGGLE = 'header button';
/** The spine's own width token (`SIDEBAR_SPINE_WIDTH_PX`). */
const SPINE_WIDTH = 360;
/**
 * The in-content context panel, by IDENTITY rather than by width.
 *
 * This used to be `main [class*="w-\\[360px\\]"]` — a selector keyed to a literal
 * arbitrary Tailwind width, so restyling the panel silently broke a test about
 * whether it renders at all. Note the width is NOT the spine's
 * `SIDEBAR_SPINE_WIDTH`: the nav spine and the context panel are two different
 * measurements that happen to both be 360px today, and binding the test to
 * either class would re-create the same coupling in a new place.
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

  test('/dashboard?mode=inbound: the Monitor mode drops the panel too', async ({ page }) => {
    // `DashboardOrdersContextPanel` returns null for inbound (it is a Monitor, not
    // a Workbench), so the route-key contract is overridden per-mode.
    await gotoSurface(page, '/dashboard?mode=inbound');
    await expect(page.locator(CONTEXT_PANEL)).toHaveCount(0);
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

  test('/unbox: opening the spine pre-expands the page you are on', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await toggleSpine(page);
    await expect(page.locator(PAGES_MENU)).toBeVisible();

    const expanded = page.locator(`${NAV_COLUMN} [aria-expanded="true"]`).first();
    await expect(expanded).toHaveAttribute('aria-label', /Receiving — \d+ modes/);
  });

  test('/unbox: clicking a modeful row expands it instead of navigating', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await toggleSpine(page);
    await expect(page.locator(PAGES_MENU)).toBeVisible();
    const before = page.url();

    await page.getByRole('button', { name: /^Shipping — \d+ modes$/ }).click();

    // The modes ARE the destinations — jumping to a default the operator did
    // not pick is a worse guess than showing the choice.
    expect(page.url(), 'row click must not navigate').toBe(before);
    await expect(
      page.locator(`${NAV_COLUMN} [aria-expanded="true"]`).first(),
    ).toHaveAttribute('aria-label', /Shipping — \d+ modes/);
  });

  /**
   * One bar, one control. The row used to be two buttons — label on the left,
   * mode-count + chevron on the right — that fired the same handler, so it read
   * as a page parked beside an unrelated counter widget and gave a keyboard
   * user two stops to one place.
   */
  test('/unbox: a page row is a single control, count and caret included', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await toggleSpine(page);
    await expect(page.locator(PAGES_MENU)).toBeVisible();

    const row = page.getByRole('button', { name: /^Shipping — \d+ modes$/ });
    await expect(row, 'exactly one control per page row').toHaveCount(1);
    // The count/caret cluster is inside that button, not a sibling of it.
    const rowBox = (await row.boundingBox())!;
    const listBox = (await page.locator(PAGES_MENU).boundingBox())!;
    expect(
      Math.round(rowBox.width),
      'the bar spans the list, so hover lights the whole row',
    ).toBeGreaterThan(Math.round(listBox.width) - 24);
  });

  test('/unbox: no mode strip rides on top of the station panel', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    // MasterNavProvider suppresses every panel's own pill-row: the nav owns
    // page + mode, and a second mode strip on the bench is noise.
    await expect(page.locator('main [aria-label="Receiving mode"]')).toHaveCount(0);
  });

  test('/unbox: L2 modes opens as a portaled menu ABOVE the spine', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await toggleSpine(page);

    await page.locator(MODES_TRIGGER).first().click();
    const modes = page.locator(MODES_MENU);
    await expect(modes).toBeVisible();

    // `panelPopover` (120) over the in-flow spine — a menu triggered from inside
    // the column must never paint behind it.
    const stacked = await page.evaluate(
      ({ modesSel, columnSel }) => {
        const menu = document.querySelector(modesSel);
        const column = document.querySelector(columnSel);
        if (!menu || !column) return null;
        const z = (el: Element) => Number(getComputedStyle(el).zIndex) || 0;
        return z(menu.closest('[style*="z-index"]') ?? menu) > z(column);
      },
      { modesSel: MODES_MENU, columnSel: NAV_COLUMN },
    );
    expect(stacked, 'modes menu must stack above the spine').toBe(true);
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
