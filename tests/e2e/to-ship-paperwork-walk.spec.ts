import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * To-ship Labels walk — header CTA left of Sync, stage overlay over the table.
 *
 * Pins the operator placement (Labels · Sync) and the flash bugs:
 * (1) a second `router.replace` from close-shipped-details / fullscreen
 * used to bounce the desk table ↔ walk; (2) `useSurfaceParamHygiene` in
 * the shipping layout strips undeclared keys — `?paperwork=` must stay
 * declared on `/shipping/orders` or the walk opens and closes itself.
 * Labels is a display toggle. Export lives in the Sync dropdown, not the
 * header. The DataTable stays mounted under the overlay (Q5) — do not
 * assert the grid unmounts.
 *
 * Rows are SEEDED ({@link ensureToShipRows}), not assumed. The old
 * `test.skip(rowCount === 0)` guards made an empty queue read as a pass, and a
 * body-swapped walk lived under them for weeks.
 *
 * Run: npx playwright test tests/e2e/to-ship-paperwork-walk.spec.ts --project=qa-desktop
 */

const ROUTE = '/shipping/orders';

const labelsCta = (page: Page) => page.getByTestId('orders-desk-labels');
const walk = (page: Page) => page.getByTestId('paperwork-walk');
const editor = (page: Page) => page.getByTestId('paperwork-editor');
const grid = (page: Page) => page.getByTestId('pending-grid-body');

/**
 * Seed the queue up to `need` rows so the walk assertions RUN.
 *
 * Every test here used to `test.skip(rowCount === 0, 'no To-ship rows')`, so on
 * a dev DB with an empty queue (`/api/orders?status=unshipped` → `count: 0`)
 * the whole file skipped green — which is how the walk shipped for a while
 * unmounting the grid under a spec that asserts it stays. Same door as
 * `add-order-to-ship-pending.spec.ts`: `POST /api/orders/add` writes NOW() on
 * the TEST assignment, so a seeded row lands in the dated head of the
 * deadline-ASC queue rather than the NULL tail.
 */
async function ensureToShipRows(request: APIRequestContext, need: number): Promise<void> {
  const board = await request.get('/api/orders?fulfillmentScope=true&listShape=queue&limit=20');
  expect(board.ok(), `seed probe /api/orders ${board.status()}`).toBeTruthy();
  const payload = (await board.json()) as { orders?: Array<{ id?: number }> };
  const have = new Set(
    (payload.orders ?? []).map((row) => Number(row.id)).filter((id) => Number.isFinite(id) && id > 0),
  ).size;

  for (let i = have; i < need; i += 1) {
    const stamp = `${Date.now().toString(36)}${i}`;
    const key = `e2e-paperwork-${stamp}`;
    const tracking = `CFWALK${stamp}TRACK`;
    const created = await request.post('/api/orders/add', {
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      data: {
        orderId: `CFWALK-${stamp}`,
        productTitle: `Paperwork walk fixture ${stamp}`,
        shippingTrackingNumber: tracking,
        shippingTrackingNumbers: [tracking],
        accountSource: 'Manual',
        typeSlug: 'PO',
        condition: 'USED_B',
        idempotencyKey: key,
      },
    });
    expect(
      created.ok(),
      `seed POST /api/orders/add ${created.status()}: ${await created.text()}`,
    ).toBeTruthy();
  }
}

/** Session probe → seed → desk → grid painted. */
async function openDeskWithRows(page: Page, need: number): Promise<void> {
  const probe = await page.request.get('/api/orders/queue-counts');
  test.skip(!probe.ok(), 'no QA session — run pnpm provision:qa-org');

  await ensureToShipRows(page.request, need);

  await page.goto(ROUTE);
  test.skip(/signin|login|account\/sign/i.test(page.url()), 'no session');
  await expect(grid(page)).toBeVisible({ timeout: 30_000 });
}

/** Distinct row pks painted in the grid. */
async function paintedRowIds(page: Page): Promise<string[]> {
  return page.locator('[data-order-row-id]').evaluateAll((els) => [
    ...new Set(els.map((el) => el.getAttribute('data-order-row-id') ?? '').filter(Boolean)),
  ]);
}

test.describe('To-ship · Labels paperwork walk', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop desk');
  test.skip(({ isMobile }) => !!isMobile, 'desktop desk');

  test('Labels sits immediately left of Sync; Export lives in the Sync menu', async ({ page }) => {
    await openDeskWithRows(page, 1);

    const labels = labelsCta(page);
    const sync = page.getByTestId('orders-desk-add');
    const cluster = page.getByTestId('desk-header-actions');
    await expect(cluster).toBeVisible();
    await expect(labels).toBeVisible();
    await expect(sync).toBeVisible();
    await expect(page.getByTestId('data-table-export')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Export/ })).toHaveCount(0);

    const labelsBox = await labels.boundingBox();
    const syncBox = await sync.boundingBox();
    expect(labelsBox, 'Labels CTA has a box').toBeTruthy();
    expect(syncBox, 'Sync CTA has a box').toBeTruthy();
    expect(labelsBox!.x).toBeLessThan(syncBox!.x);

    await page.getByLabel('More intake methods').click();
    await expect(page.getByRole('menuitem', { name: /Export/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Sync more' })).toBeVisible();
  });

  test('Labels opens the walk and it stays — no table flash', async ({ page }) => {
    await openDeskWithRows(page, 1);
    expect((await paintedRowIds(page)).length, 'seeded To-ship row must paint').toBeGreaterThan(0);

    await labelsCta(page).click();

    await expect(page).toHaveURL(/[?&]paperwork=\d+/);
    await expect(walk(page)).toBeVisible();
    await expect(editor(page)).toBeVisible();
    await expect(grid(page)).toBeVisible();
    // Header cluster stays — fullscreen would unrender Labels left of Sync.
    await expect(labelsCta(page)).toBeVisible();
    await expect(page.getByTestId('orders-desk-add')).toBeVisible();

    const openedId = new URL(page.url()).searchParams.get('paperwork');
    expect(openedId).toBeTruthy();
    // Hygiene is one tick; 1.5s false-passed while the live desk still flashed.
    // Assert the param (hygiene may rewrite query order), not the full URL.
    await expect(async () => {
      expect(new URL(page.url()).searchParams.get('paperwork')).toBe(openedId);
      await expect(walk(page)).toBeVisible();
      await expect(grid(page)).toBeVisible();
    }).toPass({ timeout: 4_000, intervals: [400, 700, 1000] });

    await expect(labelsCta(page)).toHaveAttribute('aria-pressed', 'true');
    await labelsCta(page).click();
    await expect(page).not.toHaveURL(/[?&]paperwork=\d+/);
    await expect(walk(page)).toHaveCount(0);
    await expect(grid(page)).toBeVisible();
    await expect(labelsCta(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('deep-link ?paperwork= survives hygiene and stays on the walk', async ({ page }) => {
    await openDeskWithRows(page, 1);
    const [firstId] = await paintedRowIds(page);
    expect(firstId, 'seeded To-ship row must paint').toBeTruthy();

    await page.goto(`${ROUTE}?paperwork=${firstId}`);
    await expect(walk(page)).toBeVisible({ timeout: 20_000 });
    await expect(async () => {
      expect(new URL(page.url()).searchParams.get('paperwork')).toBe(firstId);
      await expect(walk(page)).toBeVisible();
      await expect(grid(page)).toBeVisible();
    }).toPass({ timeout: 4_000, intervals: [400, 700, 1000] });
  });

  test('Skip / Next advances, Escape returns to the table', async ({ page }) => {
    await openDeskWithRows(page, 2);
    const rowIds = await paintedRowIds(page);
    expect(rowIds.length, 'need two distinct orders to prove advance').toBeGreaterThanOrEqual(2);

    await labelsCta(page).click();
    await expect(page).toHaveURL(/[?&]paperwork=\d+/);
    await expect(walk(page)).toBeVisible({ timeout: 20_000 });
    const firstId = new URL(page.url()).searchParams.get('paperwork');
    expect(firstId).toBeTruthy();

    await expect(page.getByTestId('paperwork-next')).toBeVisible();

    await page.getByTestId('paperwork-next').click();
    await expect(page).not.toHaveURL(
      new RegExp(`[?&]paperwork=${firstId}(?:&|$)`),
    );
    await expect(page).toHaveURL(/[?&]paperwork=\d+/);

    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/[?&]paperwork=\d+/);
    await expect(grid(page)).toBeVisible();
    await expect(walk(page)).toHaveCount(0);
  });

  test('tracking hover Label opens the walk over the table, with carton context', async ({
    page,
  }) => {
    await openDeskWithRows(page, 1);
    expect((await paintedRowIds(page)).length, 'seeded To-ship row must paint').toBeGreaterThan(0);

    const firstRow = page.locator('[data-order-row-id]').first();
    const fulfillment = firstRow.locator('[data-col="fulfillment"]');
    await fulfillment.scrollIntoViewIfNeeded();
    // Order chip is the first hover menu; tracking (or the empty-track dash) is last
    // and owns the Label extra.
    await fulfillment.locator('.group.relative.inline-flex').last().hover();
    const trackingMenu = page.getByRole('menu', { name: 'Tracking actions' });
    await expect(trackingMenu).toBeVisible({ timeout: 8_000 });
    await trackingMenu.getByRole('menuitem', { name: 'Label' }).click();

    await expect(page).toHaveURL(/[?&]paperwork=\d+/);
    await expect(walk(page)).toBeVisible();
    await expect(editor(page)).toBeVisible();
    await expect(grid(page)).toBeVisible();
    await expect(page.getByTestId('label-run-band')).toHaveCount(0);
    await expect(page.getByTestId('carton-context-one-row')).toBeVisible();
    // Headerless walk: exit is the DESK's. `DeskStageOverlay showHeader={false}`
    // paints no ✕ and the identity ring takes no `onExitToList`
    // (PaperworkEditor docblock) — the pressed Labels toggle and Esc are the
    // one on/off. This used to assert a second exit chevron on the ring.
    await expect(page.getByTestId('carton-context-exit')).toHaveCount(0);
    await expect(labelsCta(page)).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Escape');
    await expect(page).not.toHaveURL(/[?&]paperwork=\d+/);
    await expect(walk(page)).toHaveCount(0);
    await expect(grid(page)).toBeVisible();
  });
});
