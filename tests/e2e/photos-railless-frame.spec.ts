/**
 * Media Library — the rail-less frame (S1.5) + find row / footer path (2026-09-01).
 *
 *   npx playwright test tests/e2e/photos-railless-frame.spec.ts --project=qa-desktop
 *
 * Pins:
 *
 *  1. **The centre actually got the width.** `/ops/photos` is rail-less
 *     (Pattern E) via `CONTEXT_PANEL_ROUTE_KEYS`, so the stream must run the
 *     full content row and clear `MIN_WORK_SURFACE_PX` (784) at 1440.
 *  2. **Card chrome is find row + TableStatusBar footer** (breadcrumb on
 *     `lead`). Lifecycle tabs + type cube live on the frame tab row.
 *
 * Assertions are shape-based, not count-based (QA org seed may change).
 */
import { test, expect, type Page } from '@playwright/test';

/**
 * Footer row-count readout — the SETTLED gate every test here opens with.
 * Digits are what say "settled" (loading paints nothing useful here).
 */
const META_LINE = '[data-testid="data-table-row-count"]';

/** The readout has settled on a real count. */
const SETTLED_META = /\d/;

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
  test('no left context column — the stream fills the desk stage', async ({ page }) => {
    await landOnStream(page);

    const geometry = await page.evaluate(() => {
      const stage = document.querySelector('[data-testid="desk-page-stage"]');
      const display = document.querySelector('[data-testid="photo-library-display"]');
      return {
        stage: stage ? Math.round(stage.getBoundingClientRect().width) : 0,
        display: display ? Math.round(display.getBoundingClientRect().width) : 0,
        left: display ? Math.round(display.getBoundingClientRect().left) : -1,
        stageLeft: stage ? Math.round(stage.getBoundingClientRect().left) : -1,
      };
    });

    // Rail-less Pattern E: nothing reserved beside the stream inside the stage
    // (a resident context rail would push this in by ~360). The stage itself is
    // the desk measure (`max-w-6xl`) — not edge-to-edge of `<main>`.
    expect(geometry.left).toBe(geometry.stageLeft);
    expect(geometry.display).toBeGreaterThanOrEqual(MIN_WORK_SURFACE_PX);
    expect(geometry.display).toBe(geometry.stage);
  });

  test('card chrome is find row + footer status; tabs live on the frame', async ({ page }) => {
    await landOnStream(page);

    await expect(page.locator('[data-testid="photo-library-find-row"]')).toBeVisible();
    await expect(page.locator('[data-testid="data-table-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="data-table-status-lead"]')).toBeVisible();
    await expect(page.locator(TYPES_CUBE)).toBeVisible();

    const stack = await page.evaluate(() => {
      const find = document.querySelector('[data-testid="photo-library-find-row"]');
      const display = document.querySelector('[data-testid="photo-library-display"]');
      const status = document.querySelector('[data-testid="data-table-status"]');
      const footer = document.querySelector('[data-testid="dashboard-footer"]');
      const scroll = document.querySelector('[data-testid="dashboard-scroll"]');
      const host = scroll?.parentElement;
      if (!find || !display || !status || !footer || !scroll || !host) return null;
      return {
        findBottom: Math.round(find.getBoundingClientRect().bottom),
        displayTop: Math.round(display.getBoundingClientRect().top),
        scrollBottom: Math.round(scroll.getBoundingClientRect().bottom),
        footerTop: Math.round(footer.getBoundingClientRect().top),
        footerBottom: Math.round(footer.getBoundingClientRect().bottom),
        hostBottom: Math.round(host.getBoundingClientRect().bottom),
        statusTop: Math.round(status.getBoundingClientRect().top),
        // Footer is a non-scrolling sibling — must not live inside the scrollport.
        statusInsideScroll: scroll.contains(status),
      };
    });
    expect(stack).toBeTruthy();
    expect(stack!.displayTop).toBe(stack!.findBottom);
    expect(stack!.statusInsideScroll, 'status bar is outside the scroll port').toBe(false);
    expect(stack!.footerTop).toBe(stack!.scrollBottom);
    expect(stack!.statusTop).toBe(stack!.footerTop);
    // Pinned to the bottom of the scroll shell — not floating mid-grid.
    expect(stack!.footerBottom).toBe(stack!.hostBottom);
  });

  test('header Download CTA exports the shown window', async ({ page }) => {
    await landOnStream(page);

    const download = page.getByTestId('photo-library-export');
    await expect(download).toBeVisible();
    await expect(download).toBeEnabled();
    await expect(download).toHaveText(/Download \d+/);
    await expect(page.getByTestId('photo-library-add-photos')).toBeVisible();
  });

  test('photo tiles form a tight Google Photos wall', async ({ page }) => {
    await landOnStream(page);
    await expect(page.locator(TILE).first()).toBeVisible();
    await expect(page.getByTestId('photo-entity-group-header').first()).toBeVisible();

    const gaps = await page.evaluate(() => {
      const display = document.querySelector('[data-testid="photo-library-display"]');
      const tiles = [...document.querySelectorAll('[data-testid="photo-tile"]')].slice(0, 8);
      if (!display || tiles.length < 2) return null;
      const style = getComputedStyle(display);
      const boxes = tiles.map((t) => {
        const card = t.closest('.group') ?? t.parentElement;
        return card!.getBoundingClientRect();
      });
      // Same-row neighbors: Google Photos seam is ~2px (gap-0.5).
      const rowGaps: number[] = [];
      for (let i = 1; i < boxes.length; i++) {
        const prev = boxes[i - 1]!;
        const cur = boxes[i]!;
        if (Math.abs(prev.top - cur.top) > 2) continue;
        rowGaps.push(Math.round(cur.left - prev.right));
      }
      const header = document.querySelector('[data-testid="photo-entity-group-header"]');
      const labelUnderTile = tiles[0]?.closest('.group')?.querySelector('.truncate');
      return {
        rowGaps,
        padL: parseFloat(style.paddingLeft) || 0,
        padR: parseFloat(style.paddingRight) || 0,
        padT: parseFloat(style.paddingTop) || 0,
        hasEntityHeader: Boolean(header),
        // Titles live on the group header — not cloned under each tile.
        tileHasTitleClone: Boolean(labelUnderTile),
      };
    });
    expect(gaps, 'enough same-row tiles to measure').toBeTruthy();
    expect(gaps!.padL, 'no left inset on the stream').toBe(0);
    expect(gaps!.padR, 'no right inset on the stream').toBe(0);
    expect(gaps!.padT, 'no top inset on the stream').toBe(0);
    expect(gaps!.hasEntityHeader).toBe(true);
    expect(gaps!.tileHasTitleClone, 'PO/ticket title is not cloned on tiles').toBe(false);
    expect(gaps!.rowGaps.length).toBeGreaterThan(0);
    for (const gap of gaps!.rowGaps) {
      expect(gap, 'Google Photos wall seam (≤3px)').toBeLessThanOrEqual(3);
    }
  });

  test('entity group header select-all arms the selection', async ({ page }) => {
    await landOnStream(page);
    const header = page.getByTestId('photo-entity-group-header').first();
    await expect(header).toBeVisible();
    await header.getByTestId('photo-group-select-all').click();
    await expect(page.getByTestId('data-table-selected-count')).toBeVisible();
    await expect(page.getByTestId('data-table-selected-count')).toContainText(/selected/);
  });

  /** Find-row display controls track the 28px chrome row. */
  test('every find-row display control shares its row height', async ({ page }) => {
    await landOnStream(page);

    const rows = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
      };
      return {
        gridSize: box('[role="group"][aria-label="Grid size"]'),
        refresh: box('button[aria-label="Refresh photos"]'),
        display: box('[role="group"][aria-label="Photo display"]'),
      };
    });

    for (const [name, cell] of Object.entries(rows)) {
      expect(cell, `${name} is mounted`).toBeTruthy();
      expect(cell!.h, `${name} fits its 28px band`).toBeLessThanOrEqual(28);
      expect(cell!.h, `${name} fills its band`).toBeGreaterThanOrEqual(26);
    }

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
    expect(seams, 'find-row control cells are measurable').toBeTruthy();
    expect(seams!.length, 'find-row has a multi-cell strip').toBeGreaterThan(1);
    for (const seam of seams!) expect(seam).toBeLessThanOrEqual(4);

    expect(rows.refresh!.top).toBe(rows.gridSize!.top);
    expect(rows.display!.top).toBe(rows.gridSize!.top);
    expect(rows.refresh!.bottom).toBe(rows.gridSize!.bottom);
    expect(rows.display!.bottom).toBe(rows.gridSize!.bottom);
  });


  test('Band-1 tabs are the scope writer and round-trip through the URL', async ({ page }) => {
    await landOnStream(page);

    await page.getByRole('tab', { name: 'Unboxing', exact: true }).click();
    await expect(page).toHaveURL(/sourceScope=unboxing/);

    await page.reload();
    await expect(page.locator(META_LINE)).toContainText(SETTLED_META);
    await expect(page).toHaveURL(/sourceScope=unboxing/);

    // `all` is the default and drops out of the URL rather than serializing.
    await page.getByRole('tab', { name: 'All', exact: true }).click();
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

  test('find-row filter menu opens; Unboxing exposes the stage facet', async ({ page }) => {
    await landOnStream(page);
    const refine = page.getByTestId('filter-menu-trigger');

    await refine.click();
    await expect(page.getByText('Staff', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    // Evidence stage is Unboxing-only — absent on All, present after the scope tab.
    await expect(page.getByTestId('photo-library-stage-filter')).toHaveCount(0);
    await page.getByRole('tab', { name: 'Unboxing', exact: true }).click();
    await expect(page).toHaveURL(/sourceScope=unboxing/);
    await refine.click();
    await expect(page.getByTestId('photo-library-stage-filter')).toBeVisible();
  });

  test('the media-type cube leads the tab rail and opens its own list', async ({ page }) => {
    await landOnStream(page);

    const cube = page.locator(TYPES_CUBE);
    await expect(cube).toBeVisible();

    // Leading means leading: the cube's left edge is the band's, and the first
    // tab starts after it (`gap-0`, abutting — never host air between them).
    const [cubeBox, firstTabBox] = await Promise.all([
      cube.boundingBox(),
      page.getByRole('tab', { name: 'All', exact: true }).boundingBox(),
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
    // archive. Frame tabs + find row + footer path survive.
    await expect(page.locator(TYPES_CUBE)).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Unboxing', exact: true })).toBeVisible();
    await expect(page.locator('[data-testid="photo-library-find-row"]')).toBeVisible();
    await expect(page.locator('[data-testid="data-table-status-lead"]')).toBeVisible();
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
