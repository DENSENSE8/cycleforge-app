import { chromium } from '@playwright/test';
const b = await chromium.launch(); const c = await b.newContext({ storageState: 'tests/.auth/admin.json', baseURL: 'http://localhost:3050', viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
for (const u of ['/operations', '/counter', '/customers', '/pickup', '/dashboard?mode=repairs', '/operations/imports', '/calendar']) {
  await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4500);
  const aside = p.locator('aside').first();
  const before = (await aside.innerText().catch(()=>'' )).replace(/\s+/g,' ').slice(0,200);
  const trig = aside.locator('button[aria-haspopup], [aria-expanded]').first();
  let opts = '';
  if (await trig.count()) { await trig.click().catch(()=>{}); await p.waitForTimeout(700); opts = (await p.locator('[role=menu],[role=listbox],[data-radix-popper-content-wrapper]').allInnerTexts().catch(()=>[])).join(' | ').replace(/\s+/g,' ').slice(0,300); await p.keyboard.press('Escape'); }
  console.log('==', u, '->', new URL(p.url()).pathname, '\n  aside:', before, '\n  menu:', opts);
}
await b.close();
