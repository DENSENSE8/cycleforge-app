import { test, expect } from '@playwright/test';
import { QA_FIXTURE_ZOHO_ITEM } from '@/lib/tenancy/qa-org';

/**
 * Manual Add purchase order → lands on Incoming via confirm-po.
 *
 * Replaces the old right-rail "Add return + Zoho pair" path. Purchase intake
 * now uses the inline band: free-text SKU/title (catalog pairing for returns
 * stays on CSV / legacy overlay when re-mounted).
 *
 * QA org only (global-setup handles auth). Never assert against the dogfood tenant.
 */
test.describe('Add purchase order → Incoming', () => {
  test('manual Amazon purchase confirms and lands on Incoming', async ({ page }) => {
    const listReq = page.waitForRequest(
      (r) => /\/api\/receiving-lines(\?|$)/.test(r.url()) && r.method() === 'GET',
    );
    await page.goto('/incoming');
    await listReq;

    await page.getByTestId('incoming-add-purchase-order').click();
    const band = page.getByTestId('incoming-po-intake-band');
    await expect(band).toBeVisible({ timeout: 15_000 });

    const orderId = `QAADD-${Date.now()}`;
    const last8 = orderId.slice(-8);
    const tracking = `QATRK${Date.now()}`;

    await band.getByLabel('Order / PO #').fill(orderId);
    await band.getByLabel('Tracking').fill(tracking);
    await band.getByLabel('SKU').first().fill(QA_FIXTURE_ZOHO_ITEM.sku);
    await band.getByLabel('Title').first().fill(QA_FIXTURE_ZOHO_ITEM.title);
    await band.getByLabel('Qty').first().fill('1');

    const confirmReq = page.waitForRequest(
      (r) =>
        /\/api\/receiving\/inbound\/confirm-po/.test(r.url()) && r.method() === 'POST',
    );
    const confirmResp = page.waitForResponse((r) =>
      /\/api\/receiving\/inbound\/confirm-po/.test(r.url()),
    );
    await band.getByTestId('po-intake-confirm').click();

    const req = await confirmReq;
    expect(req.postDataJSON()).toMatchObject({
      platform: 'amazon',
      order_id: orderId,
      tracking_number: tracking,
      lines: [
        expect.objectContaining({
          sku: QA_FIXTURE_ZOHO_ITEM.sku,
          item_name: QA_FIXTURE_ZOHO_ITEM.title,
          quantity: '1',
        }),
      ],
    });

    const resp = await confirmResp;
    expect(resp.ok()).toBeTruthy();
    const body = (await resp.json()) as { success?: boolean };
    expect(body.success).toBe(true);

    await page.waitForResponse((r) => /\/api\/receiving-lines(\?|$)/.test(r.url()));
    const myRow = page
      .locator('[data-line-row-id]')
      .filter({ has: page.locator('[data-col="order"]', { hasText: last8 }) });
    await expect(myRow.first()).toBeVisible({ timeout: 15_000 });
  });
});
