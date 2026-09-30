/**
 * End-to-end check of the held-Shift saved-view digit reveal on FBM › Allocate
 * (`/shipping/orders`) against the RUNNING lane (AGENTS.md: :3050 only — this
 * script never starts a server).
 *
 *   node scripts/e2e-saved-view-digits.mjs
 *
 * Reuses the saved Playwright session (`tests/.auth/admin.json`, minted by
 * `tests/shot.mjs`). If the surface has fewer than two saved views it mints
 * two throwaway ones ("Test · Shift-digits A/B") through the sidebar UI, and
 * leaves them for the operator to try (delete with the row's ×).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3050';
const STORAGE = 'tests/.auth/admin.json';

if (!fs.existsSync(STORAGE)) {
  console.error(`No session at ${STORAGE} — run \`node tests/shot.mjs /shipping/orders /tmp/x.png\` once to mint it.`);
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: STORAGE, baseURL: BASE_URL, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
  }
};
/** Record keys ignore typing targets (the page's Find field autofocuses): drop focus first. */
const blur = () => page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
const presetRow = (n) => page.locator('[data-nav-preset]').nth(n);
const shot = async (name) => page.screenshot({ path: `/tmp/saved-view-digits-${name}.png` });

try {
  await page.goto('/shipping/orders', { waitUntil: 'networkidle' });
  assert.ok(!page.url().includes('/signin'), 'session expired — re-mint tests/.auth/admin.json');
  await page.locator('[data-nav-filters]').waitFor({ timeout: 20_000 });

  // Mint two throwaway saved views if the surface has none to reveal.
  let viewCount = await page.locator('[data-nav-preset]').count();
  if (viewCount < 2) {
    for (const [label, sortLabel] of [
      ['Test · Shift-digits A', 'Newest orders first'],
      ['Test · Shift-digits B', 'Most overdue first'],
    ]) {
      await page.locator('[data-nav-filter="sort"] button').first().click();
      await page.locator(`[data-nav-sort-option="${sortLabel === 'Newest orders first' ? 'newest' : 'age'}"]`).click();
      await page.locator('[data-nav-preset-save]').waitFor({ timeout: 5_000 });
      await page.locator('[data-nav-preset-save]').click();
      await page.locator('[data-nav-preset-name]').fill(label);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(600); // POST + refetch settle
    }
    viewCount = await page.locator('[data-nav-preset]').count();
  }
  const capped = Math.min(viewCount, 9);
  const names = await page.locator('[data-nav-preset] span[title]').allTextContents();
  console.log(`saved views on rail (${viewCount}): ${names.join(' | ')}`);

  await step('reveal: holding Shift paints a digit on every row (first nine)', async () => {
    await blur();
    await page.keyboard.down('Shift');
    await page.locator('[data-nav-preset-digit]').first().waitFor({ timeout: 3_000 });
    await shot('shift-held');
    assert.equal(await page.locator('[data-nav-preset-digit]').count(), capped, 'every capped row paints its digit');
    // The badge attr rides on the row button; the digit itself is the row's kbd cap.
    const digits = await page.locator('[data-nav-preset-digit] kbd').allTextContents();
    assert.deepEqual(digits, Array.from({ length: capped }, (_, i) => String(i + 1)), 'digits run 1..N in list order');
  });

  await step('jump: Shift+2 applies the second saved view', async () => {
    await page.keyboard.press('2'); // Shift is still down — the page sees key '@', code Digit2
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nav-preset]')[1]?.getAttribute('aria-pressed') === 'true',
      undefined,
      { timeout: 5_000 },
    );
    await shot('jumped-to-2');
  });

  await step('toggle: Shift+2 on the lit view clears it', async () => {
    await page.keyboard.press('2');
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nav-preset]')[1]?.getAttribute('aria-pressed') !== 'true',
      undefined,
      { timeout: 5_000 },
    );
  });

  await step('guard: Shift+1 inside an input never jumps', async () => {
    await page.locator('input:visible').first().focus();
    const before = page.url();
    await page.keyboard.press('1');
    await page.waitForTimeout(400);
    assert.equal(page.url(), before, 'the URL did not move');
    assert.notEqual(await presetRow(0).getAttribute('aria-pressed'), 'true', 'view 1 was not applied');
    await blur();
  });

  await step('release: digits vanish when Shift comes up', async () => {
    await page.keyboard.up('Shift');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('[data-nav-preset-digit]').count(), 0, 'no badge survives the release');
    await shot('shift-released');
  });

  await step('cheat sheet: `?` teaches the reveal and the digits', async () => {
    await blur();
    await page.keyboard.press('?');
    await page.waitForTimeout(600);
    const sheet = await page.locator('[role="dialog"]').innerText().catch(() => '');
    assert.ok(/Saved views — left rail/.test(sheet), 'the group is listed');
    assert.ok(/Hold to show each view’s digit/.test(sheet), 'the reveal row is listed');
    await page.keyboard.press('Escape');
  });
} catch (error) {
  results.push(`FAIL harness: ${error instanceof Error ? error.message : error}`);
  await shot('failure').catch(() => {});
} finally {
  await browser.close();
  console.log(results.join('\n'));
  process.exitCode = results.some((r) => r.startsWith('FAIL')) ? 1 : 0;
}
