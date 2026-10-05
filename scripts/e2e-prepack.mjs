/**
 * Browser proof for the prepack desk triage (HANDOFF-prepack-desk-triage-2026-10-05):
 *   1 the three desk panes sit edge to edge        5 two serials → one package, one label, no location (packing stores it)
 *   2 the mode title sits at the top (both)         6 a never-seen serial is accepted (no Unbox gate)
 *   3 the saved view and copy read "All"            7 Products ≠ Recently printed; both load the form
 *   4 desk types serials, the phone scans them      8 Find narrows Products; one click loads the form
 *   + product photos load in Products, the form's product search, Recently printed and the QC labels ledger
 *
 * Writes: two throwaway serials (`E2E-PP-…-A/-B`) created through the unknown-serial
 * path, their typed evidence photos, their one package and its one print-job row. Nothing
 * else in inventory is touched. Runs against :3050 only.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:3050';
const STORAGE = 'tests/.auth/admin.json';
const OUT_DIR = process.env.SHOT_DIR || '/tmp/cycleforge-prepack';
const TEST_SKU = '00326-BK';
const RUN = Date.now().toString(36).toUpperCase();
const SERIAL_A = `E2E-PP-${RUN}-A`;
const SERIAL_B = `E2E-PP-${RUN}-B`;
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');

assert.ok(fs.existsSync(STORAGE), `No saved session at ${STORAGE}`);
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL must be set in .env');
fs.mkdirSync(OUT_DIR, { recursive: true });

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
const browser = await chromium.launch();
const phoneViewport = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const deskContext = await browser.newContext({ storageState: STORAGE, baseURL: BASE_URL, viewport: { width: 1440, height: 960 } });
const phoneContext = await browser.newContext({ storageState: STORAGE, baseURL: BASE_URL, ...phoneViewport });
const desk = await deskContext.newPage();
const phone = await phoneContext.newPage();
for (const [name, page] of [['desk', desk], ['phone', phone]]) {
  page.on('pageerror', (error) => console.error(`${name} pageerror`, error.message));
}

const shots = [];
const proof = {};
async function shot(page, name) {
  await page.locator('nextjs-portal').evaluateAll((nodes) => nodes.forEach((node) => node.setAttribute('hidden', '')));
  const file = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  shots.push(file);
}
const step = (page, id) => page.locator(`[data-testid="prepack-flow"][data-prepack-step="${id}"]`).waitFor({ timeout: 30_000 });
const query = (page) => new URL(page.url()).searchParams;
const box = async (locator) => {
  const b = await locator.boundingBox();
  assert.ok(b, 'element has no box');
  return b;
};
/** DetailDock swallows a second press within 500 ms (double-tap lock) — press like an operator. */
async function dock(page, testId) {
  await page.waitForTimeout(600);
  await page.getByTestId(testId).click();
}

/**
 * Every product thumb that names a photo must finish loading it (naturalWidth > 0) or fall
 * back to initials (a URL that fails — reported, never a broken image); at least one must load.
 * Thumbs lazy-load, so each is scrolled into view first — what an operator scrolling sees.
 */
async function thumbsLoad(scope, where) {
  const thumbs = scope.locator('[data-testid="product-thumb"]');
  await thumbs.first().waitFor({ timeout: 20_000 });
  for (const thumb of await thumbs.all()) {
    if ((await thumb.getAttribute('data-has-photo')) !== 'true') continue;
    await thumb.scrollIntoViewIfNeeded();
    await thumb.evaluate((node) => {
      const img = node.querySelector('img');
      if (!img || (img.complete && img.naturalWidth > 0)) return null;
      return new Promise((done) => {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        setTimeout(done, 10_000);
      });
    });
  }
  await scope.page().waitForTimeout(300);
  const faces = await thumbs.evaluateAll((nodes) => nodes.map((node) => {
    const img = node.querySelector('img');
    return {
      photo: node.getAttribute('data-has-photo') === 'true',
      failed: node.getAttribute('data-photo-failed') === 'true',
      loaded: Boolean(img && img.complete && img.naturalWidth > 0),
      src: img?.getAttribute('src') ?? null,
    };
  }));
  const broken = faces.filter((face) => face.photo && !face.loaded);
  assert.equal(broken.length, 0, `${where}: photos neither loaded nor fell back ${JSON.stringify(broken.slice(0, 3))}`);
  const loaded = faces.filter((face) => face.loaded).length;
  assert.ok(loaded > 0, `${where}: no product photo loaded (${faces.length} thumbs)`);
  const failed = faces.filter((face) => face.failed).length;
  return { loaded, failedUpstream: failed, initials: faces.length - loaded - failed };
}

async function unitLookup(serial) {
  const response = await deskContext.request.get(`/api/prepack/unit?scan=${encodeURIComponent(serial)}`);
  assert.equal(response.status(), 200, `unit lookup ${serial} → ${response.status()}`);
  return response.json();
}

async function upload(unitId, serial, aspect) {
  const response = await phoneContext.request.post('/api/photos/upload', {
    multipart: {
      file: { name: `prepack-${aspect}.png`, mimeType: 'image/png', buffer: TINY_PNG },
      entityType: 'SERIAL_UNIT',
      entityId: String(unitId),
      photoType: 'prepack',
      photoAspect: aspect,
      poRef: serial,
    },
  });
  assert.ok(response.ok(), `${aspect} upload failed (${response.status()}): ${(await response.text()).slice(0, 300)}`);
}

try {
  const catalog = await (await deskContext.request.get(`/api/prepack/catalog?sku=${encodeURIComponent(TEST_SKU)}`)).json();
  const testCatalogId = catalog.items?.[0]?.id;
  assert.ok(testCatalogId > 0, `${TEST_SKU} must exist in the catalog`);

  // ── 6. A never-seen serial is a new serial, not a 404 ───────────────────
  for (const serial of [SERIAL_A, SERIAL_B]) {
    const lookup = await unitLookup(serial);
    assert.equal(lookup.unit, null);
    assert.equal(lookup.newSerial, serial, 'an unknown serial answers newSerial');
  }
  proof.unknownSerial = 'GET /api/prepack/unit → 200 { unit: null, newSerial }';

  // ── 3. Saved view + empty-state copy read "All" ─────────────────────────
  await desk.goto('/inventory/qc-labels?q=zz-no-such-label-zz', { waitUntil: 'domcontentloaded' });
  assert.ok(!desk.url().includes('/signin'), 'desk session expired');
  await desk.getByText('No QC labels match. Clear Find or choose All.').waitFor({ timeout: 30_000 });
  await desk.getByText('All', { exact: true }).first().waitFor({ timeout: 15_000 });
  assert.equal(await desk.getByText('ALL', { exact: true }).count(), 0, 'no all-caps ALL anywhere');
  proof.savedView = 'All';

  // ── Photos: the QC labels ledger paints each labelled product's photo ───
  await desk.goto('/inventory/qc-labels', { waitUntil: 'domcontentloaded' });
  proof.photos = { qcLabels: await thumbsLoad(desk.getByTestId('qc-labels-table'), 'QC labels ledger') };
  await shot(desk, 'desk-0-ledger-photos');

  // ── 1 + 2. Desk panes edge to edge; mode title at the top ───────────────
  await desk.goto('/inventory/qc-labels?task=prepack', { waitUntil: 'domcontentloaded' });
  // A dev-server navigation can paint a hidden second tree for a beat; wait for the one settled task.
  await desk.waitForFunction(() => document.querySelectorAll('[data-testid="prepack-mode-choice"]').length === 1, null, { timeout: 30_000 });
  await desk.getByTestId('prepack-mode-choice').waitFor({ timeout: 30_000 });
  const products = desk.getByTestId('prepack-products-column');
  const frame = desk.getByTestId('qc-labels-prepack-frame');
  const printedColumn = desk.getByTestId('prepack-printed-column');
  const [left, middle, right] = [await box(products), await box(frame), await box(printedColumn)];
  const modeMain = await box(desk.getByTestId('prepack-mode-choice'));
  assert.ok(Math.abs(left.x + left.width - middle.x) < 0.5, `gap left|middle: ${left.x + left.width} vs ${middle.x}`);
  assert.ok(Math.abs(middle.x + middle.width - right.x) < 0.5, `gap middle|right: ${middle.x + middle.width} vs ${right.x}`);
  assert.ok(Math.abs(modeMain.x - middle.x) < 0.5 && Math.abs(modeMain.width - middle.width) < 0.5, 'the task fills its pane');
  const deskTitleTop = (await box(desk.getByTestId('prepack-mode-title'))).y - middle.y;
  assert.ok(deskTitleTop <= 120, `desk mode title ${deskTitleTop}px below the task top`);
  proof.panes = { left: [left.x, left.x + left.width], middle: [middle.x, middle.x + middle.width], right: [right.x, right.x + right.width], deskTitleTop };
  await shot(desk, 'desk-1-mode');
  proof.photos.products = await thumbsLoad(products, 'Products column');
  proof.photos.printed = await thumbsLoad(printedColumn, 'Recently printed column');

  // ── 8 + 7. Find narrows Products; one click loads the form ──────────────
  const find = desk.locator('[data-nav-search="page"] input').first();
  await find.click();
  await find.fill(TEST_SKU);
  await desk.waitForFunction((sku) => document.querySelector('[data-testid="prepack-products-column"]')?.getAttribute('data-query') === sku, TEST_SKU, { timeout: 10_000 });
  const topProduct = products.getByTestId('prepack-product-row').first();
  assert.match(await topProduct.innerText(), new RegExp(TEST_SKU), 'Find puts the SKU at the top of Products');
  await topProduct.click();
  await desk.waitForFunction((id) => new URL(location.href).searchParams.get('catalogId') === String(id), testCatalogId, { timeout: 10_000 });
  await desk.getByTestId('prepack-mode-product').filter({ hasText: TEST_SKU }).waitFor();
  proof.find = `Find "${TEST_SKU}" → top product → catalogId ${testCatalogId}`;

  const productTexts = await products.getByTestId('prepack-product-row').allInnerTexts();
  const printedTexts = await printedColumn.getByTestId('prepack-printed-row').allInnerTexts();
  assert.ok(productTexts.length > 0 && printedTexts.length > 0, 'both side panes have rows');
  assert.equal(productTexts.filter((text) => printedTexts.includes(text)).length, 0, 'Products and Recently printed never share a row');

  // ── 4. Desk serial entry: typed field + phone handoff, no camera ────────
  await desk.getByTestId('prepack-mode-single').click();
  await step(desk, 'unit');
  const serialField = frame.getByLabel('Serial number');
  await serialField.waitFor();
  assert.equal(await frame.getByTestId('prepack-serial-phone').count(), 1, 'Scan with phone on the desk');
  assert.equal(await frame.getByPlaceholder('Scan serial or unit label').count(), 0, 'no MobileV2ScanInput on the desk unit step');
  assert.equal(await frame.getByRole('button', { name: /camera scanner/i }).count(), 0, 'no camera on the desk unit step');
  await shot(desk, 'desk-2-unit');

  // ── 5. Two serials, one package: A typed on the desk, B from the phone ──
  await serialField.fill(SERIAL_A);
  await serialField.press('Enter');
  await frame.getByTestId('prepack-package-serial').filter({ hasText: SERIAL_A }).waitFor({ timeout: 20_000 });

  await phone.goto('/m/home', { waitUntil: 'domcontentloaded' });
  await phone.waitForTimeout(3_000);
  await frame.getByTestId('prepack-serial-phone').click();
  await phone.waitForURL((url) => url.pathname === '/m/prepack' && Boolean(url.searchParams.get('serialRequestId')), { timeout: 30_000 });
  const phoneScan = phone.getByPlaceholder('Scan serial or unit label');
  await phoneScan.fill(SERIAL_B);
  await phoneScan.press('Enter');
  await phone.getByText(/sent to the desk/).waitFor();
  await frame.getByTestId('prepack-package-serial').filter({ hasText: SERIAL_B }).waitFor({ timeout: 20_000 });
  await frame.getByTestId('prepack-serial-phone-done').click();
  assert.equal(await frame.getByTestId('prepack-package-serial').count(), 2, 'one package, two serials');
  assert.equal(query(desk).getAll('unit').length, 2, 'every serial rides the URL');
  await shot(desk, 'desk-3-two-serials');

  const unitA = (await unitLookup(SERIAL_A)).unit;
  const unitB = (await unitLookup(SERIAL_B)).unit;
  assert.ok(unitA && unitB, 'both new serials exist after Add');
  assert.equal(unitA.currentStatus, 'UNKNOWN', 'a serial first seen at prepack starts UNKNOWN');
  assert.equal(unitA.skuCatalogId, testCatalogId, 'a new serial is stamped with the package product');

  await dock(desk, 'prepack-unit-next');
  await step(desk, 'facts');
  await desk.getByTestId('prepack-condition-used_a').click();
  await desk.getByTestId('prepack-provenance-none').click();
  await desk.waitForFunction(() => new URL(location.href).searchParams.get('provenance') === 'NONE' && new URL(location.href).searchParams.get('condition') === 'USED_A');
  await dock(desk, 'prepack-facts-next');
  await step(desk, 'evidence');

  await upload(unitA.id, SERIAL_A, 'serial');
  await upload(unitB.id, SERIAL_B, 'serial');
  await upload(unitA.id, SERIAL_A, 'condition');
  await upload(unitA.id, SERIAL_A, 'included');
  for (let tries = 0; !(await desk.getByTestId('prepack-evidence-next').isEnabled()); tries += 1) {
    assert.ok(tries < 60, 'evidence counts never repainted');
    await desk.waitForTimeout(500);
  }
  await shot(desk, 'desk-4-evidence');
  await dock(desk, 'prepack-evidence-next');

  await step(desk, 'contents');
  const deskForm = desk.getByTestId('prepack-flow');
  await deskForm.focus();
  await desk.keyboard.press('a');
  await deskForm.focus();
  await desk.keyboard.press('Enter');
  await step(desk, 'label');
  assert.equal(await frame.getByPlaceholder('Scan a location label').count(), 0, 'the form asks no location — packing puts it away');
  assert.equal(await frame.getByText('Location', { exact: true }).count(), 0, 'no Location step or field');

  await frame.getByTestId('prepack-print-station').click();
  await desk.getByRole('menuitem', { name: /^This device/ }).click();
  assert.equal(await desk.getByTestId('prepack-print').isEnabled(), true, 'Print is ready once every step is complete');
  await dock(desk, 'prepack-print');
  await frame.getByTestId('prepack-label-stage').waitFor({ timeout: 30_000 });
  await frame.getByText(/printed the package label KIT-/).waitFor({ timeout: 30_000 });
  await shot(desk, 'desk-5-printed');

  const { rows: members } = await db.query(
    `SELECT su.id, su.serial_number, su.current_status::text AS status,
            lm.manifest_uid, lm.id AS manifest_id, lm.status AS manifest_status
       FROM serial_units su
       JOIN label_manifest_items i ON i.serial_unit_id = su.id AND i.organization_id = su.organization_id
       JOIN label_manifests lm ON lm.id = i.manifest_id AND lm.organization_id = i.organization_id
      WHERE su.id = ANY($1::int[])
      ORDER BY i.ordinal`,
    [[unitA.id, unitB.id]],
  );
  assert.equal(members.length, 2, 'both serials are members of a package');
  assert.equal(new Set(members.map((row) => row.manifest_id)).size, 1, 'one package');
  for (const row of members) {
    assert.equal(row.status, 'RECEIVED', `${row.serial_number} is RECEIVED, awaiting putaway by packing`);
    assert.equal(row.manifest_status, 'SEALED');
  }
  const packageUid = members[0].manifest_uid;
  const { rows: events } = await db.query(
    `SELECT serial_unit_id, event_type, prev_status, next_status FROM inventory_events
      WHERE serial_unit_id = ANY($1::int[]) AND event_type IN ('RECEIVED', 'PUTAWAY', 'MOVED')
      ORDER BY id`,
    [[unitA.id, unitB.id]],
  );
  for (const id of [unitA.id, unitB.id]) {
    assert.ok(events.some((e) => e.serial_unit_id === id && e.event_type === 'RECEIVED' && e.next_status === 'RECEIVED'), `unit ${id} is received at prepack`);
    assert.ok(!events.some((e) => e.serial_unit_id === id && (e.event_type === 'PUTAWAY' || e.event_type === 'MOVED')), `unit ${id} is not stored by prepack`);
  }
  const { rows: jobs } = await db.query(
    `SELECT id, job_type, manifest_id, serial_unit_id, qr_payload FROM label_print_jobs
      WHERE manifest_id = $1 OR serial_unit_id = ANY($2::int[])`,
    [members[0].manifest_id, [unitA.id, unitB.id]],
  );
  assert.equal(jobs.length, 1, 'exactly one label_print_jobs row for the package');
  assert.equal(jobs[0].qr_payload, packageUid);
  proof.package = { packageUid, unitIds: [unitA.id, unitB.id], events, printJob: jobs[0] };

  // A pick scan of the package label resolves to both serials (the real server resolver, rolled back).
  const resolved = execFileSync(path.join(ROOT, 'node_modules/.bin/tsx'), ['--conditions=react-server', '-e', `
    import pg from 'pg';
    import { lockUnitsForPickScan } from '@/lib/picking/pick-serial-link';
    void (async () => {
      const client = await new pg.Pool({ connectionString: process.env.DATABASE_URL }).connect();
      const org = (await client.query('SELECT organization_id FROM serial_units WHERE id = $1', [${unitA.id}])).rows[0].organization_id;
      await client.query('BEGIN');
      const hit = await lockUnitsForPickScan(client, org, ${JSON.stringify(packageUid)});
      await client.query('ROLLBACK');
      client.release();
      console.log(JSON.stringify(hit?.units.map((u) => u.id) ?? []));
      process.exit(0);
    })();
  `], { cwd: ROOT, env: process.env, encoding: 'utf8' }).trim().split('\n').pop();
  assert.deepEqual(JSON.parse(resolved).sort(), [unitA.id, unitB.id].sort(), 'pick scan of the package resolves to both serials');
  proof.pickResolve = { scan: packageUid, unitIds: JSON.parse(resolved) };

  // ── 7. Recently printed loads its product; Products loads another ───────
  await dock(desk, 'prepack-next-unit');
  await step(desk, 'unit');
  const printedRow = printedColumn.getByTestId('prepack-printed-row').filter({ hasText: packageUid });
  await printedRow.waitFor({ timeout: 30_000 });
  const printedCatalogId = await printedRow.getAttribute('data-catalog-id');
  await printedRow.click();
  await desk.waitForFunction((id) => new URL(location.href).searchParams.get('catalogId') === id, printedCatalogId, { timeout: 10_000 });
  await find.fill('');
  await desk.waitForFunction(() => document.querySelector('[data-testid="prepack-products-column"]')?.getAttribute('data-query') === '', null, { timeout: 10_000 });
  const otherProduct = products.locator(`[data-testid="prepack-product-row"]:not([data-catalog-id="${printedCatalogId}"])`).first();
  const otherId = await otherProduct.getAttribute('data-catalog-id');
  await otherProduct.click();
  await desk.waitForFunction((id) => new URL(location.href).searchParams.get('catalogId') === id, otherId, { timeout: 10_000 });
  proof.sideColumns = { printedRowLoads: printedCatalogId, productRowLoads: otherId };
  await shot(desk, 'desk-6-side-columns');

  // ── 2 + 4. Phone: title at the top, camera scan in the unit step ────────
  await phone.goto('/m/prepack', { waitUntil: 'load' });
  await phone.waitForTimeout(1_500); // hydration: the chooser is server-painted before its buttons are live
  const phoneMain = await box(phone.getByTestId('prepack-mode-choice'));
  const phoneTitleTop = (await box(phone.getByTestId('prepack-mode-title'))).y - phoneMain.y;
  assert.ok(phoneTitleTop <= 120, `phone mode title ${phoneTitleTop}px below the task top`);
  await shot(phone, 'phone-1-mode');
  await phone.getByTestId('prepack-mode-single').click();
  await step(phone, 'unit');
  assert.equal(await phone.getByPlaceholder('Scan serial or unit label').count(), 1, 'the phone keeps the camera scan input');
  assert.ok(await phone.getByRole('button', { name: /camera scanner/i }).count() >= 1, 'camera control on the phone');
  assert.equal(await phone.getByLabel('Serial number').count(), 0, 'no desk serial field on the phone');
  proof.phone = { phoneTitleTop };
  await shot(phone, 'phone-2-unit');

  // The form's own product search (Bulk › Product) paints photos too.
  await phone.goto('/m/prepack', { waitUntil: 'load' });
  await phone.waitForTimeout(1_500);
  await phone.getByTestId('prepack-mode-bulk').click();
  await step(phone, 'product');
  await phone.getByTestId('prepack-title-input').fill('00326');
  await phone.getByTestId('prepack-catalog-choice').first().waitFor({ timeout: 20_000 });
  proof.photos.formSearch = await thumbsLoad(phone.getByRole('listbox', { name: 'Catalog matches' }), 'Form product search');
  await shot(phone, 'phone-3-product-search');

  console.log(JSON.stringify({ ok: true, serials: [SERIAL_A, SERIAL_B], proof, screenshots: shots }, null, 2));
} catch (error) {
  await shot(desk, 'fail-desk').catch(() => {});
  await shot(phone, 'fail-phone').catch(() => {});
  console.error(JSON.stringify({ ok: false, serials: [SERIAL_A, SERIAL_B], proof }, null, 2));
  throw error;
} finally {
  await deskContext.close();
  await phoneContext.close();
  await browser.close();
  await db.end();
}
