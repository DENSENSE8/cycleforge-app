/**
 * To Ship · Pending — dev vs prod parity probe.
 *
 * Same Neon database backs both (`/api/auth/staff-picker` returns an identical
 * roster), so any difference in the Pending lane is CODE or CLIENT CACHE, never
 * data. This drives the real board on whichever host `PW_BASE_URL` names and
 * prints, side by side:
 *   - the server truth (`/api/orders/queue-counts` → lane totals)
 *   - what the Pending tab badge actually renders
 *   - how many rows the table paints, and the first ids in paint order
 *
 * Run against dev:   npx playwright test tests/e2e/toship-pending-parity.spec.ts --project=desktop
 * Run against prod:  PW_BASE_URL=https://usav-dev.michaelgarisek.com npx playwright test tests/e2e/toship-pending-parity.spec.ts --project=desktop
 */

import { test, expect } from '@playwright/test';

const TENANT = process.env.PW_TENANT_SLUG || 'usav';
const STAFF = process.env.PW_STAFF_NAME || 'Michael';

test.use({ storageState: { cookies: [], origins: [] } });

test('Pending lane: server counts vs painted board', async ({ page, baseURL }) => {
  // Mint a session in THIS context (works on dev and prod alike — pinless
  // station sign-in), so neither run depends on a stored cookie jar.
  const picker = await page.request.get('/api/auth/staff-picker', {
    headers: { 'x-tenant-slug': TENANT },
  });
  expect(picker.ok(), 'staff-picker reachable').toBeTruthy();
  const roster = (await picker.json()).staff as { id: number; name: string }[];
  const staff = roster.find((s) => s.name.toLowerCase().startsWith(STAFF.toLowerCase())) ?? roster[0];
  const signin = await page.request.post('/api/auth/signin', {
    headers: { 'x-tenant-slug': TENANT },
    data: { staffId: staff.id, deviceKind: 'personal' },
  });
  expect(signin.ok(), `signin as ${staff.name}`).toBeTruthy();

  const seen: { url: string; body: any }[] = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (!/\/api\/orders(\?|\/queue-counts)/.test(u)) return;
    seen.push({ url: u.replace(baseURL ?? '', ''), body: await r.json().catch(() => null) });
  });

  await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main')).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(8_000);

  const counts = seen.find((s) => s.url.includes('queue-counts'))?.body;
  const rowsCall = seen.find((s) => s.url.includes('/api/orders?'));
  const orders = rowsCall?.body?.orders ?? [];

  // What the tab strip actually renders.
  const tabText = await page
    .locator('button', { hasText: /^Pending/ })
    .first()
    .innerText()
    .catch(() => '(no Pending tab)');
  const testedTab = await page
    .locator('button', { hasText: /^Tested/ })
    .first()
    .innerText()
    .catch(() => '(no Tested tab)');

  console.log('\n================ ' + baseURL + ' ================');
  console.log('queue-counts byStage :', JSON.stringify(counts?.byStage));
  console.log('queue-counts combos  :', JSON.stringify(counts?.combos));
  console.log('rows request         :', rowsCall?.url);
  console.log('rows returned        :', orders.length);
  console.log('first 8 ids in paint order:', orders.slice(0, 8).map((o: any) => o.id));
  console.log('Pending tab renders  :', JSON.stringify(tabText));
  console.log('Tested  tab renders  :', JSON.stringify(testedTab));
  console.log('==========================================================\n');
});
