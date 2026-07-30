import { test, expect } from '@playwright/test';

/**
 * AUDIT CONTROL — same Testing-station flow, but against a REAL ingested order
 * that already has a shipment/tracking link.
 *
 * Purpose: isolate the defect. If the serial attaches here but not on a
 * manually-entered order, the Testing station is fine and the manual-entry
 * path (`POST /api/orders/add` dropping the tracking number) is the fault.
 */

const SERIAL = `SNCTL${process.env.AUDIT_STAMP || String(Date.now()).slice(-7)}`;

// DIAGNOSTIC mutate against QA org only — sibling smear is gated in CI by
// `order-grain-sql.test.ts` + `tsn-order-grain.guard.test.ts` (order_id prefer).
// Opt in explicitly: AUDIT_MUTATE_REAL_DATA=1 (never dogfood tenant).
test.skip(
  process.env.AUDIT_MUTATE_REAL_DATA !== '1',
  'mutates real order data — set AUDIT_MUTATE_REAL_DATA=1 to run, and clean up after',
);

test('CONTROL — serial attaches to a real order that HAS a tracking link', async ({ page, request }) => {
  // Pick a live unassigned order that has a tracking number + shipment id.
  const listRes = await request.get('/api/orders?status=unassigned&limit=25');
  expect(listRes.ok()).toBeTruthy();
  const list = await listRes.json();
  const rows: any[] = list.orders ?? list.data ?? list.rows ?? [];

  const target = rows.find(
    (o) => o.shipment_id && (o.shipping_tracking_number || o.tracking_numbers?.[0]),
  );
  expect(target, 'need at least one ingested order with tracking as a control').toBeTruthy();

  const orderId: string = target.order_id;
  const tracking: string = target.shipping_tracking_number || target.tracking_numbers[0];
  console.log(`\n===== CONTROL TARGET =====\norder_id=${orderId}  tracking=${tracking}  shipment_id=${target.shipment_id}`);

  const before = await (await request.get(`/api/orders/lookup/${encodeURIComponent(orderId)}`)).json();
  console.log('BEFORE serials:', JSON.stringify(before?.order?.serials ?? []));

  await page.goto('/test');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);

  const scanBar = page
    .locator('input[placeholder*="can" i], input[type="search"], input[type="text"]')
    .first();
  await expect(scanBar).toBeVisible({ timeout: 20_000 });

  // Scan 1 — tracking.
  const scanRes = page.waitForResponse((r) => r.url().includes('/api/tech/scan'), { timeout: 25_000 });
  await scanBar.click();
  await scanBar.fill(tracking);
  await scanBar.press('Enter');
  const sres = await scanRes;
  const sjson = await sres.json().catch(() => ({}));
  console.log(`\n===== CONTROL /api/tech/scan — ${sres.status()} =====`);
  console.log(JSON.stringify({
    orderFound: sjson.orderFound,
    warning: sjson.warning,
    salId: sjson.salId,
    orderId: sjson.order?.orderId,
  }, null, 2));

  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/audit-control-01-tracking-scan.png', fullPage: true });

  // Scan 2 — serial.
  const serialRes = page.waitForResponse((r) => /\/api\/tech\/(serial|add-serial)/.test(r.url()), {
    timeout: 25_000,
  });
  await scanBar.click();
  await scanBar.fill(SERIAL);
  await scanBar.press('Enter');
  const ser = await serialRes;
  console.log(`\n===== CONTROL serial attach — ${ser.status()} =====`);
  console.log(JSON.stringify(await ser.json().catch(() => ({})), null, 2));

  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/audit-control-02-serial-scan.png', fullPage: true });

  const after = await (await request.get(`/api/orders/lookup/${encodeURIComponent(orderId)}`)).json();
  console.log('\n===== CONTROL ORDER AFTER =====');
  console.log(JSON.stringify({
    status: after?.order?.status,
    serials: after?.order?.serials,
    tester_id: after?.order?.tester_id,
  }, null, 2));

  expect(
    after?.order?.serials ?? [],
    `CONTROL: serial ${SERIAL} must attach to real order ${orderId}`,
  ).toContain(SERIAL);
});
