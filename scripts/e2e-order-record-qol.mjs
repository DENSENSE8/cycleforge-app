/**
 * End-to-end check of the order record's quality-of-life features against the
 * RUNNING lane (AGENTS.md: :3050 only — this script never starts a server).
 *
 *   node scripts/e2e-order-record-qol.mjs            # seed order CF-ML-5LINE-SEED (row 13633)
 *   E2E_ORDER_ID=<orders.id> node scripts/e2e-order-record-qol.mjs
 *
 * It reuses the saved Playwright session (`tests/.auth/admin.json`, minted by
 * `tests/shot.mjs`). The tracking round-trip REPLACES the order's tracking with
 * a throwaway number and then UNDOES it through the toast, so the order ends
 * where it started; it fails loudly (and restores) if the undo does not land.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import process from 'node:process';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3050';
const STORAGE = 'tests/.auth/admin.json';
// A SEED order by default: the tracking round-trip leaves `orders.tracking.replaced`
// audit rows (append-only), which belong on test data, not a customer's order.
const ORDER_ID = Number(process.env.E2E_ORDER_ID || 13633);

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
const byTestId = (id) => page.locator(`[data-testid="${id}"]`).first();
/** Record keys ignore typing targets (the page's Find field autofocuses): drop focus first. */
const blur = () => page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));

let original = null;
let originalNumber = null;
try {
  await page.goto(`/shipping/orders?openOrderId=${ORDER_ID}`, { waitUntil: 'networkidle' });
  assert.ok(!page.url().includes('/signin'), 'session expired — re-mint tests/.auth/admin.json');
  await byTestId('order-record-view').waitFor({ timeout: 20_000 });

  await step('view switch is one radiogroup (In place · Split · Floor)', async () => {
    const group = page.locator('[data-testid="desk-record-view-switch"]').first();
    await group.waitFor();
    assert.equal(await group.getAttribute('role'), 'radiogroup');
    assert.ok(await page.locator('[data-testid="desk-record-view-in-place"]').first().isVisible());
    assert.ok(await page.locator('[data-testid="desk-record-view-split"]').first().isVisible());
  });

  await step('header carries the print-slip icon', async () => {
    const button = byTestId('order-record-print-slip');
    await button.waitFor();
    assert.equal(await button.getAttribute('aria-label'), 'Print packing slip');
  });

  await step('notes: no caption, no idle "Autosaves"', async () => {
    const notes = byTestId('order-record-notes');
    await notes.waitFor();
    const text = await notes.innerText();
    assert.ok(!/Autosaves/.test(text), 'idle status text is shown');
    assert.ok(!/Order note/.test(text), 'the "Order note" caption is shown');
    await byTestId('order-note-composer').waitFor();
  });

  await step('N focuses the note composer', async () => {
    await blur();
    await page.keyboard.press('n');
    await page.waitForTimeout(200);
    const focused = await page.evaluate(() => document.activeElement?.closest('[data-testid="order-note-composer"]') != null);
    assert.ok(focused, 'the composer does not hold focus');
    await blur();
  });

  await step('E toggles Shipping edit', async () => {
    await blur();
    await page.keyboard.press('e');
    await byTestId('order-record-ship-to-form').waitFor({ timeout: 3_000 });
    await blur();
    await page.keyboard.press('e');
    await byTestId('order-record-ship-to-form').waitFor({ state: 'detached', timeout: 3_000 });
  });

  await step('tracking line: pencil sits left of the external link', async () => {
    const chip = byTestId('evidence-tracking-chip');
    await chip.waitFor();
    original = await page.evaluate(() => {
      const chip = document.querySelector('[data-testid="evidence-tracking-chip"]');
      const pencil = chip?.querySelector('[data-testid="order-record-tracking-replace"]');
      const open = chip?.querySelector('a[aria-label="Open tracking number"]');
      if (pencil && open) {
        const order = pencil.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING;
        if (!order) throw new Error('pencil is not before ↗');
      }
      return chip?.textContent ?? null;
    });
    assert.ok(original !== null);
  });

  const hadTracking = !/No tracking yet/.test(original ?? '');
  if (hadTracking) {
    const throwaway = `E2E${Date.now()}`;
    await step('T opens Replace; Replace commits; Undo restores', async () => {
      await blur();
      await page.keyboard.press('t');
      const field = byTestId('tracking-replace-field');
      await field.waitFor({ timeout: 3_000 });
      const input = field.locator('input').first();
      assert.ok(await input.evaluate((el) => el === document.activeElement), 'Replace field is not focused');
      // The number being replaced, as the field states it ("Replaces <old>").
      originalNumber = (await field.locator('.line-through').first().textContent())?.trim() ?? null;
      assert.ok(originalNumber, 'the field does not state what it replaces');
      // Never void a real label from a test: untick the void box when shown.
      const voidBox = field.getByRole('checkbox');
      if ((await voidBox.count()) && (await voidBox.getAttribute('aria-checked')) === 'true') await voidBox.click();
      await input.fill(throwaway);
      await input.press('Enter');
      await page.waitForFunction((n) => document.querySelector('[data-testid="evidence-tracking-chip"]')?.textContent?.includes(n), throwaway, { timeout: 10_000 });
      const undo = page.locator('[data-sonner-toast] button', { hasText: 'Undo' }).last();
      await undo.waitFor({ state: 'attached', timeout: 5_000 });
      // Sonner stacks and animates its toasts; fire the button's click directly.
      await undo.dispatchEvent('click');
      await page.waitForFunction((n) => !document.querySelector('[data-testid="evidence-tracking-chip"]')?.textContent?.includes(n), throwaway, { timeout: 10_000 });
    });

    await step('tracking history lists the replaced number', async () => {
      const history = await page.evaluate(async (id) => (await fetch(`/api/orders/${id}/tracking-history`)).json(), ORDER_ID);
      assert.ok(Array.isArray(history.entries), 'no entries array');
      assert.ok(history.entries.some((e) => /^E2E\d+$/.test(e.trackingNumber)), 'the throwaway number is not in history');
    });
  } else {
    results.push('skip tracking round-trip (order has no tracking)');
  }

  await step('Esc closes Replace without saving', async () => {
    await blur();
    await page.keyboard.press('t');
    const field = byTestId('tracking-replace-field');
    if (!(await field.count())) return; // desk without facts
    await page.keyboard.press('Escape');
    await field.waitFor({ state: 'detached', timeout: 3_000 });
  });

  // With a record open, bare `?` belongs to the strip's inline letters; the
  // full sheet is ⌘/Ctrl+Shift+? from anywhere.
  await step('shortcut sheet lists "This record"', async () => {
    await blur();
    await page.keyboard.press('Control+Shift+Slash');
    await page.getByText('This record').first().waitFor({ timeout: 3_000 });
    await page.keyboard.press('Escape');
  });

  await step('duplicate-order route answers', async () => {
    const status = await page.evaluate(async (id) => (await fetch(`/api/orders/${id}/possible-duplicates`)).status, ORDER_ID);
    assert.equal(status, 200);
  });

  await step('summary bar appears once the record scrolls', async () => {
    const bar = byTestId('order-record-summary-bar');
    await bar.waitFor({ state: 'attached' });
    await page.evaluate(() => {
      const view = document.querySelector('[data-testid="order-record-view"]');
      let el = view?.parentElement ?? null;
      while (el && !(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      (el ?? document.scrollingElement)?.scrollBy(0, 900);
    });
    await page.waitForTimeout(500);
    const shown = await bar.evaluate((el) => getComputedStyle(el).opacity !== '0' && el.getAttribute('aria-hidden') !== 'true');
    assert.ok(shown, 'the bar did not appear');
  });

} finally {
  // Never leave a throwaway number on a real order: put the original back if Undo did not.
  const chip = await page.locator('[data-testid="evidence-tracking-chip"]').first().textContent().catch(() => null);
  const leftover = chip?.match(/E2E\d+/)?.[0];
  if (leftover && originalNumber && !originalNumber.startsWith('E2E')) {
    await page.evaluate(
      async ([id, tracking]) =>
        fetch('/api/orders/assign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: id, shippingTrackingNumber: tracking }) }),
      [ORDER_ID, originalNumber],
    );
    results.push(`note restored tracking ${originalNumber} after a failed undo`);
  }
  await browser.close();
}

console.log(results.join('\n'));
const failed = results.filter((line) => line.startsWith('FAIL'));
if (failed.length > 0) {
  console.error(`\n${failed.length} step(s) failed`);
  process.exit(1);
}
