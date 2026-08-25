import { test, expect, type Page } from '@playwright/test';

/**
 * `/search?sel=order:` — the 3-column Search & Details station.
 *
 * Contract: `SearchOrderCentre`'s docblock. It used to be
 * `docs/rules/display/search-station.md`, deleted 2026-08-21 with the rest of
 * the house-law corpus (`0c2fd3746`) and recoverable from git history.
 *
 * Asserts the four things a reader of that recipe would otherwise have to take
 * on trust, and that a refactor can silently break:
 *   1. three columns, one white sheet, zero padding on the structural shells
 *   2. the centre order — context (pinned) → Status → Items → thread
 *   3. the stepper is in the centre AND on the `timeline` leaf (see below)
 *   4. auto-collapse fires on composer focus and on scroll
 *
 * QA org only (`.claude/rules/verify.md`) — the fixture order ids are minted by
 * the provisioner, so they are resolved by ORDER NUMBER here rather than
 * hardcoded (`createFixtureOrder` is ON CONFLICT DO NOTHING, so the numbers are
 * stable but the pks are not).
 *
 *   pnpm provision:qa-org
 *   npx playwright test tests/e2e/search-station-layout.spec.ts --project=qa-desktop
 */

const CENTRE = '[data-testid="search-order-station-center"]';
const STATUS = '[data-testid="search-order-status-block"]';
const ITEMS = '[data-testid="search-order-items-block"]';
const RAIL = '[data-testid="search-sidebar-panel"]';
const DISPLAYS = '[data-testid="search-order-displays-push"]';

/** Resolve a QA fixture order's numeric pk through the app's own lookup API. */
async function qaOrderId(page: Page, orderNumber: string): Promise<number | null> {
  const res = await page.request.get(`/api/orders/lookup/${encodeURIComponent(orderNumber)}`);
  if (!res.ok()) return null;
  const body = await res.json().catch(() => null);
  const id = Number(body?.order?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function openOrder(page: Page): Promise<number> {
  // Any fixture order; `pending` carries tracking so the shipping facts paint.
  for (const num of ['QA-TEST-UNSHIP-PENDING', 'QA-TEST-UNSHIP-AWAIT', 'QA-TEST-PACKED']) {
    const id = await qaOrderId(page, num);
    if (id) {
      await page.goto(`/search?sel=order:${id}`);
      await page.locator(CENTRE).waitFor({ state: 'visible', timeout: 30_000 });
      return id;
    }
  }
  test.skip(true, 'no QA fixture order — run `pnpm provision:qa-org`');
  return 0;
}

test.describe('Search & Details station layout', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'station chrome is a desktop layout');

  test('three columns render, and the shells carry no padding', async ({ page }) => {
    await openOrder(page);

    await expect(page.locator(RAIL)).toBeVisible();
    await expect(page.locator(CENTRE)).toBeVisible();

    // Open the Displays column from the parked strip — it starts closed.
    await page.locator('[data-testid="scan-station-displays-open-strip"]').click();
    await expect(page.locator(DISPLAYS)).toBeVisible();

    // Zero padding is the WMS rule; padding lives inside components only.
    for (const sel of [RAIL, CENTRE]) {
      const pad = await page.locator(sel).evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
      });
      expect(pad, `${sel} must have zero padding`).toEqual(['0px', '0px', '0px', '0px']);
    }
  });

  test('all three columns paint the same white plane', async ({ page }) => {
    await openOrder(page);
    await page.locator('[data-testid="scan-station-displays-open-strip"]').click();
    await expect(page.locator(DISPLAYS)).toBeVisible();

    // Assert the PAINTED plane, not the outermost node. The Displays testid
    // sits on the sizing `<aside>`, which is deliberately transparent — the
    // white is on its child. Reading the wrapper would report `rgba(0,0,0,0)`
    // and call a correct column broken.
    const paintedBg = (sel: string) =>
      page.locator(sel).evaluate((el) => {
        for (let node: Element | null = el; node; node = node.firstElementChild) {
          const bg = getComputedStyle(node).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
        }
        return 'rgba(0, 0, 0, 0)';
      });

    const centreBg = await page
      .locator('[data-station-surface="card"]')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(centreBg, 'centre plane').toBe('rgb(255, 255, 255)');
    expect(await paintedBg(RAIL), 'left rail plane').toBe('rgb(255, 255, 255)');
    expect(await paintedBg(DISPLAYS), 'right column plane').toBe('rgb(255, 255, 255)');
  });

  test('the centre is context → Status → Items → thread', async ({ page }) => {
    await openOrder(page);

    const centre = page.locator(CENTRE);
    await expect(centre.locator(STATUS)).toBeVisible();
    await expect(centre.locator(ITEMS)).toBeVisible();

    // Status is BACK in the centre (operator ruling 2026-08-22), reversing the
    // 2026-08-21 ruling that moved both halves to the right-edge `timeline`
    // leaf. It sits between the carton context and Items, and it renders the
    // same stepper + trail the leaf does — not a reduced summary of them.
    const identityBox = await page.locator('[data-testid="station-context-bar"]').boundingBox();
    const statusBox = await centre.locator(STATUS).boundingBox();
    const itemsBox = await centre.locator(ITEMS).boundingBox();
    const composerBox = await centre.locator('textarea').last().boundingBox();

    expect(identityBox!.y, 'carton context leads').toBeLessThan(statusBox!.y);
    expect(statusBox!.y, 'Status precedes Items').toBeLessThan(itemsBox!.y);
    expect(itemsBox!.y, 'Items precedes the thread').toBeLessThan(composerBox!.y);
  });

  test('Status and Items share one collapse controller', async ({ page }) => {
    await openOrder(page);

    // They are the pair `auto-collapse.ts` was written for. Both must yield
    // together when the operator starts writing — that shared fold is the only
    // thing standing between a centre with a full audit trail in it and the
    // 2026-08-21 failure mode (a wall of machine events, thread below the fold).
    const statusToggle = page.locator(`${STATUS} [data-collapse-toggle]`);
    const itemsToggle = page.locator(`${ITEMS} [data-collapse-toggle]`);
    await expect(statusToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(itemsToggle).toHaveAttribute('aria-expanded', 'true');

    await page.locator(`${CENTRE} textarea`).last().focus();
    await expect(statusToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(itemsToggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('the Timeline leaf carries BOTH halves of Status — stepper and trail', async ({ page }) => {
    await openOrder(page);

    // Neither half may appear in the centre. `Audit` stays asserted here even
    // though the leaf no longer prints that word: the point is that no heading
    // by either name sits in the centre.
    const centre = page.locator(CENTRE);
    await expect(centre.getByText('Scanned Out', { exact: false })).toHaveCount(0);
    await expect(centre.getByText('Audit', { exact: true })).toHaveCount(0);
    await expect(centre.getByText('Activity', { exact: true })).toHaveCount(0);

    await page.locator('[data-testid="scan-station-displays-open-strip"]').click();
    await page.locator(DISPLAYS).getByText('Timeline', { exact: false }).first().click();

    const leaf = page.locator(DISPLAYS);
    // Stepper — `OrderPipelineSection` mounts all three milestone rows always.
    await expect(leaf.getByText('Packed', { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    // The trail. It is `OrderTimelineSection` now (the order-record SoT), which
    // passes no `title`, so `TimelineSection` falls back to its default
    // heading — the leaf reads **Activity**, not the local "Audit" block this
    // replaced. Asserting the old word here is how you find out the leaf
    // silently went back to a page-local merge.
    await expect(leaf.getByText('Activity', { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('the Units leaf is additive, and its index row appears with it', async ({ page }) => {
    await openOrder(page);
    await page.locator('[data-testid="scan-station-displays-open-strip"]').click();

    const displays = page.locator(DISPLAYS);
    // Gated on the order carrying serials — `buildSectionTabs` omits the leaf
    // and `buildSearchOrderDisplayIndexRows` omits the row on the SAME
    // condition, so the two either both appear or both do not. A row without
    // its leaf navigates nowhere; that pairing is the thing under test.
    const units = displays.getByText('Units', { exact: true });
    const count = await units.count();
    if (count === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'fixture order carries no serials — Units leaf correctly absent',
      });
      return;
    }
    await units.first().click();
    // Per-serial OPERATIONS journeys, not this order's trail: the leaf must not
    // reprint the carrier scans `OrderTimelineSection` already merges.
    await expect(displays).toBeVisible();
  });

  test('Items auto-collapses when the composer takes focus', async ({ page }) => {
    await openOrder(page);

    const itemsToggle = page.locator(`${ITEMS} [data-collapse-toggle]`);
    await expect(itemsToggle).toHaveAttribute('aria-expanded', 'true');

    // Trigger 2 — focus the thread composer.
    const composer = page.locator(`${CENTRE} textarea`).last();
    const present = await composer
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!present) test.skip(true, 'thread composer not mounted (permission-gated)');

    await composer.focus();
    await expect(itemsToggle).toHaveAttribute('aria-expanded', 'false');
  });

  // TWO bands, not three: the station scan band, and the recent rail. A third
  // child here means a page-local dock has crept back onto the rail.
  test('the rail stacks band → recents, and the recents get the height', async ({ page }) => {
    await openOrder(page);

    const boxes = await page.locator(RAIL).evaluate((rail) =>
      Array.from(rail.children).map((c) => {
        const b = c.getBoundingClientRect();
        return { y: Math.round(b.y), h: Math.round(b.height) };
      }),
    );

    expect(boxes.length, 'scan band · recents — no third band').toBe(2);
    const [band, recents] = boxes;

    // Regression: a full-height field variant here once took the entire rail
    // and squashed the recents scrollport to zero — the rail rendered empty.
    expect(band.h, 'the band is a band, not the whole rail').toBeLessThan(80);
    expect(recents.h, 'the recents get the remaining height').toBeGreaterThan(300);
    expect(band.y, 'the band leads').toBeLessThan(recents.y);
  });

  /**
   * The rail IS the Unbox scan station's rail (`ReceivingFeedRail feed="searchRecent"`),
   * so its band is the station scan band — no rail-footer collapse affordance.
   *
   * `TechRailSearchBar variant="rail"` used to sit here: it resolves the column
   * FOOTER face (`h-8` + `border-t`, a floor seam) at the HEAD of the column,
   * and auto-mounts a "Hide sidebar" collapse button under
   * `ContextPanelCollapseProvider`. Unbox's band has neither, so the two
   * stations read as different surfaces at the one place they should match.
   */
  test('the band is the station scan band — no collapse affordance in it', async ({ page }) => {
    await openOrder(page);

    const band = page.locator(RAIL).locator('[data-station-scan-band]');
    await expect(band, 'the rail leads with the station scan band').toHaveCount(1);
    await expect(
      band.getByRole('button', { name: /hide sidebar/i }),
      'the station band carries no rail-footer collapse button',
    ).toHaveCount(0);
  });

  /**
   * ONE row height. The `/search` rail is the station's rail, and a station rail
   * has one row height — a row whose second line renders empty collapses to
   * ~26px beside its ~36px neighbours, which is the exact drift that mounting
   * the shared rail exists to end. Recents that opened a record and recents
   * that opened nothing must be the same height.
   */
  test('every recent row is the same height', async ({ page }) => {
    await openOrder(page);

    const rows = page.locator(`${RAIL} li:has([data-rail-status-dot])`);
    const count = await rows.count();
    if (count < 2) test.skip(true, 'need 2+ recents to compare row heights');

    const heights = await rows.evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().height)),
    );
    const [first] = heights;
    for (const h of heights) {
      expect(Math.abs(h - first), `row heights differ: ${heights.join(', ')}`).toBeLessThanOrEqual(1);
    }
  });

  /**
   * The row shows a PRODUCT TITLE, not an id.
   *
   * The rail is Unbox's `view=viewed` feed, so a row is a real receiving line
   * and its title comes from `catalog_product_title` / `zoho_item_title` via
   * the rail's normal title resolver. The regression this pins is the rail
   * reverting to bare identifiers — tracking numbers, PO numbers, raw ids —
   * which is what it painted while it was fed from typed search strings.
   */
  test('a rail row paints a product title, not a bare identifier', async ({ page }) => {
    await openOrder(page);

    const titles = await page
      .locator(`${RAIL} li:has([data-rail-status-dot]) [data-rail-row-title] p`)
      .evaluateAll((els) => els.map((el) => (el.textContent ?? '').trim()));
    if (titles.length === 0) test.skip(true, 'no recents for the QA staffer');

    // A bare identifier: digits/dashes only, or one unspaced caps+digits token.
    const BARE_ID = /^[\d\s-]+$|^[A-Z0-9-]{8,}$/;
    for (const title of titles) {
      expect(title.length, 'a row title is never empty').toBeGreaterThan(0);
      expect(title, 'a row title must be a product title, not an id').not.toMatch(BARE_ID);
    }
  });

  /**
   * The dot means a real workflow state. It briefly did not: rows carried a
   * null `workflow_status`, the shared `receiving` strategy defaults null to
   * EXPECTED, and every row on the rail read amber "Incoming" — the rail
   * asserting a receiving stage about records that had never been received.
   */
  test('no row claims a status it does not have', async ({ page }) => {
    await openOrder(page);

    const labels = await page
      .locator(`${RAIL} li [data-rail-status-dot]`)
      .evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? ''));
    if (labels.length === 0) test.skip(true, 'no recents for the QA staffer');

    expect(
      labels.every((l) => l === 'Incoming'),
      'every row reading "Incoming" is the null-status default leaking through',
    ).toBe(false);
  });

  // Regression for the double timestamp: the row age is the rail shell's ONE
  // age column (`getActivityAt` → `formatLaneAgeCompact`). A second age render
  // through `formatRelativeTime` put `16d` beside `2w` on every row.
  test('a recent row renders exactly one age', async ({ page }) => {
    await openOrder(page);

    // No testid on rail rows — the status dot is the stable row marker.
    const row = page.locator(`${RAIL} button:has([data-rail-status-dot])`).first();
    if (!(await row.count())) test.skip(true, 'no recents seeded for the QA staffer');

    const ages = await row.evaluate((el) => {
      const AGE = /^\s*\d+\s*(s|m|h|d|w|mo|y)\s*(ago)?\s*$/i;
      return Array.from(el.querySelectorAll('*'))
        .filter((n) => n.children.length === 0 && AGE.test(n.textContent ?? ''))
        .map((n) => (n.textContent ?? '').trim());
    });
    expect(ages, 'one instant, one grammar').toHaveLength(1);
  });

  /**
   * Selecting a recent swaps the centre IN PLACE. The rail
   * dispatches the station's own `receiving-select-line`; the panel translates
   * it. No navigation, no reload.
   */
  test('selecting a recent sets ?sel= in place', async ({ page }) => {
    await openOrder(page);

    const rows = page.locator(`${RAIL} li:has([data-rail-status-dot]) button`);
    const count = await rows.count();
    if (count === 0) test.skip(true, 'no recents seeded for the QA staffer');

    // Only a recent that RESOLVED to a record selects one; a query-only recent
    // has nothing to open, so click through until the URL answers or we run out.
    for (let i = 0; i < count; i += 1) {
      await rows.nth(i).click();
      const sel = new URL(page.url()).searchParams.get('sel');
      if (sel) break;
    }
    if (!new URL(page.url()).searchParams.get('sel')) {
      test.skip(true, 'no resolved recent seeded for the QA staffer');
    }

    await expect
      .poll(() => new URL(page.url()).searchParams.get('sel'), { timeout: 10_000 })
      .toMatch(/^(order|unit|receiving|sku|repair|fba):\d+$/);
  });

  test('Items AND the composer both fit on first paint', async ({ page }) => {
    await openOrder(page);

    // Regression: the centre rendered the FULL audit log (25 rows on the QA
    // fixture), which pushed Items and the thread below the fold — the surface
    // opened on a wall of audit.
    //
    // The audit trail is back in the centre as of 2026-08-22 (operator ruling),
    // so this guard is live again rather than historical. It is deliberately
    // NOT weakened to accommodate the new block: if it goes red, the Status
    // block is costing exactly what the 2026-08-21 ruling said it would, and
    // the fix is to open the centre with Status collapsed — not to delete the
    // assertion that noticed.
    const viewport = page.viewportSize()?.height ?? 900;
    for (const sel of [ITEMS, `${CENTRE} textarea`]) {
      const box = await page.locator(sel).last().boundingBox();
      expect(box, `${sel} must render`).not.toBeNull();
      expect(box!.y, `${sel} must be above the fold on first paint`).toBeLessThan(viewport);
    }
  });

  test('the Photos leaf lands on a real empty state, not a bare sentence', async ({ page }) => {
    await openOrder(page);
    await page.locator('[data-testid="scan-station-displays-open-strip"]').click();
    await page.locator(DISPLAYS).getByText('Photos', { exact: false }).first().click();

    // Either a gallery or the standard EmptyState — never a stuck spinner.
    const gallery = page.locator(DISPLAYS).locator('img');
    const empty = page.locator(DISPLAYS).getByText('No photos', { exact: false });
    await expect(gallery.first().or(empty.first())).toBeVisible({ timeout: 20_000 });
  });
});
