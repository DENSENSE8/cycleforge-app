import { chromium } from '@playwright/test';
import fs from 'fs';
import { BASE_URL, mintSession, STORAGE } from './auth-preflight.mjs';

// Ad-hoc screenshot loop: reuse the saved Playwright session so auth-gated
// routes render; if the session is stale, re-sign-in through the shared
// preflight (tests/auth-preflight.mjs) and re-save it.
//   node tests/shot.mjs <path> <outfile>
const route = process.argv[2] || '/unbox';
const out = process.argv[3] || '/tmp/shot.png';
const baseURL = BASE_URL;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  storageState: fs.existsSync(STORAGE) ? STORAGE : undefined,
  baseURL,
  viewport: { width: 760, height: 520 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

await page.goto(route, { waitUntil: 'networkidle' });

if (page.url().includes('/signin')) {
  await mintSession({ baseURL, storage: STORAGE });
  const retryCtx = await browser.newContext({
    storageState: STORAGE,
    baseURL,
    viewport: { width: 760, height: 520 },
    deviceScaleFactor: 2,
  });
  const retryPage = await retryCtx.newPage();
  await retryPage.goto(route, { waitUntil: 'networkidle' });
  await retryPage.waitForTimeout(400);
  await retryPage.screenshot({ path: out });
  await browser.close();
  console.log(`shot -> ${out} (url: ${retryPage.url()})`);
  process.exit(0);
}

await page.waitForTimeout(400);
await page.screenshot({ path: out });
await browser.close();
console.log(`shot -> ${out} (url: ${page.url()})`);