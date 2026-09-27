import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const context = await browser.newContext({ storageState: '/tmp/pw-sidebar-state.json', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on('console', (m) => { if (m.text().startsWith('target')) console.log(m.text()); });
const errors = []; page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)));
await page.goto('http://localhost:3050/settings', { waitUntil: 'domcontentloaded', timeout: 90_000 });
await page.waitForSelector('[data-nav-search-everywhere]', { timeout: 90_000 });
console.log('faces', await page.locator('[data-nav-search-everywhere]').count(), 'wells', await page.locator('[data-nav-search-well]').count());
console.log('url', page.url(), 'scope', await page.locator('[data-nav-search]').first().getAttribute('data-nav-search'));
await page.focus('[data-nav-search-everywhere]');
await page.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', '21-15107-47310\n1Z999AA10123456784\nNOPE123'); (console.log('target', document.activeElement?.outerHTML.slice(0,80)), document.querySelector('[data-nav-search-everywhere]')).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
for (const ms of [50, 300, 1500]) { await page.waitForTimeout(ms); console.log(ms, 'toggle', await page.locator('[data-nav-bulk-toggle]').count(), 'bulkrows', await page.locator('[data-bulk-index]').count(), 'wells', await page.locator('[data-nav-search-well]').count()); }
await page.waitForSelector('[data-bulk-index]', { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(8000);
console.log('rows', (await page.locator('[data-bulk-index]').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').slice(0, 120)));
await page.screenshot({ path: '/tmp/locate-bulk-everywhere.png', clip: { x: 0, y: 0, width: 900, height: 260 } });
// single paste → palette
await page.keyboard.press('Escape');
await page.evaluate(() => { window.__opens = []; window.addEventListener('app-command-bar-open', (e) => window.__opens.push(e.detail)); });
await page.focus('[data-nav-search-everywhere]');
await page.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', '21-15107-47310'); (console.log('target', document.activeElement?.outerHTML.slice(0,80)), document.querySelector('[data-nav-search-everywhere]')).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
await page.waitForTimeout(500);
console.log('single paste opens', JSON.stringify(await page.evaluate(() => window.__opens)));
console.log('errors', errors);
await browser.close();
