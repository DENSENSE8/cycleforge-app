/**
 * To Ship · in-warehouse desk — server counts vs painted Band-1 facets.
 *
 * Lifecycle Pending/Tested tabs retired; Band-1 is All · Must ship · Urgent · …
 */

import { test, expect } from '@playwright/test';

const TENANT = process.env.PW_TENANT_SLUG || 'usav';
const STAFF = process.env.PW_STAFF_NAME || 'Michael';

test.use({ storageState: { cookies: [], origins: [] } });

test('To-ship desk: queue-counts vs Band-1 triage chrome', async ({ page, baseURL }) => {
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

  const chrome = page.locator('[data-dashboard-chrome]').first();
  const allTab = await chrome
    .getByRole('button', { name: /^All/ })
    .first()
    .innerText()
    .catch(() => '(no All facet)');
  const mustShipTab = await chrome
    .locator('button', { hasText: /Must ship/i })
    .first()
    .innerText()
    .catch(() => '(no Must ship facet)');

  console.log('\n================ ' + baseURL + ' ================');
  console.log('queue-counts byStage :', JSON.stringify(counts?.byStage));
  console.log('queue-counts mustShip:', counts?.mustShip);
  console.log('queue-counts urgent  :', counts?.urgent);
  console.log('rows request         :', rowsCall?.url);
  console.log('rows returned        :', orders.length);
  console.log('first 8 ids in paint order:', orders.slice(0, 8).map((o: any) => o.id));
  console.log('All facet renders    :', JSON.stringify(allTab));
  console.log('Must ship renders    :', JSON.stringify(mustShipTab));
  console.log('==========================================================\n');

  await expect(chrome.getByRole('button', { name: /^All/ }).first()).toBeVisible();
  await expect(chrome.locator('button', { hasText: /Must ship/i }).first()).toBeVisible();
});
