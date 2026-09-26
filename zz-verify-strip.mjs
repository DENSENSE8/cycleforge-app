import { chromium } from '@playwright/test';
import fs from 'node:fs';

const BASE = 'http://localhost:3050';
const OUT = '/tmp/desk-plane-strip';
fs.mkdirSync(OUT, { recursive: true });
const STATE = '/tmp/desk-plane-auth-15.json';
const [task = 'repro', ...args] = process.argv.slice(2);

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  storageState: fs.existsSync(STATE) ? STATE : undefined,
  extraHTTPHeaders: { 'x-tenant-slug': 'usav' },
});
async function signIn() {
  for (;;) {
    const res = await context.request.post(`${BASE}/api/auth/signin`, {
      headers: { 'content-type': 'application/json' },
      data: { staffId: 15, deviceKind: 'personal' },
    });
    console.log('signin', res.status());
    if (res.ok()) { await context.storageState({ path: STATE }); return; }
    if (res.status() !== 429) process.exit(1);
    const wait = Math.min(Number(res.headers()['retry-after'] || 60), 660);
    console.log('rate limited, waiting', wait);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}
if (!fs.existsSync(STATE)) await signIn();
const me = await context.request.get(`${BASE}/api/auth/me`).catch(() => null);
if (me && me.status() === 401) await signIn();

const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const log = (...a) => console.log(`[${task}]`, ...a);
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  log('shot', `${OUT}/${name}.png`);
};
const sleep = (ms) => page.waitForTimeout(ms);

async function gotoDesk(route, rowSel) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(rowSel, { state: 'attached', timeout: 90000 });
  await sleep(2500);
}
async function setFullscreen(on) {
  const toggle = page.locator('[data-testid="desk-fullscreen-toggle"]').first();
  const isOn = (await toggle.getAttribute('aria-label')) === 'Exit fullscreen';
  if (isOn !== on) {
    await toggle.click();
    await sleep(700);
  }
}
const recordVisible = (id) => page.locator(`[data-testid="${id}"][data-desk-record-view] , [data-testid="${id}"]`).first().isVisible().catch(() => false);

if (task === 'repro') {
  // Esc right after open, before the ?openOrderId= write lands, 5× — the record must stay closed.
  const [route = '/shipping/orders', rowSel = '[data-ledger-open]', recId = 'order-record'] = args;
  await gotoDesk(route, rowSel);
  await setFullscreen(false);
  let reopened = 0;
  for (let i = 0; i < 5; i++) {
    await page.locator(rowSel).nth(i).click();
    await sleep(40);
    await page.keyboard.press('Escape');
    await sleep(1600);
    const open = await page.locator(`[data-testid="${recId}"]`).count();
    const url = page.url();
    log(`try ${i + 1}: record painted=${open} url=${url.replace(BASE, '')}`);
    if (open > 0) {
      reopened += 1;
      await page.keyboard.press('Escape');
      await sleep(1200);
    }
  }
  log('reopened', reopened, 'of 5');
}

if (task === 'desk') {
  // Strip over the open record, both views; morph OOS + Scan out; Delete second press (not committed).
  const [route, rowSel, recId, stripId, name] = args;
  await gotoDesk(route, rowSel);
  for (const view of ['in-place', 'split']) {
    await setFullscreen(view === 'split');
    await page.locator(rowSel).first().click();
    await page.waitForSelector(`[data-testid="${recId}"]`, { timeout: 30000 });
    await page.waitForSelector(`[data-testid="${stripId}"]`, { timeout: 30000 });
    await sleep(1200);
    const strip = page.locator(`[data-testid="${stripId}"]`);
    const record = page.locator(`[data-testid="${recId}"]`).first();
    const search = page.locator('[data-testid="data-table-toolbar"], [data-testid="record-ledger-toolbar"]').first();
    const sb = await search.boundingBox();
    const tb = await strip.boundingBox();
    const rb = await record.boundingBox();
    log(view, 'search', sb && Math.round(sb.y), 'strip', tb && [Math.round(tb.x), Math.round(tb.y), Math.round(tb.width), Math.round(tb.height)], 'record', rb && [Math.round(rb.x), Math.round(rb.y), Math.round(rb.width)]);
    log(view, 'strip below search', !!(sb && tb && tb.y >= sb.y + sb.height - 1), 'record below strip (in place)', !!(tb && rb && rb.y >= tb.y + tb.height - 1));
    log(view, 'verbs', (await strip.locator('button').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim()).join(' | '));
    log(view, 'buttons inside record header/aside', await record.locator('[data-testid^="order-record-top"], [data-testid="order-record-verbs"], [data-testid="order-record-oos"], [data-testid="order-record-select"], [data-testid="record-tasks"]').count());
    await shot(`${name}-${view}`);

    for (const verb of ['out-of-stock', 'scan-out']) {
      const btn = strip.locator(`[data-testid="${stripId}-${verb}"]`);
      if ((await btn.count()) === 0) { log(view, verb, 'absent'); continue; }
      await btn.click();
      await sleep(900);
      log(view, verb, 'strip view →', await strip.getAttribute('data-view'));
      await shot(`${name}-${view}-${verb}`);
      await page.keyboard.press('Escape');
      await sleep(500);
      log(view, 'after Esc: view', await strip.getAttribute('data-view'), 'record still open', await record.isVisible());
    }
    const del = strip.locator(`[data-testid="${stripId}-delete"]`);
    if (await del.count()) {
      await del.click();
      await sleep(300);
      log(view, 'delete after 1 press:', (await del.innerText()).trim(), 'armed', await del.getAttribute('data-armed'));
      await shot(`${name}-${view}-delete-armed`);
    }
    await page.keyboard.press('Escape');
    await sleep(900);
    log(view, 'Esc → record closed', (await page.locator(`[data-testid="${recId}"][data-desk-record-open], [data-testid="${recId}"]:not([data-desk-record-view="split"])`).count()) === 0, 'strip gone', (await strip.count()) === 0);
    if (view === 'split') {
      await page.keyboard.press('Escape');
      await sleep(700);
      log('split: second Esc exits fullscreen', (await page.locator('[data-testid="desk-fullscreen-toggle"]').first().getAttribute('aria-label')) === 'Enter fullscreen');
    }
  }
}

log('page errors', errors.length, errors.slice(0, 3).join(' ;; '));
await browser.close();
