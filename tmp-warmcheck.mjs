import { chromium } from '@playwright/test';
const b = await chromium.launch();
const page = await b.newPage({ storageState: 'tests/.auth/admin.json' });
let chunkFails = 0;
page.on('requestfailed', r => { if (r.url().includes('/_next/static/')) chunkFails++; });
try {
  await page.goto('http://localhost:3050/session', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByPlaceholder('Ask the agent…').waitFor({ timeout: 20000 });
  await page.keyboard.insertText('warmup-probe');
  await page.waitForTimeout(700);
  const val = await page.evaluate(() => document.querySelector('textarea')?.value ?? '');
  console.log(JSON.stringify({ ok: val === 'warmup-probe', value: val, chunkFails }));
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e.message?.split('\n')[0], chunkFails }));
}
await b.close();
