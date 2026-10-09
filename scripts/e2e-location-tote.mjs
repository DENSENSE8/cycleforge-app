/**
 * End-to-end check of the phone's location → tote loop against the RUNNING
 * lane (AGENTS.md: :3050 only — this script never starts a server):
 *
 *   - a location typed in any spelling (`c02094`, `c-2-9-4`) lands on the real
 *     address; a typo offers "Did you mean" and never registers a location;
 *   - Load tote: the number pad keys the tote, an unknown number disables Move;
 *   - with E2E_MUTATE=1, Move really loads the shelf into the tote, the done
 *     screen stays up, and the script moves every unit BACK to the shelf.
 *
 *   node scripts/e2e-location-tote.mjs
 *   E2E_LOCATION=C0201200 E2E_TOTE=381 E2E_MUTATE=1 node scripts/e2e-location-tote.mjs
 *
 * Reuses the saved Playwright session (`tests/.auth/admin.json`, minted by
 * `tests/shot.mjs`).
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';
import { chromium, devices } from '@playwright/test';

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3050';
const STORAGE = 'tests/.auth/admin.json';
/** A Zone 3 shelf with loose stock, and an open house tote. */
const LOCATION = (process.env.E2E_LOCATION || 'C0201200').toUpperCase();
const TOTE_ID = Number(process.env.E2E_TOTE || 381);
const MUTATE = process.env.E2E_MUTATE === '1';

if (!fs.existsSync(STORAGE)) {
  console.error(`No session at ${STORAGE} — run \`node tests/shot.mjs /m/stock /tmp/x.png\` once to mint it.`);
  process.exit(2);
}

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['iPhone 13'], storageState: STORAGE, baseURL: BASE_URL });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (error) {
    const shot = `test-results/e2e-location-tote-${results.length + 1}.png`;
    await page.screenshot({ path: shot }).catch(() => undefined);
    // Playwright's call log names the locator that timed out.
    const detail = error instanceof Error ? error.message.split('\n').filter((line) => /waiting for|locator\(|getBy/.test(line)).slice(0, 2).join(' | ') : '';
    results.push(`FAIL ${name}: ${error instanceof Error ? error.message.split('\n')[0] : error}${detail ? ` [${detail.trim()}]` : ''} (${shot})`);
  }
};
const byTestId = (id) => page.locator(`[data-testid="${id}"]`).first();
/** The tote sheet's number pad (the item list has its own Clear). */
const pad = () => page.getByRole('group', { name: 'Tote number' });
const api = async (path, init = {}) => {
  const response = await page.request.fetch(path, init);
  return { status: response.status(), body: await response.json().catch(() => null) };
};
const stockAt = async (code) => {
  const { status, body } = await api(`/api/locations/${encodeURIComponent(code)}`);
  if (status === 404) return new Map();
  assert.equal(status, 200, `GET ${code} → ${status}`);
  return new Map((body.contents ?? []).filter((row) => row.qty > 0).map((row) => [row.sku, row.qty]));
};
const toteCode = `H-${TOTE_ID}`;
let loaded = null;

try {
  await page.goto('/m/stock', { waitUntil: 'networkidle' });
  assert.ok(!page.url().includes('/signin'), 'session expired — re-mint tests/.auth/admin.json');

  await step('typed spellings land on the real address', async () => {
    for (const typed of ['c02094', 'c-2-9-4', 'C 02 09 4']) {
      await page.goto(`/m/loc/${encodeURIComponent(typed)}`);
      await byTestId('mobile-v2-location').waitFor({ timeout: 20_000 });
      await page.waitForURL(/\/C0209400(\?|$)/, { timeout: 10_000 });
    }
  });

  await step('a typo offers "Did you mean" and registers nothing', async () => {
    await page.goto('/m/loc/c02994');
    const choices = page.getByRole('group', { name: 'Did you mean' });
    await choices.waitFor({ timeout: 20_000 });
    assert.ok((await choices.getByRole('button').count()) > 0, 'no suggestion buttons');
    const { status } = await api('/api/locations/C0299400');
    assert.equal(status, 404, 'the typo minted a location');
  });

  await step('the server resolves a typed code and returns its real barcode', async () => {
    const { status, body } = await api('/api/locations/c-2-9-4');
    assert.equal(status, 200);
    assert.equal(body.location.barcode, 'C0209400');
  });

  await page.goto(`/m/loc/${LOCATION}`);
  await byTestId('mobile-v2-location').waitFor({ timeout: 20_000 });
  const before = await stockAt(LOCATION);

  await step('Load tote goes step by step: items → scan → number pad', async () => {
    await byTestId('location-park-tote').click();
    if (before.size > 0) {
      // Step 1: items only — no scanner and no pad on screen yet.
      await byTestId('location-tote-sheet').waitFor();
      assert.ok((await page.locator('[data-testid="location-tote-item"]').count()) > 0, 'no item rows');
      assert.equal(await pad().count(), 0, 'the pad shows on the items step');
      const autoAll = page.getByRole('switch', { name: 'Auto-add all items' });
      if ((await autoAll.getAttribute('data-state')) !== 'checked') await autoAll.click();
      await byTestId('location-tote-items-next').click();
    }
    // Step 2: scan the tote — the pad is a fallback, not on screen.
    await byTestId('location-tote-scan').waitFor();
    assert.equal(await pad().count(), 0, 'the pad shows on the scan step');
    await byTestId('location-tote-type-number').click();
    await pad().waitFor();
    await byTestId('location-tote-readout').waitFor();
  });

  await step('an unknown tote number disables Move', async () => {
    await pad().getByRole('button', { name: 'Clear' }).click();
    for (const digit of '999999') await pad().getByRole('button', { name: `digit ${digit}`, exact: true }).click();
    assert.match(await byTestId('location-tote-readout').innerText(), /No open tote H-999999/);
    const move = byTestId(before.size > 0 ? 'location-tote-move' : 'location-park-tote-submit');
    assert.ok(await move.isDisabled(), 'Move is enabled for a tote that does not exist');
  });

  await step(`the pad keys ${toteCode}`, async () => {
    await pad().getByRole('button', { name: 'Clear' }).click();
    for (const digit of String(TOTE_ID)) await pad().getByRole('button', { name: `digit ${digit}`, exact: true }).click();
    assert.match(await byTestId('location-tote-readout').innerText(), new RegExp(toteCode));
    if (before.size > 0) {
      const move = byTestId('location-tote-move');
      assert.ok(await move.isEnabled(), 'Move is disabled for an open tote');
      assert.match(await move.innerText(), new RegExp(`into ${toteCode}`));
    }
  });

  if (MUTATE && before.size > 0) {
    const toteBefore = await stockAt(toteCode);
    await step('Move loads the shelf into the tote; the done screen stays', async () => {
      await byTestId('location-tote-move').click();
      loaded = new Map(before);
      await byTestId('location-tote-done').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      assert.ok(await byTestId('location-tote-done').isVisible(), 'the done screen closed itself');
      const shelf = await stockAt(LOCATION);
      const tote = await stockAt(toteCode);
      for (const [sku, qty] of before) {
        assert.equal(shelf.get(sku) ?? 0, 0, `${sku} still on the shelf`);
        assert.equal(tote.get(sku) ?? 0, (toteBefore.get(sku) ?? 0) + qty, `${sku} not in the tote`);
      }
    });
    await step('the location row shows the tote as a stock tote', async () => {
      await page.keyboard.press('Escape');
      await page.reload();
      const row = page.locator('[data-testid="location-lpn-row"]', { hasText: toteCode });
      if (await row.count()) assert.match(await row.first().innerText(), /Stock tote|In tote/);
    });
  } else if (MUTATE) {
    results.push(`note ${LOCATION} has no loose stock — Move was not exercised`);
  }
} finally {
  // Put every moved unit back on the shelf, whatever failed above.
  if (loaded) {
    for (const [sku, qty] of loaded) {
      const key = crypto.randomUUID();
      const { status, body } = await api('/api/transfers', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
        data: { fromBinBarcode: toteCode, toBinBarcode: LOCATION, sku, qty, notes: 'e2e-location-tote restore' },
      });
      results.push(status === 200 ? `note restored ${qty} × ${sku} to ${LOCATION}` : `FAIL restore ${sku}: ${status} ${body?.message ?? body?.error ?? ''}`);
    }
  }
  if (pageErrors.length > 0) results.push(`FAIL page errors: ${[...new Set(pageErrors)].join(' | ')}`);
  await browser.close();
}

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length > 0) {
  console.error(`\n${failed.length} step(s) failed`);
  process.exit(1);
}
