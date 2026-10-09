/**
 * Repair service intake — audit walkthrough (kiosk `/kiosk/v2`).
 *
 * Drives the counter repair flow with a clearly-marked TEST customer and
 * screenshots every step, so the operator can audit what the counter sees,
 * what the paperwork states, and what prints at the end:
 *
 *   1. Reason for repair   — a repair note
 *   2. Device & quote      — serial, price, device note
 *   3. Contact             — the "Test customer" key fills phone, name, email
 *                            and the full ship-to; the Shipping address row
 *                            stays CLOSED (showing the address) until tapped
 *   4. Review & sign       — the paperwork carries phone + Ship To; signature;
 *                            "create ticket"
 *   5. (--submit only)     — submits, then checks the end-of-visit face offers
 *                            BOTH prints (repair paperwork + receipt) and that
 *                            both documents carry the phone and the address.
 *
 * Without --submit nothing is written beyond the tablet's own cart: the run
 * stops on Review & sign. --submit creates a real repair_service row, customer
 * row and helpdesk ticket for the TEST customer.
 *
 * Lane law (AGENTS.md): runs ONLY against http://localhost:3050 and only while
 * this worktree is the pinned lane. It never starts or switches a server.
 *
 * Usage:
 *   node scripts/e2e-repair-intake-audit.mjs                 # dry run, headless
 *   node scripts/e2e-repair-intake-audit.mjs --headed        # watch it
 *   node scripts/e2e-repair-intake-audit.mjs --device "SoundLink"   # pick a catalog tile by name
 *   node scripts/e2e-repair-intake-audit.mjs --submit        # full flow + both prints
 *
 * Output: test-results/repair-intake-audit/<stamp>/NN-*.png + report.json
 */

import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const ORIGIN = 'http://localhost:3050';
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : (args[at + 1] ?? null);
};
const SUBMIT = flag('--submit');
const HEADED = flag('--headed');
const DEVICE = option('--device');
const STEP_TIMEOUT_MS = 30_000;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_ROOT = path.resolve('test-results/repair-intake-audit');
const OUT = path.join(OUT_ROOT, stamp);
/** Reused so every run is the SAME dev-paired tablet, not a new device row. */
const STATE_FILE = path.join(OUT_ROOT, 'kiosk-state.json');

const suffix = stamp.slice(11, 19).replace(/-/g, '');
/** Mirrors KIOSK_TEST_CUSTOMER (src/lib/kiosk/test-customer.ts) — the "Test customer" key fills these. */
const TEST = {
  phone: '555-555-0100',
  name: 'TEST CUSTOMER',
  email: 'test-customer@example.com',
  shipTo: {
    address1: '123 Audit Way',
    address2: 'Suite 9',
    city: 'Testville',
    state: 'CA',
    postalCode: '90210',
  },
  serial: `AUDIT-${suffix}`,
  price: '99.00',
  repairNote: 'AUDIT TEST — no power, please ignore',
  deviceNote: 'AUDIT TEST device note',
};
const SHIP_TO_LINE = '123 Audit Way, Suite 9, Testville CA 90210';

const report = { stamp, origin: ORIGIN, submitted: SUBMIT, test: TEST, steps: [], checks: [] };

function check(name, ok, detail = '') {
  report.checks.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function preflight() {
  const lane = `lane-${path.basename(process.cwd())}`;
  const pin = (await readFile(path.join(homedir(), '.config/cycleforge/switch-pin'), 'utf8').catch(() => '')).trim();
  if (pin !== lane) {
    throw new Error(`switch-pin is "${pin || 'unset'}", not ${lane} — this worktree is not the lane on :3050. Not running.`);
  }
  const res = await fetch(`${ORIGIN}/kiosk/v2`, { redirect: 'manual' }).catch((error) => {
    throw new Error(`${ORIGIN} is down (${error.message}). Not running.`);
  });
  const switchLane = res.headers.get('x-switch-lane');
  if (res.headers.get('x-switch-error') || res.status === 503 || (switchLane && switchLane !== lane)) {
    throw new Error(
      `${ORIGIN} answered ${res.status} lane=${switchLane ?? '—'} error=${res.headers.get('x-switch-error') ?? '—'}. Not running.`,
    );
  }
}

async function main() {
  await preflight();
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: !HEADED });
  const hasState = await readFile(STATE_FILE, 'utf8').then(() => true, () => false);
  const context = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    storageState: hasState ? STATE_FILE : undefined,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(STEP_TIMEOUT_MS);
  const byId = (id) => page.getByTestId(id);
  let shot = 0;
  const snap = async (label) => {
    shot += 1;
    const file = path.join(OUT, `${String(shot).padStart(2, '0')}-${label}.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.steps.push({ label, file });
    console.log(`  · ${label} → ${path.relative(process.cwd(), file)}`);
  };
  /** Empty this tablet's cart through the Cart pane's own Clear verb. */
  const clearCart = async () => {
    if (!(await byId('kiosk-cart-count').isVisible().catch(() => false))) return;
    await byId('kiosk-utility-cart').click();
    await byId('kiosk-cart-void-all').click();
    await byId('kiosk-cart-void-confirm').click();
    await byId('kiosk-cart-count').waitFor({ state: 'detached' });
    await page.goto(`${ORIGIN}/kiosk/v2`, { waitUntil: 'domcontentloaded' });
    await byId('kiosk-shell').waitFor();
  };

  try {
    await page.goto(`${ORIGIN}/kiosk/v2`, { waitUntil: 'domcontentloaded' });
    await byId('kiosk-shell').waitFor();
    await context.storageState({ path: STATE_FILE });

    // The audit's own tablet starts empty — an earlier dry run left its cart.
    await clearCart();

    // ── Repair command ──────────────────────────────────────────────────────
    await byId('kiosk-command-menu').first().click();
    await page.getByRole('option', { name: /^Repair/ }).first().click();
    await snap('catalog');

    // ── Device ──────────────────────────────────────────────────────────────
    const proceed = page.locator('[data-kiosk-continue]');
    if (DEVICE) {
      await byId('product-tile').filter({ hasText: DEVICE }).first().click();
    }
    for (let depth = 0; depth < 5 && !(await proceed.isVisible().catch(() => false)); depth += 1) {
      await byId('product-tile').first().click();
      await page.waitForTimeout(400);
    }
    await proceed.click();
    await byId('kiosk-repair-pane').waitFor();

    // ── 1. Reason ───────────────────────────────────────────────────────────
    await byId('kiosk-repair-reason-notes').fill(TEST.repairNote);
    await snap('step1-reason');
    await byId('kiosk-repair-continue').click();

    // ── 2. Device & quote ───────────────────────────────────────────────────
    await byId('kiosk-repair-serial').fill(TEST.serial);
    await byId('kiosk-repair-price').fill(TEST.price);
    await byId('kiosk-repair-notes').fill(TEST.deviceNote);
    await snap('step2-device');
    await byId('kiosk-repair-continue').click();

    // ── 3. Contact + shipping address behind its row ────────────────────────
    const toggle = byId('kiosk-customer-ship-to-toggle');
    check('shipping fields start closed', !(await byId('kiosk-customer-ship-to-fields').isVisible()));
    check('toggle says it is collapsed', (await toggle.getAttribute('aria-expanded')) === 'false');
    await snap('step3-contact-empty');
    await byId('kiosk-customer-fill-test').click();
    await page.keyboard.press('Escape'); // the floating phone keypad
    check('Test customer fills the phone', (await byId('kiosk-customer-phone').inputValue()) === TEST.phone, TEST.phone);
    check('Test customer fills the name', (await byId('kiosk-customer-name').inputValue()) === TEST.name, TEST.name);
    check('Test customer fills the email', (await byId('kiosk-customer-email').inputValue()) === TEST.email, TEST.email);
    const summary = (await byId('kiosk-customer-ship-to-summary').innerText()).trim();
    check('closed row names the address on file', summary === SHIP_TO_LINE, summary);
    await snap('step3-contact-filled');
    await toggle.click();
    check('toggle opens the full address fields', await byId('kiosk-customer-ship-to-fields').isVisible());
    for (const [field, value] of Object.entries(TEST.shipTo)) {
      const typed = await byId(`kiosk-customer-ship-${field}`).inputValue();
      check(`ship-to ${field} filled`, typed === value, typed);
    }
    await snap('step3-contact-open');
    await toggle.click();
    await byId('kiosk-repair-continue').click();

    // ── 4. Review & sign ────────────────────────────────────────────────────
    const pane = byId('kiosk-repair-pane');
    await page.waitForTimeout(500);
    const sheet = await pane.innerText();
    check('paperwork states the phone', sheet.includes(TEST.phone), TEST.phone);
    check('paperwork states Ship To', /Ship To:/.test(sheet) && sheet.includes(SHIP_TO_LINE), SHIP_TO_LINE);
    check('paperwork states the serial', sheet.includes(TEST.serial));
    await pane.getByText('Ship To:').first().scrollIntoViewIfNeeded();
    await snap('step4-review-sheet');
    const pad = pane.locator('canvas').first();
    await pad.scrollIntoViewIfNeeded();
    const box = await pad.boundingBox();
    assert.ok(box, 'signature pad not on screen');
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    for (let x = 20; x < Math.min(260, box.width - 10); x += 20) {
      await page.mouse.move(box.x + x, box.y + box.height / 2 + (x % 40 === 0 ? 12 : -12));
    }
    await page.mouse.up();
    await byId('kiosk-ticket-mode-create').click();
    await snap('step4-review-signed');

    if (!SUBMIT) {
      await clearCart();
      console.log('\nDry run — stopped on Review & sign (cart cleared). Re-run with --submit to write the TEST repair and check both prints.');
      return;
    }

    // ── 5. Submit → end-of-visit prints ─────────────────────────────────────
    const intake = page.waitForResponse((res) => res.url().includes('/api/kiosk/intake') && res.request().method() === 'POST');
    await byId('kiosk-repair-submit').click();
    const body = await (await intake).json();
    const visitId = body?.transaction?.counterTransactionId;
    await byId('kiosk-repair-success').waitFor();
    await snap('step5-done');
    check('visit recorded', Number.isInteger(visitId), `visit #${visitId}`);
    check('Print repair paperwork offered', await byId('kiosk-print-repair-paperwork').isVisible());
    check('Print receipt offered', await byId('kiosk-print-customer-receipt').isVisible());

    const paperwork = await page.request.get(`${ORIGIN}/api/kiosk/visit/${visitId}/paperwork`);
    const paperHtml = await paperwork.text();
    await writeFile(path.join(OUT, 'paperwork.html'), paperHtml);
    check('paperwork prints', paperwork.ok(), String(paperwork.status()));
    check('printed paperwork carries the phone', paperHtml.includes(TEST.phone));
    check('printed paperwork carries Ship To', paperHtml.includes(SHIP_TO_LINE));

    const receipt = await page.request.get(`${ORIGIN}/api/kiosk/visit/${visitId}/receipt`);
    const receiptHtml = await receipt.text();
    await writeFile(path.join(OUT, 'receipt.html'), receiptHtml);
    check('receipt prints', receipt.ok(), String(receipt.status()));
    check('receipt carries the phone', receiptHtml.includes(TEST.phone));
    check('receipt carries the address', receiptHtml.includes(SHIP_TO_LINE));

    const popup = context.waitForEvent('page');
    await byId('kiosk-print-repair-paperwork').click();
    const printWindow = await popup;
    await printWindow.waitForLoadState('domcontentloaded');
    check('paperwork button opens the paperwork print', printWindow.url().includes(`/api/kiosk/visit/${visitId}/paperwork`), printWindow.url());
    await printWindow.close();
  } catch (error) {
    await snap('failure').catch(() => {});
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\nReport: ${path.relative(process.cwd(), path.join(OUT, 'report.json'))}`);
    await browser.close();
  }

  const failed = report.checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
