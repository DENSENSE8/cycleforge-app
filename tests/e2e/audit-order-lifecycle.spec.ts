import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * AUDIT SPEC — full outbound order lifecycle, driven the way a real operator would:
 *
 *   1. Manually enter a new order              (/dashboard?new=true → Add Order)
 *   2. Verify what actually persisted           (GET /api/orders/lookup/:orderId)
 *   3. Attach a serial at the Testing station   (/test scan bar → tracking → serial)
 *   4. Pack the order                           (/pack queue)
 *
 * This is an AUDIT harness, not a regression gate: each step records what the UI
 * actually did (console errors, failed requests, resulting persisted state) so the
 * report cites observed behavior rather than code reading.
 */

const STAMP = process.env.AUDIT_STAMP || String(Date.now()).slice(-9);
const ORDER_ID = `AUDIT-${STAMP}`;
const SERIAL = `SNAUDIT${STAMP}`;
// A real USPS-shaped tracking number so carrier classification recognises it.
const TRACKING = `9400111899223${STAMP}`;
const PRODUCT = `Audit Test Widget ${STAMP}`;
const SKU = `AUDITSKU${STAMP}`;

type Diag = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  serverErrors: string[];
};

function attachDiagnostics(page: Page): Diag {
  const diag: Diag = { consoleErrors: [], pageErrors: [], failedRequests: [], serverErrors: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') diag.consoleErrors.push(m.text().slice(0, 250));
  });
  page.on('pageerror', (e) => diag.pageErrors.push(String(e).slice(0, 250)));
  page.on('requestfailed', (r) =>
    diag.failedRequests.push(`${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')} — ${r.failure()?.errorText}`),
  );
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().includes('/api/')) {
      diag.serverErrors.push(`${r.status()} ${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`);
    }
  });
  return diag;
}

function report(label: string, diag: Diag) {
  const lines: string[] = [`\n===== DIAGNOSTICS: ${label} =====`];
  const push = (name: string, arr: string[]) => {
    const uniq = Array.from(new Set(arr));
    if (uniq.length) lines.push(`${name} (${uniq.length}):`, ...uniq.slice(0, 12).map((s) => `  · ${s}`));
  };
  push('CONSOLE ERRORS', diag.consoleErrors);
  push('PAGE ERRORS', diag.pageErrors);
  push('FAILED REQUESTS', diag.failedRequests);
  push('API >=400', diag.serverErrors);
  if (lines.length === 1) lines.push('  (clean)');
  console.log(lines.join('\n'));
}

/** Fill a house TextField by its visible label. */
async function fillByLabel(page: Page, label: string | RegExp, value: string) {
  const field = page.getByLabel(label).first();
  await field.waitFor({ state: 'visible', timeout: 10_000 });
  await field.fill(value);
}

async function lookupOrder(request: APIRequestContext, orderId: string) {
  const res = await request.get(`/api/orders/lookup/${encodeURIComponent(orderId)}`);
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

// NOT `mode: 'serial'` — serial skips the remaining tests on the first failure,
// and this audit needs the downstream blast radius of an early failure recorded.
// `workers: 1` + `fullyParallel: false` already guarantee declaration order.
test.describe.configure({ mode: 'default' });

test.describe('AUDIT · outbound order lifecycle', () => {
  test('Step 1 — manually enter an order, then verify what persisted', async ({ page, request }) => {
    const diag = attachDiagnostics(page);

    await page.goto('/dashboard?new=true');
    await page.waitForLoadState('domcontentloaded');

    const rail = page.getByText('NEW ORDER ENTRY', { exact: false }).first();
    await expect(rail).toBeVisible({ timeout: 25_000 });

    // Mode switcher is role=tablist / role=tab (HorizontalButtonSlider variant="nav").
    await page.getByRole('tab', { name: /Add Order/i }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'test-results/audit-01-add-order-form.png', fullPage: true });

    // ---- Field inventory: what the operator is asked for ----
    const labels = await page
      .locator('label')
      .evaluateAll((els) => els.map((e) => (e.textContent || '').trim()).filter(Boolean));
    console.log('\n===== ADD-ORDER FIELD INVENTORY =====\n' + JSON.stringify(labels, null, 2));

    // ---- Fill every field the form demands ----
    await fillByLabel(page, /Order ID/i, ORDER_ID);
    await fillByLabel(page, /Shipping Tracking Number/i, TRACKING);
    await fillByLabel(page, /Product Title/i, PRODUCT);
    await fillByLabel(page, /SKU/i, SKU);

    // Condition is a required radiogroup — pick a definite grade (not the default).
    const grades = page.getByRole('radiogroup', { name: /Condition grade/i }).first();
    const gradeA = grades.locator('button', { hasText: /^A$/ }).first();
    if (await gradeA.count()) {
      await gradeA.click();
    } else {
      console.log('!! could not locate an explicit condition grade button — leaving default');
    }

    await page.screenshot({ path: 'test-results/audit-02-add-order-filled.png', fullPage: true });

    // ---- Capture the exact request the client sends ----
    const addReq = page.waitForRequest(
      (r) => r.url().includes('/api/orders/add') && r.method() === 'POST',
      { timeout: 20_000 },
    );
    const addRes = page.waitForResponse((r) => r.url().includes('/api/orders/add'), { timeout: 20_000 });

    await page.getByRole('button', { name: /^Add Order$/ }).last().click();

    const req = await addReq;
    const res = await addRes;
    const sentBody = req.postDataJSON();
    console.log('\n===== POST /api/orders/add — CLIENT SENT =====\n' + JSON.stringify(sentBody, null, 2));
    console.log(`\n===== POST /api/orders/add — STATUS ${res.status()} =====`);
    console.log(JSON.stringify(await res.json().catch(() => ({})), null, 2));

    expect(res.status(), 'order creation should succeed').toBe(200);

    // ---- What actually persisted? ----
    const { status, body } = await lookupOrder(request, ORDER_ID);
    console.log(`\n===== GET /api/orders/lookup/${ORDER_ID} — STATUS ${status} =====`);
    console.log(JSON.stringify(body?.order ?? body, null, 2));

    const order = body?.order;
    expect(order, 'created order should be retrievable').toBeTruthy();

    // ---- THE AUDIT ASSERTIONS: did the required fields survive? ----
    const persistedTracking: string[] = order?.tracking_numbers ?? [];
    const persistedCondition = order?.condition;

    console.log('\n===== FIELD SURVIVAL =====');
    console.log(`  sent tracking   : ${sentBody?.shippingTrackingNumber ?? '(not sent)'}`);
    console.log(`  stored tracking : ${JSON.stringify(persistedTracking)}`);
    console.log(`  sent condition  : ${sentBody?.condition ?? '(not sent)'}`);
    console.log(`  stored condition: ${persistedCondition ?? '(null)'}`);

    report('Step 1 — manual order entry', diag);

    // Soft so the downstream cascade (testing → pack) still runs and the audit
    // can document the full blast radius of a dropped tracking number.
    expect.soft(
      persistedTracking,
      `REQUIRED "Shipping Tracking Number" (${TRACKING}) must persist`,
    ).toContain(TRACKING);
    expect.soft(
      persistedCondition,
      'REQUIRED "Condition" must persist',
    ).toBeTruthy();
    expect.soft(
      order?.shipment_id,
      'order must be linked to a shipment so the Testing station can scan it',
    ).toBeTruthy();
  });

  test('Step 2 — attach a serial at the Testing station', async ({ page, request }) => {
    const diag = attachDiagnostics(page);

    await page.goto('/test');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'test-results/audit-03-testing-station.png', fullPage: true });

    // The station scan bar is the focus-locked primary control.
    const scanBar = page
      .locator('input[placeholder*="can" i], input[type="search"], input[type="text"]')
      .first();
    await expect(scanBar, 'testing station must expose a scan input').toBeVisible({ timeout: 20_000 });

    const scanRes = page
      .waitForResponse((r) => r.url().includes('/api/tech/scan'), { timeout: 25_000 })
      .catch(() => null);

    await scanBar.click();
    await scanBar.fill(TRACKING);
    await scanBar.press('Enter');

    const r = await scanRes;
    if (r) {
      const j = await r.json().catch(() => ({}));
      console.log(`\n===== POST /api/tech/scan — STATUS ${r.status()} =====`);
      console.log(JSON.stringify(j, null, 2).slice(0, 3000));
    } else {
      console.log('\n===== /api/tech/scan was never called for the tracking scan =====');
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/audit-04-testing-after-tracking-scan.png', fullPage: true });

    // Second scan: the serial.
    const serialRes = page
      .waitForResponse((r2) => /\/api\/tech\/(serial|add-serial)/.test(r2.url()), { timeout: 25_000 })
      .catch(() => null);

    await scanBar.click();
    await scanBar.fill(SERIAL);
    await scanBar.press('Enter');

    const sr = await serialRes;
    if (sr) {
      console.log(`\n===== serial attach — STATUS ${sr.status()} ${sr.url().replace(/^https?:\/\/[^/]+/, '')} =====`);
      console.log(JSON.stringify(await sr.json().catch(() => ({})), null, 2).slice(0, 2000));
    } else {
      console.log('\n===== no serial-attach request fired =====');
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-results/audit-05-testing-after-serial-scan.png', fullPage: true });

    const { body } = await lookupOrder(request, ORDER_ID);
    console.log('\n===== ORDER AFTER TESTING =====');
    console.log(JSON.stringify({
      status: body?.order?.status,
      serials: body?.order?.serials,
      tracking: body?.order?.tracking_numbers,
      tester_id: body?.order?.tester_id,
    }, null, 2));

    report('Step 2 — testing station', diag);

    expect.soft(body?.order?.serials ?? [], `serial ${SERIAL} should be attached to ${ORDER_ID}`).toContain(SERIAL);
  });

  test('Step 3 — pack the order', async ({ page, request }) => {
    const diag = attachDiagnostics(page);

    await page.goto('/pack');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/audit-06-pack-queue.png', fullPage: true });

    // Is our tested order in the ready-to-pack queue?
    const inQueue = await page.getByText(ORDER_ID, { exact: false }).count();
    console.log(`\n===== ${ORDER_ID} occurrences in pack queue: ${inQueue} =====`);

    const { body } = await lookupOrder(request, ORDER_ID);
    console.log('\n===== ORDER BEFORE PACK =====');
    console.log(JSON.stringify({
      status: body?.order?.status,
      serials: body?.order?.serials,
      packer_id: body?.order?.packer_id,
    }, null, 2));

    report('Step 3 — pack queue', diag);

    expect.soft(inQueue, `tested order ${ORDER_ID} should appear in the ready-to-pack queue`).toBeGreaterThan(0);
  });
});
