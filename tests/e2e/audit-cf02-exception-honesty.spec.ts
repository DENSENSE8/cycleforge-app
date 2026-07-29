import { test, expect } from '@playwright/test';

/**
 * CF-02 regression gate — an unmatched tracking scan must NOT read as success.
 *
 * Before the 2026-07-28 fix the station rendered a green "Active" chip,
 * "1/1 · complete", and "N units paired" for a scan whose tracking matched no
 * order, so the serial that followed was written to an orphaned exception while
 * the operator was told the work was done.
 */

const STAMP = process.env.AUDIT_STAMP || String(Date.now()).slice(-9);
// USPS-shaped, deliberately not in the system.
const UNKNOWN_TRACKING = `9400111899223${STAMP}`;
const SERIAL = `SNORPHAN${STAMP}`;

test('unmatched scan renders as an exception, never as complete', async ({ page }) => {
  await page.goto('/test');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2500);

  const scanBar = page
    .locator('input[placeholder*="can" i], input[type="search"], input[type="text"]')
    .first();
  await expect(scanBar).toBeVisible({ timeout: 20_000 });

  // Scan 1 — a tracking number that matches no order.
  const scanRes = page.waitForResponse((r) => r.url().includes('/api/tech/scan'), { timeout: 25_000 });
  await scanBar.click();
  await scanBar.fill(UNKNOWN_TRACKING);
  await scanBar.press('Enter');
  const sj = await (await scanRes).json().catch(() => ({} as any));
  console.log(`\n===== /api/tech/scan orderFound: ${sj.orderFound} =====`);
  expect(sj.orderFound, 'this tracking must not match an order').toBe(false);

  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/cf02-01-unmatched-scan.png', fullPage: true });

  // Scan 2 — a serial. The API must say where it landed.
  const serialRes = page.waitForResponse((r) => /\/api\/tech\/(serial|add-serial)/.test(r.url()), {
    timeout: 25_000,
  });
  await scanBar.click();
  await scanBar.fill(SERIAL);
  await scanBar.press('Enter');
  const body = await (await serialRes).json().catch(() => ({} as any));
  console.log('\n===== serial-attach response =====\n' + JSON.stringify(body, null, 2));

  // API honesty — the response must distinguish an order attach from an exception hold.
  expect(body.attachedToOrder, 'API must report the serial did NOT attach to an order').toBe(false);
  expect(body.ordersExceptionId, 'API must name the exception it landed on').toBeTruthy();
  expect(String(body.warning || ''), 'API must carry a warning').toMatch(/exception/i);

  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'test-results/cf02-02-after-orphan-serial.png', fullPage: true });

  // UI honesty — the three false-success signals must be gone.
  const card = page.locator('body');
  await expect(card, 'must not claim completion').not.toContainText('· complete');
  await expect(card, 'must not claim units were paired to an order').not.toContainText(/units? paired/i);

  // …and the honest signals must be present.
  await expect(page.getByText('No order', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/no order matched/i).first()).toBeVisible();
});
