import { chromium } from '@playwright/test';

const SID = process.env.CF_SID;
const BASE = process.env.CF_BASE ?? 'http://127.0.0.1:3077';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addCookies([{ name: 'cf_sid', value: SID, domain: '127.0.0.1', path: '/', httpOnly: true }]);
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text().slice(0, 300)}`);
});

let i = 0;
for (const url of process.argv.slice(2)) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  const file = `/tmp/shot-${i++}-${url.replace(/[^a-z0-9]+/gi, '_')}.png`;
  await page.screenshot({ path: file });
  console.log(file);
}
await browser.close();
