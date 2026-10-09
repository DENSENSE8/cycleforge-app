import { chromium } from '@playwright/test';
import { BASE_URL, STORAGE, ensureSession } from './auth-preflight.mjs';

// Throwaway: Records paste mode — carton-only rows, word cells dropped, Window row reads "Any day".
const pre = await ensureSession?.({ baseURL: BASE_URL, storage: STORAGE, probePath: '/records' });
if (pre && !pre.ok) {
  console.log('no session', pre);
  process.exit(2);
}
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE, baseURL: BASE_URL, viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const refs = encodeURIComponent('1Z2306234057237\n878245902122\nhello world\nZZZ-404');
await page.goto(`/records?refs=${refs}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
await page.waitForSelector('[data-pasted-list-row]', { timeout: 120_000 });
await page.waitForTimeout(2000);
const facts = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('[data-pasted-list-row]')].map((r) => r.textContent?.replace(/\s+/g, ' ').slice(0, 140)),
  anyDay: [...document.querySelectorAll('aside *')].some((n) => n.childElementCount === 0 && n.textContent?.trim() === 'Any day'),
}));
await page.screenshot({ path: '/tmp/p35-paste.png' });
console.log(JSON.stringify(facts, null, 1), errors);
await browser.close();
