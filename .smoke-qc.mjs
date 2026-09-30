import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3050';
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: 'tests/.auth/admin.json', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await context.newPage();

for (const [name, url, ready] of [
  ['carton', '/m/r/51743/qc', 'qc-unit-record'],
  ['passed', '/m/u/2457/qc?back=%2Fm%2Fr%2F51743%2Fqc', 'qc-label-print'],
  ['failed', '/m/u/2203/qc?back=%2Fm%2Fr%2F50328', 'qc-fail-ticket'],
]) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.getByTestId(ready).first().waitFor({ timeout: 180000 });
  await page.waitForTimeout(1500);
  const mode = await page.evaluate(() => [...document.querySelectorAll('[data-mode]')].map((el) => el.getAttribute('data-mode')).join(','));
  const records = await page.getByTestId('qc-unit-record').evaluateAll((els) => els.map((el) => `${el.getAttribute('data-state')} | ${el.innerText.replace(/\n+/g, ' · ')}`));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  console.log(name, '| modes:', mode, '| h-overflow px:', overflow);
  for (const r of records) console.log('  ', r);
  await page.screenshot({ path: `/tmp/qc-${name}.png` });
}
await browser.close();
