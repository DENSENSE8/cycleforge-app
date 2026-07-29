import { test, expect } from '@playwright/test';

/**
 * AUDIT — the third station: PACK.
 *
 * Takes an order that has already been tested (has a serial + shipment link)
 * and drives it through the pack station, recording what the operator sees and
 * what actually persists.
 */

test('Pack station — drive a tested order through packing', async ({ page, request }) => {
  const consoleErrors: string[] = [];
  const apiErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) {
      apiErrors.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`);
    }
  });

  // Find an order that already carries a serial (tested) — the pack queue's SoT.
  const listRes = await request.get('/api/orders?status=unassigned&limit=40');
  const list = await listRes.json();
  const rows: any[] = list.orders ?? list.data ?? list.rows ?? [];

  let target: any = null;
  for (const o of rows) {
    if (!o.shipment_id) continue;
    const d = await (await request.get(`/api/orders/lookup/${encodeURIComponent(o.order_id)}`)).json();
    if ((d?.order?.serials ?? []).length > 0) {
      target = { ...o, detail: d.order };
      break;
    }
  }
  expect(target, 'need a tested order (with a serial) to pack').toBeTruthy();

  const tracking: string = target.shipping_tracking_number || target.detail.tracking_numbers[0];
  console.log(`\n===== PACK TARGET =====`);
  console.log(JSON.stringify({
    order_id: target.order_id,
    tracking,
    serials: target.detail.serials,
    status: target.detail.status,
    packer_id: target.detail.packer_id,
  }, null, 2));

  await page.goto('/pack');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'test-results/audit-pack-01-queue.png', fullPage: true });

  // Is the tested order visible in the ready-to-pack queue?
  const visible = await page.getByText(target.order_id, { exact: false }).count();
  console.log(`\n===== "${target.order_id}" visible in pack queue: ${visible} =====`);

  // Drive the pack station scan bar.
  const scanBar = page
    .locator('input[placeholder*="can" i], input[type="search"], input[type="text"]')
    .first();

  if (await scanBar.count()) {
    await expect(scanBar).toBeVisible({ timeout: 15_000 });
    const packRes = page
      .waitForResponse((r) => /\/api\/(packerlogs|orders\/lookup|tech\/scan)/.test(r.url()), { timeout: 20_000 })
      .catch(() => null);
    await scanBar.click();
    await scanBar.fill(tracking);
    await scanBar.press('Enter');
    const pr = await packRes;
    if (pr) {
      console.log(`\n===== pack scan → ${pr.status()} ${pr.url().replace(/^https?:\/\/[^/]+/, '')} =====`);
      console.log(JSON.stringify(await pr.json().catch(() => ({})), null, 2).slice(0, 1500));
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'test-results/audit-pack-02-after-scan.png', fullPage: true });
  } else {
    console.log('\n===== NO SCAN INPUT FOUND ON /pack =====');
  }

  // What does the operator have available to complete the pack?
  const actions = await page
    .getByRole('button')
    .evaluateAll((els) => els.map((e) => (e.textContent || '').trim()).filter((t) => t.length > 0 && t.length < 40));
  console.log('\n===== PACK STATION ACTION INVENTORY =====\n' + JSON.stringify(Array.from(new Set(actions)), null, 2));

  const after = await (await request.get(`/api/orders/lookup/${encodeURIComponent(target.order_id)}`)).json();
  console.log('\n===== ORDER AFTER PACK ATTEMPT =====');
  console.log(JSON.stringify({
    status: after?.order?.status,
    packer_id: after?.order?.packer_id,
    serials: after?.order?.serials,
  }, null, 2));

  console.log('\n===== DIAGNOSTICS: pack =====');
  console.log('console errors:', JSON.stringify(Array.from(new Set(consoleErrors)).slice(0, 10), null, 2));
  console.log('api >=400:', JSON.stringify(Array.from(new Set(apiErrors)).slice(0, 10), null, 2));
});
