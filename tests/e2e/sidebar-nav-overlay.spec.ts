import { test, expect, type Page } from '@playwright/test';

/**
 * Shell regression suite for the sidebar
 * (docs/todo/sidebar-nav-slideout-BRIEFING.md).
 *
 * The model, after the slide-over migration:
 *  - **The page list lives in the slide-over and nowhere else.** There is no
 *    portaled flyout and no in-flow station nav column any more —
 *    `MasterNavDropdown` is deleted, and one control opens the same surface on
 *    every route.
 *  - **A route's own sidebar is its own component**, resident in a column: the
 *    Media library's facet rail, Products' picker, the receiving rails. It never
 *    swaps itself out for the page list.
 *  - A route with no sidebar of its own reserves nothing — no 360px of blank
 *    chrome. That empty column is the bug this suite guards against.
 *  - Station benches keep their scan bar + recents rail in the CONTENT region,
 *    so they survive the nav being closed.
 */

/** `STATION_SURFACE_ROUTE_KEYS` — bench in the content region, no sidebar column. */
const STATION_ROUTES = ['/unbox', '/triage', '/shipping', '/test', '/pack', '/review'] as const;

/** Routes that have a sidebar of their own — resident column. */
const SIDEBAR_ROUTES = ['/dashboard', '/products', '/operations', '/inventory'] as const;

/**
 * Routes with no sidebar of their own — must never reserve a column.
 *
 * `/ops/photos` leads the list because it is the case that started this: the
 * Media library owns its whole context in the workbench chrome header, so a
 * sidebar there is 360px of blank chrome beside the grid.
 */
const PANEL_LESS_ROUTES = ['/ops/photos', '/reports', '/release-notes'] as const;

const PAGES_MENU = '[role="menu"][aria-label="Pages"]';
const MODES_MENU = '[role="menu"][aria-label="Modes"]';
const MODES_TRIGGER = 'button[aria-label="Open modes menu"]';
const SLIDE_OVER = '[data-sidebar-slide-over]';
/** GlobalHeader's sidebar control — the leftmost header button. */
const SIDEBAR_TOGGLE = 'header button';
/** The in-display station panel (scan bar + recents rail). */
/**
 * The station bench panel, by IDENTITY rather than by width.
 *
 * This used to be `main [class*="w-\\[360px\\]"]` — a selector keyed to a literal
 * arbitrary Tailwind width, so restyling the bench silently broke a test about
 * whether the bench renders at all. Note the width is NOT the spine's
 * `SIDEBAR_SPINE_WIDTH`: the nav spine and the bench panel are two different
 * measurements that happen to both be 360px today, and binding the test to
 * either class would re-create the same coupling in a new place.
 */
const STATION_PANEL = 'main [data-station-panel]';

async function gotoSurface(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  // The shell is a client-only dynamic chunk (ssr:false); settle before measuring.
  await page.waitForTimeout(3_000);
}

const openSpine = (page: Page) => page.locator(SIDEBAR_TOGGLE).first().click();

/** Width of any resident sidebar column in the frame (0 when there is none). */
function residentColumnWidth(page: Page): Promise<number> {
  return page.evaluate(() => {
    const aside = document.querySelector('body > div aside');
    if (!aside || aside.closest('[data-sidebar-slide-over]')) return 0;
    return Math.round(aside.getBoundingClientRect().width);
  });
}

test.describe('sidebar spine — one grammar, no empty columns', () => {
  test.skip(({ isMobile }) => Boolean(isMobile));

  for (const route of PANEL_LESS_ROUTES) {
    test(`${route}: no context panel ⇒ no resident column`, async ({ page }) => {
      await gotoSurface(page, route);

      // The whole point: a surface that owns its context in the workbench chrome
      // header must not sit beside 360px of blank sidebar.
      expect(
        await residentColumnWidth(page),
        'panel-less route must not reserve a sidebar column',
      ).toBe(0);
      await expect(page.locator(SLIDE_OVER)).toHaveCount(0);
    });

    test(`${route}: the control still opens the spine as a slide-over`, async ({ page }) => {
      await gotoSurface(page, route);
      await openSpine(page);

      await expect(page.locator(SLIDE_OVER)).toBeVisible();
      // With no context panel to rest on, the spine's body IS the page list.
      await expect(page.locator(`${SLIDE_OVER} ${PAGES_MENU}`)).toBeVisible();
    });
  }

  test('/dashboard?mode=inbound: the Monitor mode drops the column too', async ({ page }) => {
    // `DashboardOrdersContextPanel` returns null for inbound (it is a Monitor, not
    // a Workbench), so the route-key contract is overridden per-mode.
    await gotoSurface(page, '/dashboard?mode=inbound');
    expect(await residentColumnWidth(page)).toBe(0);
  });

  for (const route of SIDEBAR_ROUTES) {
    test(`${route}: the route's own sidebar is resident`, async ({ page }) => {
      await gotoSurface(page, route);
      expect(
        await residentColumnWidth(page),
        'a route with a picker keeps it on screen (display/workbench.md)',
      ).toBeGreaterThan(0);
      // …and it is the route's sidebar, not the navigator wearing its slot.
      await expect(page.locator(PAGES_MENU)).toHaveCount(0);
    });
  }

  for (const route of STATION_ROUTES) {
    test(`${route}: bench on screen, spine transient`, async ({ page }) => {
      await gotoSurface(page, route);

      expect(await residentColumnWidth(page), 'the bench owns the full width').toBe(0);
      await expect(
        page.locator(STATION_PANEL).first(),
        'station panel must render inside <main>',
      ).toBeVisible();
    });

    test(`${route}: the control opens the spine, and the bench does not move`, async ({ page }) => {
      await gotoSurface(page, route);
      const panel = page.locator(STATION_PANEL).first();
      const before = (await panel.boundingBox())!;

      await openSpine(page);
      await expect(page.locator(SLIDE_OVER)).toBeVisible();
      const after = (await panel.boundingBox())!;

      // Overlay, not push: opening navigation must never reflow a work surface.
      expect(after.x, 'the bench must not be pushed by the nav').toBeCloseTo(before.x, 0);
    });
  }

  test('/unbox: the spine slides over the content, above the left edge', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await openSpine(page);

    const spine = page.locator(`${SLIDE_OVER} aside`);
    await expect(spine).toBeVisible();

    // It slides in from `x: -100%`, so measure only once the spring has settled.
    await expect
      .poll(async () => Math.round((await spine.boundingBox())?.x ?? -1), {
        message: 'spine settles anchored to the frame edge',
      })
      .toBe(0);
    const box = (await spine.boundingBox())!;
    expect(box.width, 'spine width token').toBeCloseTo(360, 0);
  });

  test('/unbox: Escape closes the spine', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await openSpine(page);
    await expect(page.locator(SLIDE_OVER)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator(SLIDE_OVER)).toHaveCount(0);
  });

  test('/unbox: clicking outside closes the spine', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await openSpine(page);
    // Click well clear of the spine's own 360px, so this can only be the catcher.
    await page.locator('[data-sidebar-dismiss]').click({ position: { x: 900, y: 400 } });
    await expect(page.locator(SLIDE_OVER)).toHaveCount(0);
  });

  /**
   * The spine is a navigator, not a modal. It used to paint `bg-scrim/40` +
   * `backdrop-blur` and lock body scroll, which dimmed the very grid the
   * operator was navigating from — the same call the right rail already made
   * (`source-of-truth.md` → Right-rail modality). It also claimed
   * `aria-modal="true"` while installing no focus trap.
   */
  test('/unbox: the open spine does not scrim or claim modality', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await openSpine(page);

    const paint = await page.locator('[data-sidebar-dismiss]').evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        bg: s.backgroundColor,
        filter: s.backdropFilter || (s as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || 'none',
      };
    });
    expect(paint.bg, 'the dismiss catcher must not tint the work surface').toMatch(
      /rgba\(0, 0, 0, 0\)|transparent/,
    );
    expect(paint.filter, 'the dismiss catcher must not blur the work surface').toBe('none');

    const aside = page.locator(`${SLIDE_OVER} aside`);
    await expect(aside).toHaveAttribute('role', 'navigation');
    expect(await aside.getAttribute('aria-modal'), 'no aria-modal without a focus trap').toBeNull();
  });

  test('/unbox: opening the spine pre-expands the page you are on', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await openSpine(page);
    await expect(page.locator(PAGES_MENU)).toBeVisible();

    const expanded = page.locator(`${SLIDE_OVER} [aria-expanded="true"]`).first();
    await expect(expanded).toHaveAttribute('aria-label', /Receiving — \d+ modes/);
  });

  test('/unbox: clicking a modeful row expands it instead of navigating', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await openSpine(page);
    await expect(page.locator(PAGES_MENU)).toBeVisible();
    const before = page.url();

    await page.getByRole('button', { name: /^Shipping — \d+ modes$/ }).click();

    // The modes ARE the destinations — jumping to a default the operator did
    // not pick is a worse guess than showing the choice.
    expect(page.url(), 'row click must not navigate').toBe(before);
    await expect(
      page.locator(`${SLIDE_OVER} [aria-expanded="true"]`).first(),
    ).toHaveAttribute('aria-label', /Shipping — \d+ modes/);
  });

  test('/unbox: no mode strip rides on top of the station panel', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    // MasterNavProvider suppresses every panel's own pill-row: the nav owns
    // page + mode, and a second mode strip on the bench is noise.
    await expect(page.locator('main [aria-label="Receiving mode"]')).toHaveCount(0);
  });

  test('/unbox: L2 modes opens as a portaled menu ABOVE the spine', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    await openSpine(page);

    await page.locator(MODES_TRIGGER).first().click();
    const modes = page.locator(MODES_MENU);
    await expect(modes).toBeVisible();

    // `panelPopover` (120) over the spine's `panel` (100) — a menu triggered from
    // inside the spine must never paint behind it.
    const stacked = await page.evaluate(
      ({ modesSel, slideSel }) => {
        const menu = document.querySelector(modesSel);
        const slide = document.querySelector(slideSel);
        if (!menu || !slide) return null;
        const z = (el: Element) => Number(getComputedStyle(el).zIndex) || 0;
        return z(menu.closest('[style*="z-index"]') ?? menu) > z(slide);
      },
      { modesSel: MODES_MENU, slideSel: SLIDE_OVER },
    );
    expect(stacked, 'modes menu must stack above the spine').toBe(true);
  });

  test('/products: the band chevron opens the page list as the slide-over', async ({ page }) => {
    await gotoSurface(page, '/products');
    const columnBefore = await residentColumnWidth(page);
    expect(columnBefore).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Open navigation menu' }).click();

    // The page list arrives as the slide-over — it does NOT replace the route's
    // sidebar in place. A picker that vanishes when you reach for the nav is a
    // navigator wearing the route's slot; these are two surfaces.
    await expect(page.locator(`${SLIDE_OVER} ${PAGES_MENU}`)).toBeVisible();
    expect(
      await residentColumnWidth(page),
      "the route's own sidebar stays put underneath",
    ).toBe(columnBefore);
  });
});
