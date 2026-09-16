/** Throwaway: zoom a child row's order cell for face read. */
import { chromium } from '@playwright/test';
const BASE = 'http://localhost:3077';
const ctx = await chromium.launch({ headless: true, executablePath: '/usr/bin/chromium' });
const page = await ctx.newPage({ viewport: { width: 1560, height: 900 }, deviceScaleFactor: 3 });
let staffRow = null;
for (let i = 0; i < 4 && !staffRow; i++) {
  try {
    const picker = await page.request.get(`${BASE}/api/auth/staff-picker`, { headers: { 'x-tenant-slug': 'usav' } });
    if (picker.ok()) {
      const { staff } = await picker.json();
      staffRow = staff.find((s) => /michael/i.test(s.name)) ?? staff[0];
    }
  } catch {}
  if (!staffRow) await new Promise((r) => setTimeout(r, 3000));
}
await page.request.post(`${BASE}/api/auth/signin`, {
  headers: { 'x-tenant-slug': 'usav' },
  data: { staffId: staffRow.id, deviceKind: 'personal' },
});
await page.context().addCookies((await page.request.storageState()).cookies);
await page.goto(`${BASE}/incoming`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-group-child]').first().waitFor({ state: 'visible', timeout: 60000 });
await page.waitForTimeout(1500);
const kid = page.locator('[data-group-child]').first();
await kid.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
const b = await kid.boundingBox();
await page.screenshot({ path: 'tmp-kidrow.png', clip: { x: Math.max(0, b.x - 6), y: Math.max(0, b.y - 6), width: Math.min(b.width + 12, 900), height: Math.min(b.height + 12, 300) } });
console.log('SHOT tmp-kidrow.png');
await ctx.close();
