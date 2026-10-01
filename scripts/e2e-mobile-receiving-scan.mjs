/**
 * Read-only browser contract for the mobile scanner and a receiving label.
 *
 *   PW_BASE_URL=http://localhost:3050 node scripts/e2e-mobile-receiving-scan.mjs
 *   E2E_RECEIVING_ID=53276 node scripts/e2e-mobile-receiving-scan.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3050';
const STORAGE = 'tests/.auth/admin.json';
const RECEIVING_ID = Number(process.env.E2E_RECEIVING_ID || 53276);

assert.ok(fs.existsSync(STORAGE), `No saved session at ${STORAGE}`);

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: STORAGE,
  baseURL: BASE_URL,
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const receivingWrites = [];

page.on('request', (request) => {
  if (
    /\/api\/receiving(?:\/|$)/.test(request.url()) &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
  ) {
    receivingWrites.push(`${request.method()} ${request.url()}`);
  }
});

try {
  await page.goto('/m/scan?mode=view', { waitUntil: 'domcontentloaded' });
  assert.ok(!page.url().includes('/signin'), 'saved browser session expired');
  await page.getByTestId('mobile-v2-scan-header').waitFor({ timeout: 20_000 });

  assert.equal(await page.getByTestId('mobile-v2-app-switcher').count(), 1);
  assert.equal(await page.getByLabel('Start a new scan').count(), 0);
  assert.equal(await page.getByRole('tab', { name: 'View' }).getAttribute('aria-selected'), 'true');
  assert.equal(await page.getByLabel('Type the label instead').count(), 1);
  assert.equal(await page.getByLabel('Done scanning').count(), 1);
  await page.screenshot({ path: '/tmp/cycleforge-v2-scan-view-e2e.png', fullPage: false });

  await page.evaluate((receivingId) => {
    window.dispatchEvent(new CustomEvent('wedge-scan', { detail: { value: `R-${receivingId}` } }));
  }, RECEIVING_ID);

  await page.getByTestId('mobile-v2-receiving-carton').waitFor({ timeout: 20_000 });
  const url = new URL(page.url());
  assert.equal(url.pathname, `/m/r/${RECEIVING_ID}`);
  assert.equal(url.searchParams.get('scanMode'), 'view');
  assert.equal(url.searchParams.get('back'), '/m/scan');
  assert.equal(await page.getByLabel('Close').count(), 1, 'scan-launched record must close');
  assert.equal(await page.getByLabel('Back').count(), 0, 'scan-launched record must not show Back');
  assert.equal(await page.getByTestId('receiving-v2-line-row').count(), 2);

  await page.getByTestId('receiving-v2-line-row').first().click();
  await page.getByRole('button', { name: 'Open listing' }).waitFor();
  await page.getByRole('button', { name: 'Photos', exact: true }).click();
  await page.getByRole('button', { name: 'Add photo' }).waitFor();
  await page.waitForTimeout(350);
  await page.screenshot({ path: '/tmp/cycleforge-v2-r53276-e2e.png', fullPage: false });

  assert.deepEqual(receivingWrites, [], `View mode wrote receiving state: ${receivingWrites.join(', ')}`);

  await page.goto(`/m/r/${RECEIVING_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('mobile-v2-receiving-carton').waitFor({ timeout: 20_000 });
  assert.equal(await page.getByLabel('Back').count(), 1, 'hierarchical record must show Back');
  assert.equal(await page.getByLabel('Close').count(), 0, 'hierarchical record must not show Close');

  console.log(
    JSON.stringify(
      {
        ok: true,
        receivingId: RECEIVING_ID,
        recordUrl: `${BASE_URL}/m/r/${RECEIVING_ID}?scanMode=view&back=%2Fm%2Fscan`,
        screenshots: [
          '/tmp/cycleforge-v2-scan-view-e2e.png',
          '/tmp/cycleforge-v2-r53276-e2e.png',
        ],
        receivingWrites,
      },
      null,
      2,
    ),
  );
} finally {
  await context.close();
  await browser.close();
}
