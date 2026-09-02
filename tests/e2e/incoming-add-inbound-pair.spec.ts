import { test, expect } from '@playwright/test';
import { QA_FIXTURE_ZOHO_ITEM } from '@/lib/tenancy/qa-org';

/**
 * Manual Add purchase order → lands on Incoming via confirm-po.
 *
 * The operator path is intentionally minimal: one CTA click, order + item
 * entry, then Enter. Exact SKUs still receive the existing server-side Zoho
 * catalog resolution.
 *
 * QA org only (global-setup handles auth). Never assert against the dogfood tenant.
 */
test.describe('Add purchase order → Incoming', () => {
  test('manual Amazon purchase confirms and lands on Incoming', async ({ page }) => {
    await page.addInitScript(() => {
      (window as Window & { __qaClickCount?: number }).__qaClickCount = 0;
      document.addEventListener('click', () => {
        const state = window as Window & { __qaClickCount?: number };
        state.__qaClickCount = (state.__qaClickCount ?? 0) + 1;
      });
    });

    const listReq = page.waitForRequest(
      (r) => /\/api\/receiving-lines(\?|$)/.test(r.url()) && r.method() === 'GET',
    );
    await page.goto('/incoming');
    await listReq;

    await page.getByTestId('incoming-add-purchase-order').click();
    const form = page.getByTestId('add-inbound-form');
    await expect(form).toBeVisible({ timeout: 15_000 });

    const orderId = `QAADD-${Date.now()}`;
    const last8 = orderId.slice(-8);

    await form.getByLabel('Amazon order #').fill(orderId);
    await form.getByLabel('SKU or item name').fill(QA_FIXTURE_ZOHO_ITEM.sku);

    const importReq = page.waitForRequest(
      (r) =>
        /\/api\/receiving\/inbound\/import-purchase/.test(r.url()) && r.method() === 'POST',
    );
    const importResp = page.waitForResponse((r) =>
      /\/api\/receiving\/inbound\/import-purchase/.test(r.url()),
    );
    await form.getByLabel('SKU or item name').press('Enter');

    const req = await importReq;
    expect(req.postDataJSON()).toMatchObject({
      source_platform: 'amazon',
      receiving_type: 'PO',
      order_id: orderId,
      sku: QA_FIXTURE_ZOHO_ITEM.sku,
      item_name: QA_FIXTURE_ZOHO_ITEM.sku,
      quantity: 1,
    });

    const resp = await importResp;
    expect(resp.ok()).toBeTruthy();
    const body = (await resp.json()) as { success?: boolean };
    expect(body.success).toBe(true);

    await page.waitForResponse((r) => /\/api\/receiving-lines(\?|$)/.test(r.url()));
    await expect(page.getByRole('button', { name: last8, exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const clickCount = await page.evaluate(
      () => (window as Window & { __qaClickCount?: number }).__qaClickCount ?? 0,
    );
    expect(clickCount).toBe(1);
  });
});
