import { chromium } from '@playwright/test';

const BASE = 'http://127.0.0.1:3050';
const SLUG = 'usav';

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const staff = (await (await ctx.request.get(`${BASE}/api/auth/staff-picker`, { headers: { 'x-tenant-slug': SLUG } })).json()).staff ?? [];
const me = staff.find((s) => /^michael$/i.test(s.name));
await ctx.request.post(`${BASE}/api/auth/signin`, {
  headers: { 'x-tenant-slug': SLUG, 'content-type': 'application/json' },
  data: { staffId: me.id, deviceKind: 'personal' },
});
const page = await ctx.newPage();
await page.goto(`${BASE}/products?view=pairing`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
await page.waitForTimeout(12_000);

// Locate the sidebar SearchBar (compact/blue, lives above the pairing queue).
const bar = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
const barBox = await bar.boundingBox().catch(() => null);
console.log('search bar box:', JSON.stringify(barBox));
console.log('page url:', page.url());

if (barBox) {
  const cx = barBox.x + barBox.width / 2;
  const cy = barBox.y + 4; // top edge — where rows would slide under/over
  const probe = async (label) => {
    const top = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return 'none';
      const img = el.closest('img');
      const cls = (c) => (el.closest(`.${c}`) ? `.${c}` : '');
      return `${el.tagName.toLowerCase()}${img ? '(IMG!)' : ''} z=${getComputedStyle(el.closest('div,section,aside') || el).zIndex}`;
    }, [x, y]);
    console.log(`${label}: hit = ${top}`);
  };
  await probe('before scroll, bar top edge');

  // Scroll the pairing queue body under the bar.
  await page.mouse.move(cx, cy + 200);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(1_500);
  await probe('after scroll, bar top edge');
  await page.screenshot({ path: 'tmp-pair-z.png' });
  console.log('screenshot: tmp-pair-z.png');
} else {
  console.log('body text:', ((await page.locator('body').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 300));
}
await b.close();
