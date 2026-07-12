import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Order workbench — /o/[orderId] (desktop project).
 *
 * Covers the dedicated order workspace:
 *   1. the expand control in the slide-over header navigates to /o/[id];
 *   2. /o/[id] renders the tabbed workbench (Shipping / Product / Documents /
 *      Timeline / Customer) with editable notes via the action dock;
 *   3. the order sidebar Recent list records visits and can switch orders;
 *   4. an FBA order id routes to the FBA workspace instead of dead-ending;
 *   5. editing a note persists (save via the notes composer).
 *
 * Env:
 *   PW_FULLPAGE_ORDER_ID – non-FBA order id to drive (default 2902)
 *   PW_FULLPAGE_ORDER_ID_B – second order for recent-list switching (optional)
 *   PW_FBA_ORDER_ID      – a known FBA order id; when unset, the FBA test skips
 */

const ORDER_ID = Number(
  process.env.PW_FULLPAGE_ORDER_ID || process.env.PW_TRACKING_ORDER_ID || '2902',
);
const ORDER_ID_B = process.env.PW_FULLPAGE_ORDER_ID_B
  ? Number(process.env.PW_FULLPAGE_ORDER_ID_B)
  : null;
const FBA_ORDER_ID = process.env.PW_FBA_ORDER_ID ? Number(process.env.PW_FBA_ORDER_ID) : null;

const isMobile = () => test.info().project.name === 'mobile';

/** The order's notes straight from the DB via the API (same source the page reads). */
async function readNotes(request: APIRequestContext, id: number): Promise<string> {
  const res = await request.get(`/api/orders?orderId=${id}&includeShipped=true`);
  expect(res.ok(), `orders read failed (${res.status()})`).toBeTruthy();
  const json = JSON.parse(await res.text());
  return String(json.orders?.[0]?.notes ?? '');
}

test.describe('Order workbench (/o/[id])', () => {
  test('expand control in the shipped slide-over opens the order workbench', async ({ page }) => {
    test.skip(isMobile(), 'desktop full-page flow');

    await page.goto(`/dashboard?shipped&openOrderId=${ORDER_ID}`);

    const expand = page.getByRole('button', { name: 'Open full order page' }).first();
    await expand.waitFor({ state: 'visible', timeout: 25_000 });
    await expand.click();

    await expect(page).toHaveURL(new RegExp(`/o/${ORDER_ID}(?:[/?#]|$)`), { timeout: 15_000 });
    // Workbench header tabs are present (not the not-found state).
    await expect(page.getByRole('tab', { name: 'Shipping' })).toBeVisible({ timeout: 20_000 });
  });

  test('renders the tabbed workbench with shipping selected by default', async ({ page }) => {
    test.skip(isMobile(), 'desktop full-page flow');

    await page.goto(`/o/${ORDER_ID}`);

    await expect(page.getByRole('tab', { name: 'Shipping' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('tab', { name: 'Product' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Documents' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Timeline' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Customer' })).toBeVisible();

    // Order workspace sidebar Recent mode is mounted.
    await expect(page.getByRole('list', { name: 'Recently opened orders' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('condition grade is locked (not selectable) on a shipped order', async ({ page }) => {
    test.skip(isMobile(), 'desktop full-page flow');

    await page.goto(`/o/${ORDER_ID}`);
    await page.getByRole('tab', { name: 'Product' }).click();

    // Fixture 2902 is delivered → the grade renders as a single locked badge,
    // never the interactive 7-pill radiogroup. (Assumes a shipped fixture.)
    await expect(
      page.getByRole('group', { name: /condition grade \(locked after shipping\)/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('radiogroup', { name: /condition grade/i })).toHaveCount(0);
  });

  test('recent sidebar lists visited orders and can switch the detail', async ({ page }) => {
    test.skip(isMobile(), 'desktop full-page flow');
    test.skip(!ORDER_ID_B || ORDER_ID_B === ORDER_ID, 'set PW_FULLPAGE_ORDER_ID_B to a second order id');

    await page.goto(`/o/${ORDER_ID}`);
    await expect(page.getByRole('tab', { name: 'Shipping' })).toBeVisible({ timeout: 20_000 });

    await page.goto(`/o/${ORDER_ID_B}`);
    await expect(page.getByRole('tab', { name: 'Shipping' })).toBeVisible({ timeout: 20_000 });

    const recentList = page.getByRole('list', { name: 'Recently opened orders' });
    await expect(recentList).toBeVisible();
    // Both visits should appear (labels use Order #id shortening).
    await expect(recentList.getByRole('button').filter({ hasText: String(ORDER_ID_B) }).first()).toBeVisible();
    await expect(recentList.getByRole('button').filter({ hasText: String(ORDER_ID) }).first()).toBeVisible();

    await recentList.getByRole('button').filter({ hasText: String(ORDER_ID) }).first().click();
    await expect(page).toHaveURL(new RegExp(`/o/${ORDER_ID}(?:[/?#]|$)`), { timeout: 15_000 });
  });

  test('an FBA order routes to the FBA workspace instead of 404', async ({ page }) => {
    test.skip(isMobile(), 'desktop full-page flow');
    test.skip(!FBA_ORDER_ID, 'set PW_FBA_ORDER_ID to a known FBA order id to run');

    await page.goto(`/o/${FBA_ORDER_ID}`);

    await expect(page.getByText('This is an Amazon FBA shipment')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Open FBA workspace' })).toBeVisible();
  });

  test('editing a note on the workbench persists via the notes composer', async ({
    page,
    request,
  }) => {
    test.skip(isMobile(), 'desktop full-page flow');

    const original = await readNotes(request, ORDER_ID);
    const demo = `E2E-NOTE-${Date.now()}`;

    try {
      await page.goto(`/o/${ORDER_ID}`);
      await expect(page.getByRole('tab', { name: 'Shipping' })).toBeVisible({ timeout: 20_000 });

      // Open the notes editor from the header action bar.
      await page.getByRole('button', { name: /^Notes$/i }).first().click();

      const notesBox = page.getByPlaceholder('Add a note for this order');
      await notesBox.waitFor({ state: 'visible', timeout: 10_000 });
      await notesBox.fill(demo);
      await page.getByRole('button', { name: 'Save note' }).click();

      await expect
        .poll(() => readNotes(request, ORDER_ID), { timeout: 15_000 })
        .toBe(demo);
    } finally {
      await request
        .patch(`/api/orders/${ORDER_ID}`, { data: { notes: original || null } })
        .catch(() => {});
    }
  });
});
