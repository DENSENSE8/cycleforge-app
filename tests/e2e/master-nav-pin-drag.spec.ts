import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * Pin drag — the round trip, in and back out.
 *
 * Dragging INTO Pinned already worked. Dragging back OUT did not: unpinning was
 * a hover-revealed X and nothing else, so the shelf was a one-way door for the
 * gesture that filled it.
 *
 * The other half under test is the rule that makes the shelf legible at all: a
 * pinned row MOVES, it does not copy. Every other section already filtered
 * pinned rows out; the top group did not, because nothing up there could be
 * pinned. Media Library can be pinned now, so it can — and must not — appear in
 * both places at once.
 *
 * Media Library is the subject deliberately: it is the row whose structural
 * exemption was removed, so it exercises the top-group filter that the desk and
 * station rows never could.
 *
 * A unit test cannot reach any of this. `isStructuralSpinePinHref` and
 * `pagesNotPinned` are covered in `src/lib/quick-access/*.test.ts`; what those
 * cannot see is whether a 180ms hold-drag actually lands on the droppable and
 * whether the row leaves the group it came from.
 */

const PAGES_MENU = '[role="menu"][aria-label="Pages"]';
const NAV_COLUMN_OPEN = '[data-sidebar-nav-column][data-open="true"]';
const MEDIA_LIBRARY = 'Media Library';

async function openSpine(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForTimeout(2_000);
  if ((await page.locator(NAV_COLUMN_OPEN).count()) === 0) {
    await page.locator('header button').first().click();
  }
  await expect(page.locator(NAV_COLUMN_OPEN)).toBeVisible();
  await expect(page.locator(PAGES_MENU)).toBeVisible();
}

/**
 * dnd-kit's PointerSensor here is `{ delay: 180, tolerance: 8 }` — the pointer
 * must be held STILL for 180ms before any movement, or the drag never starts
 * and the gesture reads as a click that navigates away. Hence down → wait →
 * move, never down → move.
 */
async function holdDrag(page: Page, source: Locator, dest: Locator) {
  const from = await source.boundingBox();
  const to = await dest.boundingBox();
  if (!from || !to) throw new Error('missing drag boxes');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  // Step the move so dnd-kit sees a stream of pointermove events rather than
  // one teleport, which its collision detection cannot resolve.
  await page.mouse.move(
    to.x + to.width / 2,
    to.y + Math.min(24, to.height / 2),
    { steps: 16 },
  );
  await page.mouse.up();
}

const pinnedCluster = (page: Page) => page.getByRole('group', { name: 'Pinned' });
const topGroup = (page: Page) => page.getByRole('group', { name: 'Top pages' });
const unpinMedia = (page: Page) =>
  page.getByRole('button', { name: `Unpin ${MEDIA_LIBRARY}` });

test.describe('MasterNav pin drag', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  // Pins persist per staff member (localStorage + staff_preferences), so a
  // failed run must not leave this account's shelf rearranged for the next one.
  test.afterEach(async ({ page }) => {
    const stray = unpinMedia(page);
    if ((await stray.count()) > 0) await stray.first().click({ force: true }).catch(() => {});
  });

  test('drag onto Pinned moves the row — it does not appear in both places', async ({ page }) => {
    await openSpine(page, '/unbox');

    const inTop = topGroup(page).getByRole('button', { name: `Go to ${MEDIA_LIBRARY}` });
    await expect(inTop, 'starts in the top group').toBeVisible();
    await expect(unpinMedia(page), 'starts unpinned').toHaveCount(0);

    await holdDrag(page, inTop, pinnedCluster(page));

    await expect(unpinMedia(page), 'lands on the shelf').toBeVisible({ timeout: 8_000 });
    // The requirement: pinning MOVES the row. A copy left behind would grow the
    // sidebar every time someone pinned something.
    await expect(
      topGroup(page).getByRole('button', { name: `Go to ${MEDIA_LIBRARY}` }),
      'leaves the top group',
    ).toHaveCount(0);
  });

  test('drag a pin back onto the map unpins it and the row returns home', async ({ page }) => {
    await openSpine(page, '/unbox');

    const inTop = topGroup(page).getByRole('button', { name: `Go to ${MEDIA_LIBRARY}` });
    await holdDrag(page, inTop, pinnedCluster(page));
    await expect(unpinMedia(page)).toBeVisible({ timeout: 8_000 });

    // Drag the pin row out over the map. Nav rows are not drop targets, so this
    // lands on the scrollport's return zone (MASTER_NAV_PIN_RETURN_ID).
    const pinRow = pinnedCluster(page)
      .getByRole('button', { name: new RegExp(`^Go to ${MEDIA_LIBRARY}`) })
      .first();
    await holdDrag(page, pinRow, page.getByRole('group', { name: 'Workspaces' }));

    await expect(unpinMedia(page), 'leaves the shelf').toHaveCount(0, { timeout: 8_000 });
    // Home is re-derived from the registry, never stored on the pin — so it
    // cannot come back in the wrong section.
    await expect(
      topGroup(page).getByRole('button', { name: `Go to ${MEDIA_LIBRARY}` }),
      'returns to the top group',
    ).toBeVisible({ timeout: 8_000 });
  });
});
