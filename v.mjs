import { chromium } from '@playwright/test';
import fs from 'node:fs';
const state = JSON.parse(fs.readFileSync('tests/.auth/admin.json', 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, storageState: state });
const d = await ctx.newPage();
await d.goto('http://localhost:3050/shipping/exceptions', { waitUntil: 'domcontentloaded' });
await d.waitForTimeout(7000);

// Expand the spine if collapsed.
const toggle = d.locator('button[aria-label*="sidebar" i], button[aria-label*="spine" i], button[aria-label*="nav" i]').first();
if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await d.waitForTimeout(1200); }

const spine = d.locator('[data-spine-nav]').first();
console.log('spine rows:', (await spine.innerText().catch(() => 'none')).replace(/\n+/g, ' | '));

// Expand Monitor to list its members.
const monitor = spine.getByRole('button', { name: /^Monitor/ }).first();
if (await monitor.isVisible().catch(() => false)) {
  await monitor.click();
  await d.waitForTimeout(900);
  console.log('after expanding Monitor:', (await spine.innerText()).replace(/\n+/g, ' | '));
} else console.log('Monitor header not visible');

console.log('Reports rows in spine:', await spine.getByText(/^Reports$/).count());
await d.screenshot({ path: 'v-desk.png', clip: { x: 0, y: 0, width: 420, height: 1000 } });
await browser.close();
