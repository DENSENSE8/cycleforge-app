import { test, expect, type Page } from '@playwright/test';

/**
 * To-ship Labels walk — header CTA left of Sync, table XOR rail+editor.
 *
 * Pins the operator placement (Labels · Sync) and the flash bugs:
 * (1) a second `router.replace` from close-shipped-details / fullscreen
 * used to bounce the desk table ↔ walk; (2) `useSurfaceParamHygiene` in
 * the shipping layout strips undeclared keys — `?paperwork=` must stay
 * declared on `/shipping/orders` or the walk opens and closes itself.
 * Labels is a display toggle. Export lives in the Sync dropdown, not the
 * header.
 *
 * Run: npx playwright test tests/e2e/to-ship-paperwork-walk.spec.ts --project=qa-desktop
 */

const ROUTE = '/shipping/orders';

const labelsCta = (page: Page) => page.getByTestId('orders-desk-labels');
const walk = (page: Page) => page.getByTestId('paperwork-walk');
const editor = (page: Page) => page.getByTestId('paperwork-editor');
const grid = (page: Page) => page.getByTestId('pending-grid-body');

test.describe('To-ship · Labels paperwork walk', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop desk');
  test.skip(({ isMobile }) => !!isMobile, 'desktop desk');

  test('Labels sits immediately left of Sync; Export lives in the Sync menu', async ({ page }) => {
    const probe = await page.request.get('/api/orders/queue-counts');
    test.skip(!probe.ok(), 'no session — run pnpm provision:qa-org');

    await page.goto(ROUTE);
    test.skip(/signin|login|account\/sign/i.test(page.url()), 'no session');
    await expect(grid(page)).toBeVisible({ timeout: 30_000 });

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
    const probe = await page.request.get('/api/orders/queue-counts');
    test.skip(!probe.ok(), 'no session');

    await page.goto(ROUTE);
    test.skip(/signin|login|account\/sign/i.test(page.url()), 'no session');
    await expect(grid(page)).toBeVisible({ timeout: 30_000 });

    const rowCount = await page.locator('[data-order-row-id]').count();
    test.skip(rowCount === 0, 'no To-ship rows to walk');

    await labelsCta(page).click();

    await expect(page).toHaveURL(/[?&]paperwork=\d+/);
    await expect(walk(page)).toBeVisible();
    await expect(editor(page)).toBeVisible();
    await expect(grid(page)).toHaveCount(0);
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
      await expect(grid(page)).toHaveCount(0);
    }).toPass({ timeout: 4_000, intervals: [400, 700, 1000] });

    await expect(labelsCta(page)).toHaveAttribute('aria-pressed', 'true');
    await labelsCta(page).click();
    await expect(page).not.toHaveURL(/[?&]paperwork=\d+/);
    await expect(walk(page)).toHaveCount(0);
    await expect(grid(page)).toBeVisible();
    await expect(labelsCta(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('deep-link ?paperwork= survives hygiene and stays on the walk', async ({ page }) => {
    const probe = await page.request.get('/api/orders/queue-counts');
    test.skip(!probe.ok(), 'no session');

    await page.goto(ROUTE);
    test.skip(/signin|login|account\/sign/i.test(page.url()), 'no session');
    await expect(grid(page)).toBeVisible({ timeout: 30_000 });
    const firstId = await page.locator('[data-order-row-id]').first().getAttribute('data-order-row-id');
    test.skip(!firstId, 'no To-ship rows to walk');

    await page.goto(`${ROUTE}?paperwork=${firstId}`);
    await expect(walk(page)).toBeVisible({ timeout: 20_000 });
    await expect(async () => {
      expect(new URL(page.url()).searchParams.get('paperwork')).toBe(firstId);
      await expect(walk(page)).toBeVisible();
      await expect(grid(page)).toHaveCount(0);
    }).toPass({ timeout: 4_000, intervals: [400, 700, 1000] });
  });

  test('Skip / Next advances, Escape returns to the table', async ({ page }) => {
    const probe = await page.request.get('/api/orders/queue-counts');
    test.skip(!probe.ok(), 'no session');

    await page.goto(ROUTE);
    test.skip(/signin|login|account\/sign/i.test(page.url()), 'no session');
    await expect(grid(page)).toBeVisible({ timeout: 30_000 });
    const rowIds = await page.locator('[data-order-row-id]').evaluateAll((els) => [
      ...new Set(els.map((el) => el.getAttribute('data-order-row-id')).filter(Boolean)),
    ]);
    test.skip(rowIds.length < 2, 'need two distinct orders to prove advance');

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
});
