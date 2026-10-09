import { chromium } from '@playwright/test';
import { BASE_URL, STORAGE, ensureSession } from './auth-preflight.mjs';

// Throwaway: /fulfilled board → zoom → sheet → /records, measuring rows and shooting each face.
const pre = await ensureSession?.({ baseURL: BASE_URL, storage: STORAGE, probePath: '/fulfilled' });
if (pre && !pre.ok) {
  console.log('no session', pre);
  process.exit(2);
}
const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: STORAGE, baseURL: BASE_URL, viewport: { width: 1600, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

async function face(name, url, waitFor) {
  const t = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForSelector(waitFor, { timeout: 120_000 });
  await page.waitForTimeout(1500);
  const facts = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-pasted-list-row]')].slice(0, 5);
    const heads = [...document.querySelectorAll('[role="columnheader"]')].map((h) => h.textContent?.trim()).filter(Boolean);
    const fill = document.querySelector('[data-status-fill]');
    const dock = document.querySelector('[data-record-action-strip], [data-records-dock]');
    return {
      rows: document.querySelectorAll('[data-pasted-list-row]').length,
      rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
      heads,
      fill: fill ? getComputedStyle(fill).backgroundColor : null,
      cards: document.querySelectorAll('[data-testid="fulfilled-board-card"]').length,
      crumb: document.querySelector('[data-testid="fulfilled-column-crumb"]')?.textContent ?? null,
      dock: Boolean(dock),
    };
  });
  await page.screenshot({ path: `/tmp/p3-${name}.png` });
  console.log(name, Date.now() - t, 'ms', page.url(), JSON.stringify(facts));
}

await face('board', '/fulfilled', '[data-fulfilled-board]');
await face('zoom', '/fulfilled?col=stalled', '[data-pasted-list-row]');
await face('sheet', '/fulfilled?layout=sheet', '[data-pasted-list-row]');
await face('records', '/records?refs=' + encodeURIComponent(process.argv[2] ?? ''), '[data-pasted-list-row]');
// The legacy link lands on the same view.
await page.goto('/fulfilled?channel=amazon&status=delivered&colsort=customer', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1000);
console.log('legacy ->', page.url());
console.log('errors', errors);
await browser.close();
