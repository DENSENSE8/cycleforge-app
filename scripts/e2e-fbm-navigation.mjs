/** Read-only live proof for FBM navigation and legacy Exceptions redirects. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { BASE_URL, ensureSession, STORAGE } from '../tests/auth-preflight.mjs';

const outDir = process.env.SHOT_DIR || '/tmp/cycleforge-fbm-navigation';
fs.mkdirSync(outDir, { recursive: true });

const session = await ensureSession({ probePath: '/shipping/orders' });
assert.equal(session.ok, true, session.error);

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: STORAGE,
  baseURL: BASE_URL,
  viewport: { width: 1500, height: 950 },
});
const page = await context.newPage();

async function hideDevOverlay() {
  await page.locator('nextjs-portal').evaluateAll((nodes) => {
    for (const node of nodes) node.setAttribute('hidden', '');
  });
}

try {
  await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });
  assert.ok(!page.url().includes('/signin'), 'saved browser session expired');
  await page.getByRole('button', { name: 'View: Allocate' }).waitFor({ timeout: 30_000 });
  assert.equal(await page.locator('[data-nav-switcher="mode"]', { hasText: 'FBM' }).count(), 1);
  await hideDevOverlay();
  await page.screenshot({ path: `${outDir}/desktop-allocate.png` });

  await page.getByRole('button', { name: 'View: Allocate' }).click();
  const fbmViews = page.getByRole('group', { name: 'View' });
  assert.deepEqual(await fbmViews.locator('a').allTextContents(), ['Labels & docs']);
  assert.doesNotMatch(await fbmViews.innerText(), /Exceptions/);
  await hideDevOverlay();
  await page.screenshot({ path: `${outDir}/desktop-fbm-children.png` });

  await fbmViews.locator('[data-nav-switcher-item="label-intake"]').click();
  await page.waitForURL(/\/shipping\/label-intake/);
  await page.getByRole('button', { name: 'View: Bulk' }).waitFor({ timeout: 30_000 });
  assert.equal(await page.locator('[data-nav-switcher="mode"]', { hasText: 'FBM' }).count(), 1);
  await page.getByRole('button', { name: 'View: Bulk' }).click();
  const labelViews = page.getByRole('group', { name: 'View' });
  assert.deepEqual(
    await labelViews.locator('a').allTextContents(),
    ['Allocate', 'Shipping labels', 'Packing slips'],
  );
  assert.equal(await labelViews.locator('[data-nav-switcher-item="orders"]').count(), 1);
  await hideDevOverlay();
  await page.screenshot({ path: `${outDir}/desktop-label-docs-views.png` });

  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'View: Allocate' }).waitFor({ timeout: 30_000 });

  await page.goto('/shipping/exceptions', { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname === '/exceptions');
  assert.equal(new URL(page.url()).pathname, '/exceptions');

  await page.goto('/incoming?lane=exceptions', { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname === '/exceptions' && url.searchParams.get('domain') === 'receiving');

  console.log(JSON.stringify({
    ok: true,
    finalUrl: page.url(),
    screenshots: [
      `${outDir}/desktop-allocate.png`,
      `${outDir}/desktop-fbm-children.png`,
      `${outDir}/desktop-label-docs-views.png`,
    ],
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
