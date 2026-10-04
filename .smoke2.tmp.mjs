import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: 'tests/.auth/admin.json', baseURL: 'http://localhost:3050', viewport: { width: 1440, height: 900 } });
for (const route of ['/unbox', '/inventory?sku=TEST', '/dashboard?mode=repairs']) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 140)));
  const res = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(9000);
  const body = await page.locator('body').innerText().catch(() => '');
  const shot = `/tmp/smoke2${route.replace(/[^a-z0-9]+/gi, '_')}.png`;
  await page.screenshot({ path: shot });
  console.log(JSON.stringify({ route, status: res.status(), url: page.url(), chunkErr: /ChunkLoadError|Application error|Runtime/.test(body), errs: errs.slice(0, 3), shot }));
  await page.close();
}
await browser.close();
