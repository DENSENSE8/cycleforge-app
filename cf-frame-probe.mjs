import { chromium } from '@playwright/test';

const SID = process.env.CF_SID;
const BASE = 'http://127.0.0.1:3077';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
await ctx.addCookies([{ name: 'cf_sid', value: SID, domain: '127.0.0.1', path: '/', httpOnly: true }]);
const page = await ctx.newPage();

async function probe(url) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  return await page.evaluate(() => {
    const header = document.querySelector('[data-testid="desk-page-header"]');
    const band = document.querySelector('[data-testid="desk-page-chrome-band"]');
    return {
      url: location.href,
      frameHeader: header ? header.innerText.replace(/\n+/g, ' | ') : null,
      h1: [...document.querySelectorAll('h1')].map((e) => e.textContent.trim()),
      h2: [...document.querySelectorAll('h2')].map((e) => e.textContent.trim()).slice(0, 6),
      bandTabs: band
        ? [...band.querySelectorAll('[role="tab"]')].map((t) => `${t.textContent.trim()}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`)
        : null,
    };
  });
}

for (const url of process.argv.slice(2)) {
  console.log(JSON.stringify(await probe(url), null, 2));
}
await browser.close();
