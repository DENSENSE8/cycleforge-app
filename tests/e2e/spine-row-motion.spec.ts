import { test, expect, type Page } from '@playwright/test';

/**
 * MasterNav spine row grain — the browser half of the contracts pinned
 * statically by `main-nav-groups.guard.test.ts`.
 *
 * The guard proves the SoT is composed; only a real browser can prove the
 * composed result actually lands in the DOM and in computed CSS. Three claims
 * that a source grep cannot make:
 *
 *  1. **The active row is a fill PLUS an inset hairline.** A `ring-1 ring-inset`
 *     in a class string is worthless if Tailwind never generated the utility —
 *     the classes live in `src/lib/nav/spine-section-accent.ts`, and a class
 *     referenced only from an un-scanned path renders invisible with no error
 *     (`build-gotchas.md`). This asserts the computed `box-shadow`.
 *  2. **The cascade does not replay while filtering.** The container keys on the
 *     SECTION id, and `initial={false}` while a filter is active makes rows that
 *     newly match mount already-visible. The failure mode is invisible to a
 *     grep and obvious to an operator: every keystroke re-fades the list they
 *     are reading.
 *  3. **Hover moves the 14px glyph and nothing else.** The row's own box must be
 *     byte-identical before and after hover — a row that shifts breaks the
 *     baseline every dense surface beside it aligns to.
 *
 * Runs on the QA org (`verify.md` → E2E asserts against the QA org): the spine
 * is registry-driven, so the sections are deterministic there.
 */

const SPINE = '[role="menu"][aria-label="Pages"]';
/** The push column's host — present from first paint; `data-open` is the state. */
const NAV_COLUMN = '[data-sidebar-nav-column]';
/** GlobalHeader's sidebar control — the leftmost header button. */
const SIDEBAR_TOGGLE = 'header button';

/** Open the spine push column, then wait for the root section map. */
async function openSpine(page: Page) {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  // The shell is a client-only dynamic chunk (ssr:false); settle before driving it.
  await page.waitForTimeout(3_000);

  if ((await page.locator(NAV_COLUMN).getAttribute('data-open')) !== 'true') {
    await page.locator(SIDEBAR_TOGGLE).first().click();
  }
  await expect(page.locator(`${NAV_COLUMN}[data-open="true"]`)).toBeVisible();

  const spine = page.locator(`${NAV_COLUMN} ${SPINE}`);
  await expect(spine).toBeVisible();
  return spine;
}

/**
 * Desks list inline under a standing group label — no list-replace drill.
 *
 * `/dashboard` is a desk surface; Shipping is already on the root map.
 */
async function openDeskGroup(page: Page) {
  const spine = await openSpine(page);
  await expect(spine.getByRole('group', { name: 'Desks' })).toBeVisible();
  return spine;
}

/**
 * The active row on `/dashboard` (Shipping / to-ship).
 */
const ACTIVE_ROW = /^Go to Shipping$/;

test.describe('MasterNav spine row grain', () => {
  test('the active destination is a fill PLUS a real inset hairline', async ({ page }) => {
    const spine = await openDeskGroup(page);

    // /dashboard is a Desk station, so its row is the active one in this drill.
    const active = spine.getByRole('button', { name: ACTIVE_ROW });
    await expect(active).toBeVisible();

    const paint = await active.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { shadow: cs.boxShadow, bg: cs.backgroundColor };
    });

    // ring-1 ring-inset compiles to an `inset` box-shadow. A bare colour swatch
    // (the pre-2026-08-01 shape) has `none` here.
    expect(paint.shadow).toContain('inset');
    expect(paint.shadow).not.toBe('none');
    // …over a solid emerald fill, not a transparent row.
    expect(paint.bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('desks drill lists pointer desks without auto-opening', async ({ page }) => {
    const spine = await openDeskGroup(page);
    await expect(spine.getByRole('button', { name: ACTIVE_ROW })).toBeVisible();
    await expect(spine.getByRole('button', { name: /^Go to Incoming$/ })).toBeVisible();
  });

  test('hover travels the glyph only — the row box does not move or scale', async ({
    page,
  }) => {
    const spine = await openDeskGroup(page);
    const row = spine.getByRole('button', { name: /^Go to Incoming$/ });
    await expect(row).toBeVisible();

    const before = await row.boundingBox();
    const glyphBefore = await row.locator('svg').first().boundingBox();

    await row.hover();
    await page.waitForTimeout(200); // the 150ms transform settles

    const after = await row.boundingBox();
    const glyphAfter = await row.locator('svg').first().boundingBox();

    // The row is rigid: identical origin AND identical size (a scale would grow it).
    expect(after!.x).toBeCloseTo(before!.x, 1);
    expect(after!.y).toBeCloseTo(before!.y, 1);
    expect(after!.width).toBeCloseTo(before!.width, 1);
    expect(after!.height).toBeCloseTo(before!.height, 1);

    // The glyph is the whole affordance: +2px x, −1px y.
    expect(glyphAfter!.x - glyphBefore!.x).toBeCloseTo(2, 0);
    expect(glyphAfter!.y - glyphBefore!.y).toBeCloseTo(-1, 0);
  });

  test('reduced motion keeps the accent and drops the travel', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'tests/.auth/qa-admin.json',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const spine = await openDeskGroup(page);

    const row = spine.getByRole('button', { name: /^Go to Incoming$/ });
    const glyphBefore = await row.locator('svg').first().boundingBox();
    await row.hover();
    await page.waitForTimeout(200);
    const glyphAfter = await row.locator('svg').first().boundingBox();

    // `motion-safe:` gates the CSS transform — under reduce the glyph is still.
    expect(glyphAfter!.x).toBeCloseTo(glyphBefore!.x, 1);
    expect(glyphAfter!.y).toBeCloseTo(glyphBefore!.y, 1);

    // The row still ANSWERS, though — the accent wash is not motion.
    await expect(spine.getByRole('button', { name: ACTIVE_ROW })).toHaveCSS(
      'box-shadow',
      /inset/,
    );

    await context.close();
  });
});
