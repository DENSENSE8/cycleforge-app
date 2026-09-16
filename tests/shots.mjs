import { chromium } from '@playwright/test';
import fs from 'fs';

// Ad-hoc screenshot set against a running lane, reusing the saved session.
//   node tests/shots.mjs <label> <path>[,<path>...]
const baseURL = process.env.PW_BASE_URL || 'http://127.0.0.1:3077';
const label = process.argv[2] || 'shot';
const routes = (process.argv[3] || '/shipping/shipped').split(',');
const outDir = process.env.SHOT_DIR || '/tmp/shots';

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: 'tests/.auth/admin.json',
  baseURL,
  viewport: { width: 1500, height: 950 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 200));
});

for (const [i, route] of routes.entries()) {
  const out = `${outDir}/${label}-${i + 1}.png`;
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    // Settle: the grid paints skeletons first, and a dev server may be
    // recompiling. Wait for the count sentence to stop saying "0 rows".
    await page
      .waitForFunction(
        () => {
          const el = document.querySelector('[data-testid="data-table-row-count"]');
          const text = el?.textContent?.trim() ?? '';
          if (!text) return false;
          return !/^0 rows?$/.test(text);
        },
        undefined,
        { timeout: 60_000 },
      )
      .catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: out });
    const count = await page
      .getByTestId('data-table-row-count')
      .first()
      .textContent()
      .catch(() => null);
    console.log(`${out} <- ${page.url()} | count: ${count ?? 'n/a'}`);
  } catch (e) {
    console.log(`fail ${route}: ${String(e.message).split('\n')[0]}`);
  }
}
if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 6));
await browser.close();
