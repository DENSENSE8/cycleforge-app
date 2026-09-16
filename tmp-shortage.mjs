import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: 'tests/.auth/admin.json', viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.setDefaultTimeout(120000);
await page.goto('http://127.0.0.1:3077/shipping/shortage', { waitUntil: 'commit' });
await page.waitForTimeout(4000);
const dump = await page.evaluate(() => {
  const main = document.querySelector('main') ?? document.body;
  const text = (main.textContent ?? '').replace(/\s+/g, ' ').trim();
  const lines = [...main.querySelectorAll('[role="row"], [data-order-row-id], li, article')]
    .slice(0, 14)
    .map((el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 150))
    .filter(Boolean);
  return { url: location.href, hasLineWord: /line/i.test(text), sample: text.slice(0, 600), rows: lines };
});
console.log(JSON.stringify(dump, null, 1));
await page.screenshot({ path: 'tmp-shortage.png', fullPage: false });
await browser.close();
