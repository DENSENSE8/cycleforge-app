/**
 * Media Library — the desk inspector's selection ⇄ `?photoId=` contract.
 *
 *   npx playwright test tests/e2e/photos-inspector-walk.spec.ts --project=qa-desktop
 *
 * Sibling of `photos-library-deep-link.spec.ts`: that spec is the net for the
 * FILTER params, this one is the net for the record param S1 added on top of
 * them. Both assert against the QA org (`.claude/rules/verify.md`); photo rows
 * come from `scripts/provision-qa-org.ts` → `seedPhotoFixtures`, so run
 * `pnpm provision:qa-org` first.
 *
 * The rules it pins are the ones that are invisible in code review:
 *
 *  1. **Cardinality is the mode switch** — 1 → record rail, ≥2 → the batch rail
 *     (`PhotoBatchInspectorPanel`, which replaced the chrome bulk toolbar
 *     2026-08-09), 0 → neither. One slot at two cardinalities, never both.
 *  2. **`?photoId=` is written from selection and cleared with it** — the
 *     eviction rule. A filter change that drops the photo closes the rail.
 *  3. **The rail PUSHES.** `data-right-rail-mode="push"`, and the grid reflows
 *     beside it rather than being covered.
 *  4. **The tile click still opens the fullscreen viewer.** This is the axis the
 *     retired `PhotoInspectorPanel` failed on, so it is asserted, not assumed.
 *
 * Fixture limit, deliberately worked around rather than hidden: QA photos are
 * metadata-only, so the lightbox's IMAGE never loads. The assertion is that the
 * viewer MOUNTS (`photo-lightbox`), which is the routing fact under test — the
 * pixel is `photos-library-context-panel.spec.ts`'s problem and is blocked on a
 * byte-serving fixture (see `QA_FIXTURE_PHOTOS`).
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
const META_LINE = '[data-testid="data-table-row-count"]';

/** The readout has settled on a real count. */
const SETTLED_META = /\d/;

const RAIL = '[data-testid="photo-inspector-panel"]';
const TILE = '[data-testid="photo-tile"]';

async function landOnStream(page: Page): Promise<void> {
  await page.goto('/ops/photos');
  await expect(page.locator(META_LINE)).toContainText(SETTLED_META);
  await expect(page.locator(TILE).first()).toBeVisible();
}

/**
 * Tick a tile's hover checkmark — the gesture that starts selection.
 *
 * Matches on `aria-pressed`, not on the label: the mark's accessible name flips
 * to "Deselect photo" once a tile is selected, so a name-only locator silently
 * stops finding the control the moment the test is doing its job.
 */
async function toggleTile(page: Page, index: number): Promise<void> {
  const card = page.locator(TILE).nth(index).locator('xpath=..');
  await card.hover();
  await card.locator('button[aria-pressed]').first().click();
}

/**
 * Read `?photoId=` only once the write has landed. The rail paints optimistically
 * (that is the whole point of `useOptimisticUrlParam`), so the URL trails the
 * open by a tick — a bare `page.url()` right after the click races it.
 */
async function openedPhotoId(page: Page): Promise<string> {
  await expect(page).toHaveURL(/[?&]photoId=\d+/);
  return new URL(page.url()).searchParams.get('photoId')!;
}

test.describe('Media Library · desk inspector', () => {
  test('one selected photo opens a PUSHING rail and writes ?photoId=', async ({ page }) => {
    await landOnStream(page);
    await expect(page.locator(RAIL)).toHaveCount(0);

    await toggleTile(page, 0);

    await expect(page.locator(RAIL)).toBeVisible();
    await expect(page).toHaveURL(/[?&]photoId=\d+/);

    // Push, not float: the host renders the in-flow column branch, and nothing
    // covers the grid.
    await expect(page.locator('[data-right-rail-mode="push"]')).toBeVisible();
    await expect(page.locator('[data-right-rail-mode="overlay"]')).toHaveCount(0);

    // The batch rail is the OTHER cardinality — it must not be co-mounted.
    await expect(page.locator('[data-testid="photo-batch-inspector-panel"]')).toHaveCount(0);
  });

  test('reload restores the same open photo', async ({ page }) => {
    await landOnStream(page);
    await toggleTile(page, 0);
    await expect(page.locator(RAIL)).toBeVisible();

    const opened = await openedPhotoId(page);

    await page.reload();
    await expect(page.locator(RAIL)).toBeVisible();
    expect(new URL(page.url()).searchParams.get('photoId')).toBe(opened);
  });

  /**
   * The inspector's ↑↓ stepper was removed 2026-08-19: walking the stream from
   * inside the record rail was a second door onto a selection the GRID already
   * owns. Selection moves in the grid; the inspector follows it.
   */
  test('the grid walks the stream and the inspector retargets — no stepper', async ({
    page,
  }) => {
    await landOnStream(page);
    await toggleTile(page, 1);
    await expect(page.locator(RAIL)).toBeVisible();

    const second = await openedPhotoId(page);

    // The stepper is gone from the rail entirely.
    await expect(
      page.getByTestId('photo-inspector-prev'),
      'the rail no longer steps the stream — the grid does',
    ).toHaveCount(0);
    await expect(page.getByTestId('photo-inspector-next')).toHaveCount(0);

    // Picking another tile retargets the ONE inspector; it never remounts a
    // second one.
    await toggleTile(page, 1);
    await toggleTile(page, 0);
    await expect(page.locator(RAIL)).toBeVisible();
    const first = await openedPhotoId(page);
    expect(first).not.toBe(second);
    await expect(page.locator(RAIL)).toHaveCount(1);
  });

  test('a second selection yields the record rail to the batch rail, and back', async ({ page }) => {
    await landOnStream(page);
    await toggleTile(page, 0);
    await expect(page.locator(RAIL)).toBeVisible();

    await toggleTile(page, 1);
    await expect(page.locator(RAIL)).toHaveCount(0);
    await expect(page.getByTestId('photo-batch-count')).toHaveText(/2 selected/);
    await expect(page).not.toHaveURL(/[?&]photoId=/);

    // Untick the second → back to n = 1 → the rail returns.
    await toggleTile(page, 1);
    await expect(page.locator(RAIL)).toBeVisible();
    await expect(page).toHaveURL(/[?&]photoId=\d+/);
  });

  test('a filter change evicts the open photo — selection, param and rail all clear', async ({
    page,
  }) => {
    await landOnStream(page);
    await toggleTile(page, 0);
    await expect(page.locator(RAIL)).toBeVisible();

    // A scope switch swaps the stream out from under the selection. The rail
    // must not survive the set it was picked from.
    await page.goto('/ops/photos?sourceScope=packing');
    await expect(page.locator(RAIL)).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]photoId=/);
  });

  test('the tile click still opens the fullscreen viewer, not the rail', async ({ page }) => {
    await landOnStream(page);

    await page.locator(TILE).first().click();

    await expect(page.locator('[data-testid="photo-lightbox"]')).toBeVisible();
    await expect(page.locator(RAIL)).toHaveCount(0);
    await expect(page).not.toHaveURL(/[?&]photoId=/);
  });
});
