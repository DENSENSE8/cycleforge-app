/** Read-only proof for the canonical mobile navigation hierarchy. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3050';
const STORAGE = 'tests/.auth/admin.json';
const OUT_DIR = process.env.SHOT_DIR || '/tmp';
const SHOTS = {
  root: `${OUT_DIR}/cycleforge-mobile-navigation-root.png`,
  fulfillment: `${OUT_DIR}/cycleforge-mobile-navigation-fulfillment.png`,
  fbm: `${OUT_DIR}/cycleforge-mobile-navigation-fbm.png`,
};
const EXPECTED_FAMILIES = ['Workspace', 'Operations', 'Utilities'];
const EXPECTED_OPERATIONS = ['Scan Stations', 'Sales', 'Receiving', 'Fulfillment', 'Warehouse', 'Products'];

assert.ok(fs.existsSync(STORAGE), `No saved session at ${STORAGE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  storageState: STORAGE,
  baseURL: BASE_URL,
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
page.on('pageerror', (error) => console.error('pageerror', error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.error('browser-console', message.text());
});

async function hideDevOverlay() {
  await page.locator('nextjs-portal').evaluateAll((nodes) => {
    for (const node of nodes) node.setAttribute('hidden', '');
  });
}

async function tap(locator) {
  await hideDevOverlay();
  await locator.click();
}

try {
  await page.goto('/m/home', { waitUntil: 'domcontentloaded' });
  assert.ok(!page.url().includes('/signin'), 'saved browser session expired');

  const trigger = page.getByTestId('mobile-v2-app-switcher');
  await trigger.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3_000); // let the dev server finish client hydration before the first tap
  await tap(trigger);
  await page.waitForTimeout(500);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true', 'application trigger did not open');

  const panel = page.getByTestId('mobile-app-switcher-panel');
  await panel.waitFor();
  const familyTiles = page.getByTestId('mobile-nav-family-list').locator(':scope > li > *');
  assert.deepEqual(await familyTiles.locator('[data-nav-label]').allTextContents(), EXPECTED_FAMILIES);

  for (const tile of await familyTiles.all()) {
    const box = await tile.boundingBox();
    assert.ok(box && box.height >= 112, 'every root family must retain a large touch target');
    assert.ok(box && box.width >= 150, 'the popover must retain a readable two-column tile grid');
  }
  assert.equal(await page.getByTestId('mobile-nav-family-secondary').count(), 0, 'desktop-only parents must be omitted');
  assert.match(await panel.getAttribute('class'), /bg-surface-card/, 'navigation canvas must remain white');
  assert.equal(await trigger.getAttribute('aria-label'), 'Close applications');
  await hideDevOverlay();
  await page.screenshot({ path: SHOTS.root, fullPage: false });

  await tap(page.getByTestId('mobile-nav-family-business'));
  assert.equal(await page.getByRole('navigation', { name: 'Operations destinations' }).count(), 1);
  assert.equal(await trigger.getAttribute('aria-label'), 'Back to applications');
  assert.equal(await page.getByTestId('mobile-nav-back').count(), 0, 'popover must not render a second header');
  const operationRows = page.getByTestId('mobile-nav-operation-list').locator(':scope > li > button');
  assert.deepEqual(await operationRows.locator('[data-nav-label]').allTextContents(), EXPECTED_OPERATIONS);

  await tap(page.getByTestId('mobile-nav-parent-fulfillment'));
  assert.equal(await page.getByRole('navigation', { name: 'Fulfillment destinations' }).count(), 1);
  assert.equal(await trigger.getAttribute('aria-label'), 'Back to Operations');
  assert.equal(await page.getByTestId('mobile-nav-destination-fulfilled').count(), 0);
  assert.equal(await page.getByTestId('mobile-nav-destination-fba').count(), 0);
  await hideDevOverlay();
  await page.screenshot({ path: SHOTS.fulfillment, fullPage: false });

  await tap(page.getByTestId('mobile-nav-parent-fbm'));
  assert.equal(await page.getByRole('navigation', { name: 'FBM destinations' }).count(), 1);
  assert.equal(await trigger.getAttribute('aria-label'), 'Back to Fulfillment');
  assert.equal(await page.getByTestId('mobile-nav-destination-orders').count(), 1);
  assert.equal(await page.getByTestId('mobile-nav-destination-label-intake').count(), 0, 'unported Labels & docs must be omitted');
  assert.equal(await page.getByTestId('mobile-nav-destination-exceptions').count(), 0, 'Exceptions is never an FBM child');
  assert.equal(await page.getByTestId('mobile-nav-destination-pick').count(), 0);
  await hideDevOverlay();
  await page.screenshot({ path: SHOTS.fbm, fullPage: false });

  await tap(trigger);
  assert.equal(await page.getByRole('navigation', { name: 'Fulfillment destinations' }).count(), 1);
  await tap(trigger);
  assert.equal(await page.getByRole('navigation', { name: 'Operations destinations' }).count(), 1);
  await tap(trigger);
  assert.equal(await page.getByTestId('mobile-nav-family-list').count(), 1);

  await page.keyboard.press('Escape');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'Escape must close the anchored popover');
  await tap(trigger);
  assert.equal(await page.getByTestId('mobile-nav-family-list').count(), 1);
  await page.mouse.click(425, 925);
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false', 'an outside press must close the anchored popover');
  await tap(trigger);

  await tap(page.getByTestId('mobile-nav-family-business'));
  await tap(page.getByTestId('mobile-nav-parent-inventory'));
  await tap(page.getByTestId('mobile-nav-destination-stock'));
  await page.waitForURL(/\/m\/stock(?:$|[/?#])/);

  console.log(JSON.stringify({
    ok: true,
    families: EXPECTED_FAMILIES,
    operations: EXPECTED_OPERATIONS,
    finalUrl: page.url(),
    screenshots: Object.values(SHOTS),
  }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
