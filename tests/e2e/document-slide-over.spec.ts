import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Document slide-over — Labels Print tab + Ecwid packing-slip fetch.
 *
 * Env:
 *   PW_TEST_ORDER_ID – any order with documents (fallback)
 *   PW_TEST_ECWID_ORDER_ID – Ecwid-sourced order for live invoice-pdf fetch
 */

async function resolveOrderId(
  request: APIRequestContext,
  preferEcwid: boolean,
): Promise<number | null> {
  if (preferEcwid) {
    const envEcwid = Number(process.env.PW_TEST_ECWID_ORDER_ID?.trim());
    if (Number.isFinite(envEcwid) && envEcwid > 0) {
      const res = await request.get(`/api/orders/${envEcwid}`);
      if (res.ok()) return envEcwid;
    }
  }

  const envRaw = process.env.PW_TEST_ORDER_ID?.trim();
  const candidates = [envRaw ? Number(envRaw) : NaN, 6071, 6070].filter(
    (n) => Number.isFinite(n) && n > 0,
  );

  for (const id of candidates) {
    const res = await request.get(`/api/orders/${id}`);
    if (res.ok()) return id;
  }

  const listRes = await request.get('/api/orders?limit=5&includeShipped=true');
  if (!listRes.ok()) return null;
  const json = await listRes.json();
  const orders = Array.isArray(json.orders) ? json.orders : [];

  if (preferEcwid) {
    const ecwid = orders.find((o: { account_source?: string }) =>
      String(o.account_source ?? '')
        .toLowerCase()
        .includes('ecwid'),
    );
    const id = Number(ecwid?.id);
    if (Number.isFinite(id) && id > 0) return id;
  }

  const id = Number(orders[0]?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

test.describe('Document slide-over', () => {
  test('Labels Print opens resizable document slide-over with both types', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'Desktop Labels workspace');

    const orderId = await resolveOrderId(page.request, false);
    test.skip(orderId == null, 'No test order — set PW_TEST_ORDER_ID');

    await page.goto(`/shipping?open=${orderId}`);
    await expect(page.getByRole('tab', { name: /Print/i }).or(page.getByText('Print', { exact: true })).first()).toBeVisible({
      timeout: 20_000,
    });

    // Print is the default tab — View documents trigger replaces the old two-column panes.
    const openBtn = page.getByTestId('open-document-slide-over');
    await expect(openBtn).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Shipping Label').first()).toBeVisible();
    await expect(page.getByText('Packing Slip').first()).toBeVisible();
    await expect(page.locator('iframe[title="Shipping Label"]')).toHaveCount(0);

    await openBtn.click();
    const dialog = page.getByRole('dialog', { name: /Outbound document preview|Documents/i });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('document-slide-over-resize')).toBeVisible();
    // Type switcher lists every outbound document type.
    await expect(dialog.getByRole('button', { name: /Shipping Label/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Packing Slip/i })).toBeVisible();
  });

  test('POST documents/fetch packing_slip for Ecwid order hits marketplace path', async ({
    request,
  }) => {
    test.skip(test.info().project.name === 'mobile', 'API test — desktop project');

    const orderId = await resolveOrderId(request, true);
    test.skip(
      orderId == null,
      'No Ecwid test order — set PW_TEST_ECWID_ORDER_ID or ensure an Ecwid order exists',
    );

    const orderRes = await request.get(`/api/orders/${orderId}`);
    expect(orderRes.ok()).toBeTruthy();
    const order = await orderRes.json();
    const source = String(order.account_source ?? order.order?.account_source ?? '').toLowerCase();
    test.skip(!source.includes('ecwid'), `Order ${orderId} is not Ecwid-sourced (${source || 'empty'})`);

    const fetchRes = await request.post(`/api/orders/${orderId}/documents/fetch`, {
      data: { types: ['packing_slip'] },
    });
    expect(fetchRes.ok(), `fetch failed with ${fetchRes.status()}`).toBeTruthy();
    const body = await fetchRes.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.fetched)).toBe(true);
    expect(Array.isArray(body.failed)).toBe(true);

    const slip =
      body.fetched.find((d: { documentType: string }) => d.documentType === 'packing_slip') ??
      null;

    if (slip) {
      expect(slip.id).toBeGreaterThan(0);
      const contentRes = await request.get(`/api/documents/${slip.id}/content`);
      expect(contentRes.ok(), `content GET ${contentRes.status()}`).toBeTruthy();
      const ctype = contentRes.headers()['content-type'] ?? '';
      expect(ctype.includes('pdf') || ctype.includes('octet-stream') || ctype.includes('image')).toBeTruthy();

      // Idempotent re-fetch should not create a second primary failure for the same source.
      const again = await request.post(`/api/orders/${orderId}/documents/fetch`, {
        data: { types: ['packing_slip'] },
      });
      expect(again.ok()).toBeTruthy();
    } else {
      // Ecwid credentials missing or invoice unavailable — still assert structured failure.
      const fail = body.failed.find((f: { type: string }) => f.type === 'packing_slip');
      expect(fail, 'expected packing_slip in fetched or failed').toBeDefined();
      expect(String(fail.error || '').length).toBeGreaterThan(0);
    }
  });
});
