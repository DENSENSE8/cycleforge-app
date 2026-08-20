/**
 * Media Library — the rail-less frame and its three-band chrome (S1.5).
 *
 *   npx playwright test tests/e2e/photos-railless-frame.spec.ts --project=qa-desktop
 *
 * Third net beside `photos-library-deep-link.spec.ts` (filter params) and
 * `photos-inspector-walk.spec.ts` (the record param). This one pins the two
 * facts S1.5 traded a whole left column for, and neither is visible in code
 * review:
 *
 *  1. **The centre actually got the width.** `/ops/photos` is rail-less
 *     (Pattern E) via `CONTEXT_PANEL_ROUTE_KEYS`, so the stream must run the
 *     full content row and clear `MIN_WORK_SURFACE_PX` (784) at 1440. Deleting
 *     the rail alone did NOT achieve this: `RightPaneOverlayHost` is a flex item
 *     that sized to `max-content` and measured **721px inside a 1440 viewport**
 *     — a number the S1 report attributed to the rail. The `min-w-0 flex-1` in
 *     `PhotoLibraryPage` is what hands the reclaimed column to the stream, and
 *     it is one careless class deletion away from regressing silently.
 *  2. **The bands stack, in order, with no gap.** Band 1 tabs → Band 2 search →
 *     Band 3 path strip, contiguous inside one `WORKBENCH_SHEET_CHROME` host.
 *     A gap here means someone reintroduced host padding on a flush host.
 *
 * Assertions are shape-based, not count-based, so seeded row counts may change
 * (`.claude/rules/verify.md` → E2E runs against the QA org).
 */
import { test, expect, type Page } from '@playwright/test';

/** The settled header meta line — see the deep-link spec for why `·` is load-bearing. */
/**
 * The path strip's count readout, and the SETTLED gate every test here opens
 * with.
 *
 * Targeted by test id rather than by copy: this was a `/Photos \d+ ·/` regex
 * whose trailing separator existed only to disambiguate it from the
 * end-of-stream footer's own count, and both broke the first time the wording
 * was improved.
 *
 * The assertion is `toContainText(/\d+ photo/)`, never `toBeVisible()`. The
 * element is mounted during loading too — its loading branch is `Loading…`,
 * which carries no digits — so a mere visibility check passes on the first
 * frame and the test reads its tile count before any photo has arrived. The
 * digits are what say "settled".
 */
const META_LINE = '[data-testid="photo-library-meta"]';

/** The readout has settled on a real count. */
const SETTLED_META = /\d+ photo/i;

/** `MIN_WORK_SURFACE_PX` from `src/lib/right-rail/frame.ts` — the desk centre floor. */
const MIN_WORK_SURFACE_PX = 784;

const DISPLAY = '[data-testid="photo-library-display"]';
const TYPES_CUBE = '[data-testid="photo-media-types"]';
const TILE = '[data-testid="photo-tile"]';
const BATCH = '[data-testid="photo-batch-inspector-panel"]';

async function landOnStream(page: Page): Promise<void> {
  await page.goto('/ops/photos');
  await expect(page.locator(META_LINE)).toContainText(SETTLED_META);
}

/**
 * Tick a tile's hover checkmark — the gesture that starts selection.
 *
 * Matches on `aria-pressed`, not on the label: the mark's accessible name flips
 * to "Deselect photo" once a tile is selected, so a name-only locator silently
 * stops finding the control the moment the test is doing its job. (Same helper
 * as `photos-inspector-walk.spec.ts`; duplicated rather than shared because the
 * two specs are independent nets.)
 */
async function toggleTile(page: Page, index: number): Promise<void> {
  const card = page.locator(TILE).nth(index).locator('xpath=..');
  await card.hover();
  await card.locator('button[aria-pressed]').first().click();
}

test.describe('Media Library · rail-less frame', () => {
  test('no left context column — the stream runs the full content row', async ({ page }) => {
    await landOnStream(page);

    const geometry = await page.evaluate(() => {
      const main = document.querySelector('main');
      const display = document.querySelector('[data-testid="photo-library-display"]');
      return {
        main: main ? Math.round(main.getBoundingClientRect().width) : 0,
        display: display ? Math.round(display.getBoundingClientRect().width) : 0,
        left: display ? Math.round(display.getBoundingClientRect().left) : -1,
        mainLeft: main ? Math.round(main.getBoundingClientRect().left) : -1,
      };
    });

    // The stream starts at the content row's own left edge — nothing reserved
    // beside it. (A resident context rail would push this in by ~360.)
    expect(geometry.left).toBe(geometry.mainLeft);
    expect(geometry.display).toBeGreaterThanOrEqual(MIN_WORK_SURFACE_PX);
    // And it is not merely "wide enough" — it is the whole row.
    expect(geometry.display).toBe(geometry.main);
  });

  test('the chrome is three contiguous bands: tabs, search, path strip', async ({ page }) => {
    await landOnStream(page);

    const bands = await page.evaluate(() => {
      const cube = document.querySelector('[data-testid="photo-media-types"]');
      const host = cube?.closest('div.flex.min-w-0')?.parentElement ?? null;
      if (!host) return [];
      return [...host.children].map((child) => {
        const rect = child.getBoundingClientRect();
        return {
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
          width: Math.round(rect.width),
        };
      });
    });

    expect(bands).toHaveLength(3);
    // Contiguous: each band's top is its predecessor's bottom. A non-zero delta
    // is host `gap-*` / `p-*` creeping back onto a flush sheet-chrome host.
    expect(bands[1].top).toBe(bands[0].bottom);
    expect(bands[2].top).toBe(bands[1].bottom);
    // All three span the same row the stream does.
    for (const band of bands) expect(band.width).toBe(bands[0].width);
  });

  /**
   * Every chrome control tracks the 28px row it sits in.
   *
   * Before 2026-08-20 this surface ran FOUR heights across its two 28px bands:
   * a 24px Views trigger, a 28px inspector toggle, a 32px sort pill and refresh
   * button, and 34px toggle groups (an `h-7` button inside a `border` + `p-0.5`
   * box). The tall ones overflowed the band they lived in, so no two controls
   * shared a top or a bottom edge and the rows read as a ragged parade.
   *
   * The fix was the house answer — `WORKBENCH_CHROME_CUBE_CLASS`, whose whole
   * contract is `self-stretch aspect-square` so a cell tracks the row instead
   * of pinning a size that overflows it. This measures the OUTCOME (shared
   * edges) rather than the class, so a future control that reaches for a fixed
   * `h-8` fails here even if it spells it differently.
   */
  test('every band control shares its row height — no control overflows its band', async ({
    page,
  }) => {
    await landOnStream(page);

    const rows = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
      };
      return {
        // Band 2 — the sort pill and the inspector toggle are the two controls
        // that flank the right cluster.
        sort: box('button[aria-label^="Sort:"]'),
        inspector: box('[data-testid="media-library-inspector-toggle"]'),
        // Band 3 — density group, refresh, select, display toggle.
        gridSize: box('[role="group"][aria-label="Grid size"]'),
        refresh: box('button[aria-label="Refresh photos"]'),
        display: box('[role="group"][aria-label="Photo display"]'),
      };
    });

    for (const [name, cell] of Object.entries(rows)) {
      expect(cell, `${name} is mounted`).toBeTruthy();
      // 28px row; a cell may inset by the band's own hairline, never exceed it.
      expect(cell!.h, `${name} fits its 28px band`).toBeLessThanOrEqual(28);
      expect(cell!.h, `${name} fills its band`).toBeGreaterThanOrEqual(26);
    }

    /*
      Band 3 is ONE strip: every adjacent pair of cells shares a collapsed
      hairline (`-ml-px`, so the measured delta is -1), including across the
      `role="group"` boundaries. A positive delta is a `gap-*` creeping back
      onto the row and re-splitting it into floating clusters.
    */
    const seams = await page.evaluate(() => {
      const inner = document
        .querySelector('button[aria-label="Refresh photos"]')
        ?.closest('div.flex.shrink-0');
      const host = inner?.parentElement;
      if (!host) return null;
      const edges = [...host.querySelectorAll('button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right) };
      });
      return edges.slice(1).map((cell, i) => cell.left - edges[i].right);
    });
    expect(seams, 'Band 3 control cells are measurable').toBeTruthy();
    expect(seams!.length, 'Band 3 has a multi-cell strip').toBeGreaterThan(1);
    for (const seam of seams!) expect(seam).toBeLessThanOrEqual(0);

    // Band 2's two flanking controls share one baseline...
    expect(rows.sort!.bottom).toBe(rows.inspector!.bottom);
    expect(rows.sort!.top).toBe(rows.inspector!.top);
    // ...and Band 3's three clusters share theirs. Different edges per cluster
    // is exactly the ragged row this test exists to keep out.
    expect(rows.refresh!.top).toBe(rows.gridSize!.top);
    expect(rows.display!.top).toBe(rows.gridSize!.top);
    expect(rows.refresh!.bottom).toBe(rows.gridSize!.bottom);
    expect(rows.display!.bottom).toBe(rows.gridSize!.bottom);
  });

  test('Band-1 tabs are the scope writer and round-trip through the URL', async ({ page }) => {
    await landOnStream(page);

    await page.getByRole('button', { name: 'Unboxing', exact: true }).click();
    await expect(page).toHaveURL(/sourceScope=unboxing/);

    await page.reload();
    await expect(page.locator(META_LINE)).toContainText(SETTLED_META);
    await expect(page).toHaveURL(/sourceScope=unboxing/);

    // `all` is the default and drops out of the URL rather than serializing.
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page).not.toHaveURL(/sourceScope=/);
  });

  test('the centre still clears the work-surface floor with the inspector open', async ({ page }) => {
    await landOnStream(page);
    await expect(page.locator('[data-testid="photo-tile"]').first()).toBeVisible();

    // Tick one tile — cardinality is the mode switch, so this opens the rail.
    // (`aria-pressed`, not the label: the mark's name flips once selected.)
    const card = page.locator('[data-testid="photo-tile"]').first().locator('xpath=..');
    await card.hover();
    await card.locator('button[aria-pressed]').first().click();
    await expect(page.locator('[data-testid="photo-inspector-panel"]')).toBeVisible();

    const width = await page.evaluate(() => {
      const display = document.querySelector('[data-testid="photo-library-display"]');
      return display ? Math.round(display.getBoundingClientRect().width) : 0;
    });

    // This is the S1.5 payoff, and the number the plan called out: with the rail
    // gone the inspector can push without squeezing the stream under the floor.
    expect(width).toBeGreaterThanOrEqual(MIN_WORK_SURFACE_PX);
  });

  test('the two facets the rail uniquely held survive, in the find field', async ({ page }) => {
    await landOnStream(page);
    const refine = page.getByRole('button', { name: /Refine media/ });

    // 1. Capture days — the rail's day tree had per-day COUNTS and a jump to a
    //    day off the breadcrumb's current path. Dropping it would be a silent
    //    capability loss on an archive whose primary axis is capture day.
    await refine.click();
    const days = page.getByTestId('photo-capture-days');
    await expect(days).toBeVisible();
    // A day row carries its COUNT — the thing the breadcrumb cannot say, and
    // the reason this facet moved instead of being dropped.
    const firstDay = days.locator('button[aria-pressed]').first();
    await expect(firstDay).toBeVisible();
    await expect(firstDay).toContainText(/\d/);
    await firstDay.click();
    await expect(page).toHaveURL(/dateFrom=\d{4}-\d{2}-\d{2}/);
    await expect(page).toHaveURL(/dateTo=\d{4}-\d{2}-\d{2}/);

    // 2. Outbound document types are scope-conditional — absent everywhere else,
    //    exactly as the rail's chip strip was.
    await page.goto('/ops/photos');
    await expect(page.locator(META_LINE)).toContainText(SETTLED_META);
    await refine.click();
    await expect(page.getByTestId('photo-document-types')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Outbound', exact: true }).click();
    await expect(page).toHaveURL(/sourceScope=outbound/);
    await refine.click();
    const docTypes = page.getByTestId('photo-document-types');
    await expect(docTypes).toBeVisible();
    await docTypes.getByRole('button', { name: 'Shipping labels' }).click();
    await expect(page).toHaveURL(/documentType=shipping_label/);
  });

  test('the media-type cube leads the tab rail and opens its own list', async ({ page }) => {
    await landOnStream(page);

    const cube = page.locator(TYPES_CUBE);
    await expect(cube).toBeVisible();

    // Leading means leading: the cube's left edge is the band's, and the first
    // tab starts after it (`gap-0`, abutting — never host air between them).
    const [cubeBox, firstTabBox] = await Promise.all([
      cube.boundingBox(),
      page.getByRole('button', { name: 'All', exact: true }).boundingBox(),
    ]);
    expect(cubeBox).not.toBeNull();
    expect(firstTabBox).not.toBeNull();
    expect(Math.round(cubeBox!.x + cubeBox!.width)).toBe(Math.round(firstTabBox!.x));

    await cube.click();
    // Creating a media type is a DS input path, never `window.prompt`.
    await expect(page.getByTestId('photo-media-type-add')).toBeVisible();
    await page.getByTestId('photo-media-type-add').click();
    await expect(page.getByTestId('photo-media-type-name')).toBeVisible();
  });
});

/**
 * The n ≠ 1 face of the same right-edge slot (2026-08-09/10).
 *
 * The bulk verbs used to be `PhotoLibraryToolbar`, a chrome band that swapped
 * itself in OVER Bands 1–3 — so ticking two photos took the lifecycle tabs, the
 * search field and the breadcrumb away. They are armed rows on the right edge
 * now, and the terminal pair — Download then Delete — sits on the Macro floor
 * rather than in the list beside the reshaping verbs.
 */
test.describe('Media Library · batch rail', () => {
  test('two selected opens the batch rail and the chrome bands stay put', async ({ page }) => {
    await landOnStream(page);
    await expect(page.locator(TILE).first()).toBeVisible();

    await toggleTile(page, 0);
    await toggleTile(page, 1);

    await expect(page.locator(BATCH)).toBeVisible();
    await expect(page.getByTestId('photo-batch-count')).toHaveText(/2 selected/);

    // THE POINT: selection no longer costs the operator their place in the
    // archive. All three bands survive.
    await expect(page.locator(TYPES_CUBE)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Unboxing', exact: true })).toBeVisible();
    await expect(page.locator(META_LINE)).toContainText(SETTLED_META);

    // One slot, two cardinalities — the n = 1 rail must not be co-mounted.
    await expect(page.locator('[data-testid="photo-inspector-panel"]')).toHaveCount(0);
    // And it pushes, like every other resident right edge.
    await expect(page.locator('[data-right-rail-mode="push"]')).toBeVisible();
  });

  test('the floor is Download then Delete, coplanar and far-right, arming before it commits', async ({
    page,
  }) => {
    await landOnStream(page);
    await expect(page.locator(TILE).first()).toBeVisible();
    await toggleTile(page, 0);
    await toggleTile(page, 1);
    await expect(page.locator(BATCH)).toBeVisible();

    const del = page.getByTestId('photo-batch-delete');
    await expect(del).toBeVisible();
    await expect(del).toHaveAttribute('aria-label', /Delete 2/);

    // Geometry + paint, not vibes:
    //  - Download leads, Delete trails — with two peers "far right" is literal,
    //    which a one-peer spread floor cannot be (its only child fills the row).
    //  - the floor sits BELOW the verb rows, flush to the bottom-right corner;
    //  - and it is COPLANAR with the panel — white, not the desk canvas step.
    const box = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="photo-batch-inspector-panel"]');
      const button = document.querySelector('[data-testid="photo-batch-delete"]');
      const rows = document.querySelector('[data-testid="photo-batch-actions-list"]');
      const chrome = panel?.firstElementChild ?? null;
      if (!panel || !button || !rows || !button.parentElement) return null;
      const p = panel.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      return {
        below: Math.round(b.top) >= Math.round(rows.getBoundingClientRect().bottom),
        peers: [...button.parentElement.children].map((c) => c.getAttribute('data-testid')),
        rightGap: Math.round(p.right - b.right),
        bottomGap: Math.round(p.bottom - b.bottom),
        // Delete occupies its own column rather than the whole row.
        fillsRow: Math.round(b.width) >= Math.round(p.width),
        floorPaint: getComputedStyle(button.parentElement).backgroundColor,
        chromePaint: chrome ? getComputedStyle(chrome).backgroundColor : null,
      };
    });
    expect(box).not.toBeNull();
    expect(box!.below).toBe(true);
    expect(box!.peers).toEqual(['photo-batch-floor-download', 'photo-batch-delete']);
    expect(box!.rightGap).toBe(0);
    expect(box!.bottomGap).toBe(0);
    expect(box!.fillsRow).toBe(false);
    expect(box!.floorPaint).toBe(box!.chromePaint);

    // Never rows: neither floor verb may also be listed above.
    await expect(page.getByTestId('photo-batch-action-delete')).toHaveCount(0);
    await expect(page.getByTestId('photo-batch-action-download')).toHaveCount(0);

    // Arm-then-confirm. Assert the ARMED face and stop — a real bulk delete
    // against the QA org would eat the fixtures every other photo spec reads.
    await del.click();
    await expect(del).toHaveAttribute('aria-label', /Click again to delete/);
  });

  test('↑↓ walks the batch verbs and Enter commits in the same frame', async ({ page }) => {
    await landOnStream(page);
    await expect(page.locator(TILE).first()).toBeVisible();
    // TWO, not one: n = 1 is the record rail's cardinality, so a single tick
    // would open `PhotoInspectorPanel` and there would be no verbs to walk.
    await toggleTile(page, 0);
    await toggleTile(page, 1);
    await expect(page.locator(BATCH)).toBeVisible();
    await expect(page.getByTestId('photo-batch-count')).toHaveText(/2 selected/);

    const first = page.getByTestId('photo-batch-action-select-all');
    await first.focus();
    await expect(first).toHaveAttribute('aria-current', 'true');

    // ↓ moves the cursor to the next verb; the armed marker moves with it, and
    // there is only ever one.
    await page.keyboard.press('ArrowDown');
    await expect(first).not.toHaveAttribute('aria-current', 'true');
    await expect(page.locator(`${BATCH} [aria-current="true"]`)).toHaveCount(1);

    // ↑ walks back, and Enter commits — "Select all N" widens the selection to
    // the loaded stream, which the count reads back without mutating a row.
    await page.keyboard.press('ArrowUp');
    await expect(first).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Enter');
    await expect(first).toContainText('Clear selection');
    await expect(page.getByTestId('photo-batch-count')).not.toHaveText(/2 selected/);
  });
});
