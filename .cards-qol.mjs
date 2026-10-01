import { chromium, request as pwRequest } from '@playwright/test';

const base = 'http://localhost:3050';
const req = await pwRequest.newContext({ baseURL: base });
const { staff } = await (await req.get('/api/auth/staff-picker', { headers: { 'x-tenant-slug': 'usav' } })).json();
const row = staff.find((s) => s.name.toLowerCase().includes('michael'));
await req.post('/api/auth/signin', { headers: { 'x-tenant-slug': 'usav' }, data: { staffId: row.id, deviceKind: 'personal' } });
await req.storageState({ path: '/tmp/cf-qol.json' });
await req.dispose();

const browser = await chromium.launch();
const ctx = await browser.newContext({ storageState: '/tmp/cf-qol.json', viewport: { width: 1600, height: 1000 } });
await ctx.addInitScript(() => {
  window.__keys = [];
  const origPD = Event.prototype.preventDefault;
  Event.prototype.preventDefault = function () {
    if (this.type === 'keydown' && (this.key === ']' || this.key === 'Home')) {
      window.__keys.push(`${this.key} taken by ${(new Error().stack || '').split('\n')[2]?.trim().replace(/\(http[^)]*\)/, '')}`);
    }
    return origPD.call(this);
  };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).split('\n')[0].slice(0, 180)));
page.on('console', (m) => { if (m.type() === 'error' && /Maximum update|same key|Warning/.test(m.text())) errors.push(m.text().slice(0, 160)); });
const log = (...a) => console.log(...a);
const ready = async () => { await page.waitForSelector('[data-testid="order-card"]', { state: 'attached', timeout: 60000 }); await page.waitForTimeout(1200); };
const shot = (name) => page.locator('main').first().screenshot({ path: `/tmp/qol-${name}.png` });
const search = () => new URL(page.url()).search;
const pager = () => page.locator('[data-testid="order-card-pager"]').innerText().catch(() => '(no pager)');
const keys = async () => { const k = await page.evaluate(() => { const l = window.__keys; window.__keys = []; return l; }); return k.length ? k.join(' ; ') : '(no handler took it)'; };
const scroller = '[data-testid="pending-grid-body"] .overflow-y-auto';
const heads = () => page.locator('[data-testid="order-card"]').evaluateAll((els) => els.map((e) => e.querySelector('[data-testid="order-card-open"]')?.getAttribute('aria-label')?.replace('Open order ', '')));
// Record header: "Order <n>" plus the cursor's "k of N".
const recordFace = () => page.evaluate(() => {
  const h = [...document.querySelectorAll('h1,h2,h3,[role="heading"]')].map((e) => e.textContent?.trim() ?? '').find((t) => /^Order /.test(t));
  const pos = [...document.querySelectorAll('span,div')].map((e) => e.childElementCount === 0 ? e.textContent?.trim() ?? '' : '').find((t) => /^\d+ of \d+$/.test(t));
  return `${h ?? '?'} [${pos ?? '-'}]`;
});

await page.goto(base + '/shipping/orders', { waitUntil: 'domcontentloaded' });
await ready();
log('A sections', JSON.stringify(await page.locator('[data-testid="order-card-section"]').allInnerTexts()));
await shot('1-sections');

// ── Pager: 20 / page, ] and Home, ?page= survives reload ──
await page.locator('[data-testid="order-card-page-mode"]').click();
await page.getByRole('button', { name: '20 per page' }).click();
await page.waitForTimeout(800);
await page.locator('[data-testid="order-card-open"]').first().focus();
log('B pager 20', await pager());
await page.keyboard.press(']');
await page.waitForTimeout(800);
log('B after ]', await pager(), search(), '|', await keys());
await page.reload({ waitUntil: 'domcontentloaded' });
await ready();
log('B after reload', await pager(), search());
await page.locator('[data-testid="order-card-open"]').first().focus();
await page.keyboard.press('Home');
await page.waitForTimeout(800);
log('B after Home', await pager(), search(), '|', await keys());

// ── Pasted link: two chips + page 2 ──
const pasted = await ctx.newPage();
pasted.on('pageerror', (e) => errors.push('pasted: ' + String(e).split('\n')[0].slice(0, 160)));
await pasted.goto(base + '/shipping/orders?cardStatus=outOfStock,late&page=2', { waitUntil: 'domcontentloaded' });
await pasted.waitForSelector('[data-testid="order-card"], [data-testid="order-card-select-bar"]', { state: 'attached', timeout: 60000 });
await pasted.waitForTimeout(1500);
log('C pasted url', new URL(pasted.url()).search,
  'oos', await pasted.locator('[data-testid="status-filter-outOfStock"]').getAttribute('aria-pressed'),
  'late', await pasted.locator('[data-testid="status-filter-late"]').getAttribute('aria-pressed'),
  'cards', await pasted.locator('[data-testid="order-card"]').count(),
  'pager', await pasted.locator('[data-testid="order-card-pager"]').innerText().catch(() => '(no pager)'));
await pasted.close();

// ── Chip → URL → reload; J/K walk only visible cards ──
await page.locator('[data-testid="status-filter-outOfStock"]').click();
await page.waitForTimeout(800);
log('D chip url', search());
await page.reload({ waitUntil: 'domcontentloaded' });
await ready();
const visible = await heads();
log('D after reload pressed', await page.locator('[data-testid="status-filter-outOfStock"]').getAttribute('aria-pressed'), 'visible', JSON.stringify(visible));
await page.locator('[data-testid="order-card-open"]').first().click();
await page.waitForSelector('[data-testid="order-record"]');
await page.waitForTimeout(600);
const walked = [await recordFace()];
for (let i = 0; i < visible.length; i++) {
  await page.keyboard.press('j');
  await page.waitForTimeout(500);
  walked.push(await recordFace());
}
await page.keyboard.press('k');
await page.waitForTimeout(500);
walked.push('K→ ' + (await recordFace()));
log('D J/K walked', JSON.stringify(walked));
const strays = walked.map((w) => w.replace(/^K→ /, '').match(/^Order (\S+)/)?.[1]).filter((n) => n && !visible.includes(n));
log('D walked outside the filter', JSON.stringify(strays));
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
log('D Esc closes record', await page.locator('[data-testid="order-record"]').count() === 0);
await page.locator('[data-testid="order-card-open"]').first().focus();
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
log('D Esc resets chips', search() === '' ? 'yes' : search());

// ── Scroll mode ──
await page.locator('[data-testid="order-card-page-mode"]').click();
await page.getByRole('button', { name: /Scroll/ }).click();
await page.waitForTimeout(800);
log('E scroll mode: pager', await page.locator('[data-testid="order-card-pager"]').count(), 'cards', await page.locator('[data-testid="order-card"]').count());

// ── F → sidebar Find; exact number opens ──
await page.locator('[data-testid="order-card-open"]').first().focus();
await page.keyboard.press('f');
await page.waitForTimeout(400);
const focused = () => page.evaluate(() => { const a = document.activeElement; return a instanceof HTMLInputElement ? `${a.getAttribute('data-testid') ?? ''} "${a.placeholder || a.getAttribute('aria-label')}"` : a?.tagName; });
log('F F focused', await focused());
await page.keyboard.type('5043');
await page.waitForTimeout(2500);
log('F exact find → record', await recordFace(), 'open', await page.locator('[data-testid="order-record"]').count());
await shot('2-exact-find');
await page.keyboard.press('Escape'); // leave the field
await page.waitForTimeout(300);
await page.keyboard.press('Escape'); // close the record
await page.waitForTimeout(500);
await page.locator('input[type="search"]').first().fill('');
await page.waitForTimeout(1500);
log('F record closed', await page.locator('[data-testid="order-record"]').count() === 0);

// ── Space quick look ──
await page.locator('[data-testid="order-card-open"]').nth(1).focus();
await page.keyboard.press(' ');
await page.waitForTimeout(700);
log('G peek open', await page.locator('[data-testid="order-card-peek"]').count());
await shot('3-peek');
await page.keyboard.press(' ');
await page.waitForTimeout(600);
log('G peek closed', await page.locator('[data-testid="order-card-peek"]').count());

// ── SKU batch chip ──
const skuChip = page.locator('[data-testid="order-card-sku-batch"]').first();
if (await skuChip.count()) {
  const label = await skuChip.innerText();
  await skuChip.click();
  await page.waitForTimeout(700);
  const checked = await page.locator('[data-testid="order-card-check"][aria-checked="true"]').count();
  log('H sku chip', label, '→ checked cards', checked, '| bar', (await page.locator('[data-testid="order-card-select-bar"]').innerText()).split('\n')[0]);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
} else log('H sku chip: none loaded');

// ── F with the sidebar collapsed → inline Find ──
await page.keyboard.press('Control+b');
await page.waitForTimeout(700);
await page.locator('[data-testid="order-card-open"]').first().focus();
await page.keyboard.press('f');
await page.waitForTimeout(500);
log('I collapsed: inline find', await page.locator('[data-testid="order-card-inline-find"]').count(), 'focused', await focused());
await shot('4-inline-find');
await page.keyboard.press('Escape');
await page.keyboard.press('Control+b');
await page.waitForTimeout(700);

// ── Keep the place across reload ──
await page.evaluate((s) => document.querySelector(s)?.scrollTo({ top: 700 }), scroller);
await page.waitForTimeout(600);
await page.reload({ waitUntil: 'domcontentloaded' });
await ready();
await page.waitForTimeout(600);
log('J scrollTop after reload (set 700)', await page.evaluate((s) => Math.round(document.querySelector(s)?.scrollTop ?? -1), scroller));

// restore prefs
await page.evaluate(() => { localStorage.removeItem('cf:order-cards:scroll'); localStorage.setItem('cf:data-table-page-size', '100'); });
log('Z errors', errors.length, JSON.stringify([...new Set(errors)].slice(0, 6)));
await browser.close();
