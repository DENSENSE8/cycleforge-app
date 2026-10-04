/** Read-only browser proof for mobile stock count and placement affordances. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3050';
const STORAGE = 'tests/.auth/admin.json';

assert.ok(fs.existsSync(STORAGE), `No saved session at ${STORAGE}`);

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: STORAGE,
  baseURL: BASE_URL,
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const writes = [];
page.on('request', (request) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) {
    const path = new URL(request.url()).pathname;
    if (/^\/api\/(locations|handling-units)(?:\/|$)/.test(path)) writes.push(`${request.method()} ${path}`);
  }
});

try {
  await page.goto('/m/stock', { waitUntil: 'domcontentloaded' });
  assert.ok(!page.url().includes('/signin'), 'saved browser session expired');
  await page.getByTestId('mobile-v2-stock').waitFor({ timeout: 30_000 });
  const hrefs = await page.locator('[data-testid="stock-location-row"][href]').evaluateAll((links) =>
    links.slice(0, 30).map((link) => link.getAttribute('href')).filter(Boolean),
  );
  assert.ok(hrefs.length > 0, 'no location links in mobile stock');

  let locationUrl = null;
  for (const href of hrefs) {
    await page.goto(String(href), { waitUntil: 'domcontentloaded' });
    await page.getByTestId('mobile-v2-location').waitFor({ timeout: 20_000 });
    if ((await page.getByTestId('location-stock-row').count()) > 0) {
      locationUrl = page.url();
      break;
    }
  }
  assert.ok(locationUrl, 'no populated location found in the first mobile stock page');

  assert.equal(await page.getByTestId('location-pair-sku').count(), 1);
  assert.equal(await page.getByTestId('location-park-tote').count(), 1);

  await page.getByTestId('location-stock-row').first().click();
  await page.getByTestId('stock-position-sheet').waitFor();
  await page.waitForTimeout(650); // DetailDock ignores a second press inside 500 ms
  await page.getByTestId('stock-adjust').click();
  await page.getByTestId('stock-adjust-count').waitFor();
  assert.equal(await page.getByTestId('stock-adjust-set').isDisabled(), true, 'an unchanged count must not commit');
  await page.screenshot({ path: '/tmp/cycleforge-v2-stock-manual-count.png', fullPage: false });

  await page.keyboard.press('Escape');
  await page.getByTestId('location-park-tote').click();
  await page.getByTestId('location-park-tote-picker').waitFor();
  await page.screenshot({ path: '/tmp/cycleforge-v2-stock-park-tote.png', fullPage: false });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(650); // same dock: a press inside 500 ms of Park tote is a double-tap
  await page.getByTestId('location-pair-sku').click();
  await page.getByText('Pair location', { exact: true }).first().waitFor({ timeout: 20_000 });
  assert.match(page.url(), /\/m\/pair\//);
  assert.ok(new URL(page.url()).searchParams.get('return'), 'pair route did not retain its location return');
  await page.screenshot({ path: '/tmp/cycleforge-v2-stock-pair-sku.png', fullPage: false });

  assert.deepEqual(writes, [], `read-only UI proof made inventory writes: ${writes.join(', ')}`);
  console.log(JSON.stringify({ ok: true, locationUrl, pairUrl: page.url(), writes }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
