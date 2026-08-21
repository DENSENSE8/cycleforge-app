import { test, expect, type Page } from '@playwright/test';

/**
 * Compound-row parity — the signed-in half of the verification.
 *
 * The unit tests pin what the MODEL declares (one array, one row constant, the
 * same tracks in every family). They cannot see what a browser actually paints,
 * and that gap is exactly where this layout has failed before: Receiving and
 * To-Ship agreed on a 48px row constant while Receiving rendered ONE visible
 * line, because the row shell pinned itself to a 28px header-band class and
 * `[contain:layout_style]` clipped the overflow in silence. A model assertion
 * would have stayed green through all of it.
 *
 * So this measures the rendered box on every surface that mounts the layout,
 * at ONE viewport, and compares them to each other rather than to a number
 * copied out of the source.
 *
 * Run against the QA org (`.claude/rules/verify.md`):
 *   pnpm provision:qa-org
 *   npx playwright test tests/e2e/compound-row-parity.spec.ts --project=qa-desktop
 */

/** The row box every compound table must paint — `COMPOUND_ROW_PX`. */
const COMPOUND_ROW_PX = 48;

/** Canonical track order. The photo is leftmost by hard rule. */
const EXPECTED_TRACKS = ['thumb', 'fulfillment', 'item', 'state', 'open'];

interface Surface {
  name: string;
  /**
   * Every route in this family that mounts the compound layout, most-canonical
   * first. Tried in order: the QA tenant provisions a fixed set of rows, and
   * which LANE of a family holds them is a fixture detail, not a claim this
   * spec should make. Skipping when the first lane happens to be empty would
   * hide the coverage gap rather than close it (`.claude/rules/verify.md`).
   */
  paths: readonly string[];
  /** A row on this surface — each family stamps its own row hook. */
  rowSelector: string;
}

const SURFACES: readonly Surface[] = [
  {
    name: 'Receiving (Unbox · History)',
    paths: ['/unbox', '/receiving/history', '/receiving/lines'],
    rowSelector: '[data-line-row-id]',
  },
  { name: 'Incoming', paths: ['/incoming'], rowSelector: '[data-line-row-id]' },
  {
    name: 'To-Ship (orders)',
    paths: ['/shipping/orders'],
    rowSelector: '[data-order-row-id]',
  },
  { name: 'Tasks', paths: ['/?mode=tasks'], rowSelector: '[data-staff-task-id]' },
];

/**
 * Seed one task when the lane is empty.
 *
 * Tasks are per-STAFF rows, so `provision:qa-org` cannot fixture them the way
 * it fixtures cartons and orders. Creating one through the composer is both the
 * honest way to get a row and a check that the surface still works end to end —
 * and it beats `test.skip`, which would quietly drop the family this whole
 * change exists to bring onto the shared layout.
 */
async function seedTask(page: Page): Promise<void> {
  const composer = page.getByLabel('New task');
  if ((await composer.count()) === 0) return;
  await composer.fill(`QA compound parity ${Date.now()}`);
  // Enter, not the Add button: the composer binds Enter to the same
  // `onSubmit('general')`, and the two footer buttons are both disabled until
  // the draft is non-empty — so a click race on a controlled input is a flake
  // this does not need.
  await composer.press('Enter');
  await page
    .locator('[data-staff-task-id]')
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => undefined);
}

/** Load the first lane of this family that has a compound row; '' when none do. */
async function openSurface(page: Page, surface: Surface): Promise<string> {
  for (const path of surface.paths) {
    await page.goto(path);
    const cell = page.locator(`${surface.rowSelector} [data-col="item"]`).first();
    // 45s: `/unbox` resolves a station record on mount before the grid paints,
    // and a short wait here reads as "empty lane" — which is how a surface with
    // 20 rows silently skipped its own parity check.
    const ok = await cell
      .waitFor({ state: 'visible', timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    if (ok) return path;

    if (surface.rowSelector === '[data-staff-task-id]') {
      await seedTask(page);
      const seeded = await cell
        .waitFor({ state: 'visible', timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      if (seeded) return path;
    }
  }
  return '';
}

test.describe('every compound table paints the same row', () => {
  // One viewport for the whole comparison: the point is that these agree with
  // EACH OTHER, and two surfaces measured at two widths prove nothing.
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const surface of SURFACES) {
    test(`${surface.name} — 48px row, both lines, canonical tracks`, async ({ page }) => {
      // Generous: a family may probe several lanes before one has rows, and
      // `/unbox` resolves a station record on mount before its grid paints.
      test.setTimeout(180_000);
      const path = await openSurface(page, surface);
      if (!path) test.skip(true, `no rows on any ${surface.name} lane for this tenant`);

      const row = page.locator(surface.rowSelector).first();

      // ── the row box ────────────────────────────────────────────────────────
      const box = (await row.boundingBox())!;
      expect
        .soft(Math.round(box.height), `${surface.name} row height`)
        .toBe(COMPOUND_ROW_PX);

      // ── the tracks, in order ───────────────────────────────────────────────
      const tracks = await row
        .locator('[data-col]')
        .evaluateAll((els) =>
          els
            .map((el) => (el as HTMLElement).dataset.col ?? '')
            .filter((k) => k !== '_fill' && k !== 'select'),
        );
      expect(tracks, `${surface.name} track order`).toEqual(EXPECTED_TRACKS);

      // ── BOTH tracks render, and neither is clipped ─────────────────────────
      // Measured on the TRACKS, not on the line content. An empty note is a
      // zero-height child sitting in a track that is still there — which is the
      // whole point of fixing the two rows rather than letting them size to
      // content, because that is what keeps column 2's baselines level with
      // columns 3 and 4 when one row's note happens to be blank.
      //
      // The failure this catches is the real one: a body scissored by an
      // ancestor the cell does not own, which is how Receiving once painted a
      // single visible line while To-Ship painted two from the same component.
      const item = row.locator('[data-col="item"]');
      const body = item.locator(':scope > div').first();
      const lines = body.locator(':scope > div');
      expect(await lines.count(), `${surface.name} item cell lines`).toBe(2);

      const bodyBox = (await body.boundingBox())!;
      // Two lines of 14px and 12px type need ~36px; anything less is a clip.
      expect
        .soft(bodyBox.height, `${surface.name} item body height`)
        .toBeGreaterThanOrEqual(36);
      expect
        .soft(bodyBox.y + bodyBox.height, `${surface.name} item body bottom`)
        .toBeLessThanOrEqual(box.y + box.height + 1);

      // The second child occupies the LOWER track — it is a second line, not a
      // sibling that collapsed onto the first.
      const first = (await lines.nth(0).boundingBox())!;
      const second = (await lines.nth(1).boundingBox())!;
      expect
        .soft(second.y + second.height / 2, `${surface.name} second track centre`)
        .toBeGreaterThan(first.y + first.height / 2);

      await page.screenshot({
        path: `test-results/compound-${path.replace(/\W+/g, '_')}.png`,
        clip: { x: box.x, y: box.y, width: Math.min(box.width, 1200), height: box.height * 6 },
      });
    });
  }
});

test.describe('column widths are draggable from the header', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('dragging the Order track edge changes its width and the rows follow', async ({ page }) => {
    test.setTimeout(180_000);
    // Any compound family will do — the tracks are the same objects, so a drag
    // proven on one is proven on all. Take the first that has rows rather than
    // naming a lane, so an empty fixture moves the test instead of skipping it.
    let surface = SURFACES[0];
    let path = '';
    for (const candidate of SURFACES) {
      path = await openSurface(page, candidate);
      if (path) {
        surface = candidate;
        break;
      }
    }
    if (!path) test.skip(true, 'no compound rows on this tenant');

    const header = page.locator('[role="columnheader"][data-col="fulfillment"]').first();
    await expect(header).toBeVisible();

    const before = (await header.boundingBox())!;
    // The grip is a `<button>` named by `ColumnResizeHandle`; it is
    // `opacity-0` until the header cell is hovered, so hover first and then
    // drive it by coordinates rather than `.click()`.
    const grip = header.getByRole('button', { name: /^Resize .* column/ }).last();
    if ((await grip.count()) === 0) {
      test.skip(true, 'resize grips are not mounted on this surface');
    }
    await header.hover();

    const g = (await grip.boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2 + 60, g.y + g.height / 2, { steps: 12 });
    await page.mouse.up();

    const after = (await header.boundingBox())!;
    expect(after.width, 'the Order track widened').toBeGreaterThan(before.width + 20);

    // The BODY must follow the header — they read the same `--cf-col-*` var, and
    // a header that widens alone is the tell that they do not.
    const cell = page
      .locator(`${surface.rowSelector} [data-col="fulfillment"]`)
      .first();
    const cellBox = (await cell.boundingBox())!;
    expect(Math.abs(cellBox.width - after.width)).toBeLessThan(2);
  });
});
