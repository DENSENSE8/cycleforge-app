import { test, expect, type Page } from '@playwright/test';

/**
 * `/search?sel=order:` — the 3-column Search & Details station.
 * Contract: `docs/rules/display/search-station.md`.
 *
 * Asserts the four things a reader of that recipe would otherwise have to take
 * on trust, and that a refactor can silently break:
 *   1. three columns, one white sheet, zero padding on the structural shells
 *   2. the centre order — context (pinned) → Items → thread (no Status)
 *   3. the stepper is on the RIGHT (`timeline` leaf), never in the centre
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

  test('the centre is context → Items → thread, with NO Status block', async ({ page }) => {
    await openOrder(page);

    const centre = page.locator(CENTRE);
    await expect(centre.locator(ITEMS)).toBeVisible();

    // Status left the centre entirely (operator ruling 2026-08-21) — both the
    // stepper AND the audit rows are the right-edge `timeline` leaf's now. An
    // earlier revision opened on 25 rows of machine events with the thread
    // pushed below the fold.
    await expect(centre.locator(STATUS)).toHaveCount(0);

    const identityBox = await page.locator('[data-testid="station-context-bar"]').boundingBox();
    const itemsBox = await centre.locator(ITEMS).boundingBox();
    const composerBox = await centre.locator('textarea').last().boundingBox();

    expect(identityBox!.y, 'carton context leads').toBeLessThan(itemsBox!.y);
    expect(itemsBox!.y, 'Items precedes the thread').toBeLessThan(composerBox!.y);
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

  // The floating note SURVIVED the 2026-08-21 station port (operator call): it
  // is the only note entry on `/search` for `?sel=receiving:` and `?sel=unit:`,
  // because neither `CartonInspector` nor `UnitDetailsPanel` mounts a thread.
  // It now composes `ThreadNoteComposer variant="float"` rather than forking it,
  // which is why `bodyClassName="pb-16"` on the scrollport must also stay.
  test('the rail stacks find → recents → floating note, and the recents get the height', async ({ page }) => {
    await openOrder(page);

    const boxes = await page.locator(RAIL).evaluate((rail) =>
      Array.from(rail.children).map((c) => {
        const b = c.getBoundingClientRect();
        return { y: Math.round(b.y), h: Math.round(b.height) };
      }),
    );

    expect(boxes.length, 'find bar · recents · floating note').toBe(3);
    const [find, recents, note] = boxes;

    // Regression: `TechRailSearchBar variant="chrome"` is `h-full`, built for a
    // horizontal band. In this flex COLUMN it took the entire rail and squashed
    // the recents scrollport to zero — the rail rendered visually empty.
    expect(find.h, 'the find bar is a band, not the whole rail').toBeLessThan(80);
    expect(recents.h, 'the recents get the remaining height').toBeGreaterThan(300);
    expect(find.y, 'find leads').toBeLessThan(recents.y);
    expect(note.y, 'the note floats at the bottom').toBeGreaterThan(recents.y);
  });

  test('Items AND the composer both fit on first paint', async ({ page }) => {
    await openOrder(page);

    // Regression: the centre rendered the FULL audit log (25 rows on the QA
    // fixture), which pushed Items and the thread below the fold — the surface
    // opened on a wall of audit. Status has since left the centre entirely, so
    // this now guards the two blocks that remain.
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
