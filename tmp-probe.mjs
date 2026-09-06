import { chromium } from '@playwright/test';
const b = await chromium.launch();
const page = await b.newPage({ storageState: 'tests/.auth/admin.json', viewport: { width: 1440, height: 900 } });
page.on('console', m => console.log(`[console.${m.type()}]`, m.text().slice(0, 200)));
page.on('requestfailed', r => console.log('[reqfail]', r.url().slice(0, 100), '·', r.failure()?.errorText));
page.on('response', r => { if (r.status() >= 400) console.log('[http' + r.status() + ']', r.url().slice(0, 100)); });
await page.goto('http://localhost:3050/session', { waitUntil: 'domcontentloaded', timeout: 60000 });
const composer = page.getByPlaceholder('Ask the agent…');
await composer.waitFor({ timeout: 30000 });
await page.waitForTimeout(2000);

await composer.click();
await page.keyboard.type('ABC', { delay: 60 });
console.log('after keyboard.type:', JSON.stringify(await composer.evaluate(e => e.value)));
await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
await page.keyboard.insertText('DEF');
console.log('after insertText:', JSON.stringify(await composer.evaluate(e => e.value)));
await page.evaluate(() => {
  const t = document.querySelector('textarea');
  const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  set.call(t, 'GHI');
  t.dispatchEvent(new Event('input', { bubbles: true }));
});
console.log('after native set+input:', JSON.stringify(await composer.evaluate(e => e.value)));
console.log('react root hydrated markers:', await page.evaluate(() => {
  // A hydrated React app has event delegation wired; probe a client-only store.
  return { hasNext: typeof window.next !== 'undefined', appReady: document.readyState };
}));
await b.close();
