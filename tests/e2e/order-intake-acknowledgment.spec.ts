import path from 'path';
import { test, expect, type Page } from '@playwright/test';

/**
 * Order Intake & Acknowledgment — the VERIFY matrix
 * (`docs/todo/order-intake-acknowledgment-VERIFY.md` § E2E).
 *
 * The single density is `OrderTriageForm` behind the To-ship Add
 * (`?triage=new` — deep-linkable, so fixtures bind with `?triage=<pk>`); the
 * bulk density is the CSV staging grid whose row inspector mounts the SAME
 * form. ShipStation is mocked at the network layer (route intercepts) — no
 * live token is required; the label-linked fixture is a REAL document attach
 * through `/api/orders/[id]/documents`, so G3 closes honestly.
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

const DESK = '/shipping/orders';

/** Unique per run: marketplace shapes must not collide with earlier runs. */
function stamp(): string {
  return Date.now().toString().slice(-9);
}
function amazonShaped(s: string): string {
  return `111-${s.slice(0, 7).padStart(7, '0')}-${s.slice(2, 9).padStart(7, '0')}`;
}
function ebayShaped(s: string): string {
  return `03-${s.slice(0, 5).padStart(5, '0')}-${s.slice(4, 9).padStart(5, '0')}`;
}

async function probeSession(page: Page) {
  const probe = await page.request.get('/api/orders/queue-counts');
  test.skip(!probe.ok(), 'no QA session — run pnpm provision:qa-org');
}

/** Open the intake form. Prefers the tab-band Add; falls back to the URL. */
async function openTriageForm(page: Page): Promise<void> {
  await page.goto(DESK);
  test.skip(/signin|login|account\/sign/i.test(page.url()), 'no session');
  const addBtn = page.getByTestId('orders-desk-add');
  if (await addBtn.isVisible({ timeout: 15_000 }).catch(() => false)) {
    await addBtn.click();
  } else {
    // The triage param is the deep-linkable state the Add button writes.
    await page.goto(`${DESK}?triage=new`);
  }
  await expect(page.getByTestId('order-intake-form')).toBeVisible({ timeout: 20_000 });
}

async function fillOrderNumber(page: Page, value: string) {
  const field = page.getByTestId('intake-order-number');
  await field.fill(value);
  await field.blur();
}

/**
 * Fixture builder: create an order through the SAME endpoints the form uses
 * (`/api/orders/add` → set-item-number → cage), then hand back its pk. Keeps
 * behavior tests on the UI and fixture plumbing off it.
 */
async function createCagedFixture(
  page: Page,
  opts: {
    orderNumber: string;
    title: string;
    tracking?: string;
    itemNumber?: string;
    sku?: string;
    quantity?: string;
  },
): Promise<number> {
  const key = `e2e-intake-${opts.orderNumber}`;
  const created = await page.request.post('/api/orders/add', {
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    data: {
      orderId: opts.orderNumber,
      productTitle: opts.title,
      accountSource: 'Manual',
      condition: 'USED_B',
      sku: opts.sku ?? null,
      quantity: opts.quantity ?? '1',
      ...(opts.tracking
        ? { shippingTrackingNumber: opts.tracking, shippingTrackingNumbers: [opts.tracking] }
        : {}),
      idempotencyKey: key,
    },
  });
  expect(created.ok(), `POST /api/orders/add ${created.status()}: ${await created.text()}`).toBeTruthy();
  const body = (await created.json()) as { success?: boolean; order?: { id?: number } };
  const pk = Number(body.order?.id);
  expect(pk).toBeGreaterThan(0);

  if (opts.itemNumber) {
    const setItem = await page.request.post('/api/orders/set-item-number', {
      data: { id: pk, itemNumber: opts.itemNumber },
    });
    expect(setItem.ok()).toBeTruthy();
  }

  const caged = await page.request.post(`/api/orders/${pk}/cage-release`, {
    data: { action: 'cage' },
  });
  expect(caged.ok(), 'cage action must succeed').toBeTruthy();
  return pk;
}

/** Real G3 fixture: attach a shipping label document (same-origin URL). */
async function attachLabelFixture(page: Page, pk: number, s: string, tracking?: string) {
  const attached = await page.request.post(`/api/orders/${pk}/documents`, {
    data: {
      documentType: 'shipping_label',
      url: `/qa-fixtures/e2e-label-${s}-${pk}.pdf`,
      source: 'manual_upload',
      ...(tracking ? { tracking } : {}),
    },
  });
  expect(attached.status(), `label attach ${attached.status()}: ${await attached.text()}`).toBe(201);
}

async function openBoundTriage(page: Page, pk: number, orderNumber: string) {
  await page.goto(`${DESK}?triage=${pk}`);
  await expect(page.getByTestId('order-intake-form')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('triage-knob-review')).toBeVisible({ timeout: 15_000 });
  // Knobs enable off the bound session — wait for the RECORD to paint
  // (the Identity read rows carry the order number) before typing, so the
  // first gates fetch cannot land mid-fill.
  await expect(page.getByTestId('order-intake-form')).toContainText(orderNumber, {
    timeout: 20_000,
  });
}

/** The Review list row for one gate, e.g. `G2 · Documents`. */
function reviewGateRow(page: Page, gateId: 'G1' | 'G2' | 'G3') {
  return page
    .getByTestId('order-intake-form')
    .locator('li')
    .filter({ hasText: `${gateId} ·` });
}

test.describe('Order Intake & Acknowledgment', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desk rail is a desktop layout');
  test.skip(({ isMobile }) => !!isMobile, 'desk rail is a desktop layout');

  test('E2E-STAGE: intake mounts stage-filling DeskStageOverlay (not an inset popover)', async ({
    page,
  }) => {
    await probeSession(page);
    const s = stamp();
    const orderNumber = amazonShaped(s);
    const pk = await createCagedFixture(page, {
      orderNumber,
      title: `Stage radius probe ${s}`,
    });

    await openBoundTriage(page, pk, orderNumber);

    const overlay = page.getByTestId('order-intake-overlay');
    await expect(overlay).toBeVisible({ timeout: 20_000 });
    await expect(overlay).toHaveAttribute('data-desk-stage-fill', 'stage');

    // Stage fill = same footprint as the desk stage card (no inset gutters).
    const geometry = await overlay.evaluate((el) => {
      const parent = el.parentElement;
      if (!parent) return null;
      const a = el.getBoundingClientRect();
      const b = parent.getBoundingClientRect();
      return {
        widthDelta: Math.abs(a.width - b.width),
        heightDelta: Math.abs(a.height - b.height),
        leftDelta: Math.abs(a.left - b.left),
        topDelta: Math.abs(a.top - b.top),
      };
    });
    expect(geometry).not.toBeNull();
    expect(geometry!.widthDelta, 'overlay must match stage width').toBeLessThan(2);
    expect(geometry!.heightDelta, 'overlay must match stage height').toBeLessThan(2);
    expect(geometry!.leftDelta, 'overlay must be flush left').toBeLessThan(2);
    expect(geometry!.topDelta, 'overlay must be flush top').toBeLessThan(2);

    const facts = page.getByTestId('intake-identity-facts');
    await expect(facts).toBeVisible();
    await expect(facts.getByTestId('intake-fact-row').first()).toBeVisible();
    await expect(facts).toContainText(orderNumber);

    const rowRadius = await facts.getByTestId('intake-fact-row').first().evaluate((el) => {
      return getComputedStyle(el).borderRadius;
    });
    // cornerClass('row') → rounded-md (6px)
    expect(rowRadius, `expected row corner, got "${rowRadius}"`).toMatch(
      /^(6px|0\.375rem)( (6px|0\.375rem)){0,3}$/,
    );
  });

  test('E2E-KNOBS: all six section spies render on create and jump to their sections', async ({
    page,
  }) => {
    await probeSession(page);
    await openTriageForm(page);

    const knobs = page.getByTestId('triage-scroll-knobs');
    await expect(knobs).toBeVisible({ timeout: 20_000 });

    const ids = [
      'identity',
      'links',
      'documents',
      'shipping',
      'assignment',
      'review',
    ] as const;
    for (const id of ids) {
      await expect(page.getByTestId(`triage-knob-${id}`)).toBeVisible();
    }

    // Click Review — section id must enter the scroll viewport.
    await page.getByTestId('triage-knob-review').click();
    await expect(page.locator('#review')).toBeInViewport({ timeout: 10_000 });
    await expect(page.getByTestId('triage-knob-review')).toHaveAttribute(
      'aria-current',
      'true',
    );

    await page.getByTestId('triage-knob-shipping').click();
    await expect(page.locator('#shipping')).toBeInViewport({ timeout: 10_000 });
    await expect(page.getByTestId('triage-knob-shipping')).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  test('E2E-ID-AMZ: Amazon 3-7-7 paste infers Amazon with no platform click', async ({ page }) => {
    await probeSession(page);
    await openTriageForm(page);
    await fillOrderNumber(page, amazonShaped(stamp()));
    await expect(page.getByTestId('intake-platform-inferred')).toContainText('Amazon');
    // Inferred ⇒ the chosen-platform combobox is not demanded.
    await expect(page.getByTestId('intake-platform-chosen')).toHaveCount(0);
    await expect(page.getByTestId('triage-start')).toBeEnabled();
  });

  test('E2E-ID-EBAY: eBay 2-5-5 paste infers eBay', async ({ page }) => {
    await probeSession(page);
    await openTriageForm(page);
    await fillOrderNumber(page, ebayShaped(stamp()));
    await expect(page.getByTestId('intake-platform-inferred')).toContainText('eBay');
    await expect(page.getByTestId('intake-platform-chosen')).toHaveCount(0);
  });

  test('E2E-ID-UNK: unknown shape requires a platform pick', async ({ page }) => {
    await probeSession(page);
    await openTriageForm(page);
    await fillOrderNumber(page, `CFLOOP-${stamp()}`);
    await expect(page.getByTestId('intake-platform-inferred')).not.toContainText('Amazon');
    const chosen = page.getByTestId('intake-platform-chosen');
    await expect(chosen).toBeVisible();
    await expect(chosen).toBeEnabled();
    // Start triage refuses until the operator picks.
    await expect(page.getByTestId('triage-start')).toBeDisabled();
    await expect(
      page.getByText(/pick a platform — this order number/i),
    ).toBeVisible();
  });

  test('E2E-DUP: an existing order number is acknowledged, never inserted twice', async ({ page }) => {
    await probeSession(page);
    const s = stamp();
    const orderNumber = `CFDUP-${s}`;
    await createCagedFixture(page, { orderNumber, title: `Duplicate probe ${s}` });

    await openTriageForm(page);
    await fillOrderNumber(page, orderNumber);
    await expect(page.getByTestId('intake-open-existing')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('triage-start')).toBeDisabled();

    // No second insert happened: the org still has exactly one row with this
    // order number (a re-post with a fresh idempotency key would 409).
    const rePost = await page.request.post('/api/orders/add', {
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `dup-again-${s}` },
      data: {
        orderId: orderNumber,
        productTitle: 'second insert attempt',
        accountSource: 'Manual',
        idempotencyKey: `dup-again-${s}`,
      },
    });
    expect(rePost.status()).toBe(409);

    // "Open it" binds the form to the EXISTING order.
    await page.getByTestId('intake-open-existing').click();
    await expect(page).toHaveURL(new RegExp(`triage=\\d+`));
    await expect(page.getByTestId('order-intake-form')).toContainText(orderNumber);
  });

  test('E2E-LINE: typed sku + title + qty default land on the create payload', async ({ page }) => {
    await probeSession(page);
    const s = stamp();
    const orderNumber = amazonShaped(s);
    await openTriageForm(page);
    await fillOrderNumber(page, orderNumber);

    // Quantity defaults to 1, visible without a click.
    await expect(page.getByTestId('intake-qty').locator('input')).toHaveValue('1');

    await page.getByTestId('intake-sku').fill(`SKU-E2E-${s}`);
    await page.getByTestId('order-intake-form').getByLabel('Title').fill(`Line test unit ${s}`);
    // Condition from the canonical pills (Used — B). The pills are radios;
    // best-effort with a short timeout — condition is optional on create.
    await page
      .getByTestId('order-intake-form')
      .getByRole('radio', { name: 'B', exact: true })
      .first()
      .click({ timeout: 4_000 })
      .catch(() => null);

    const post = page.waitForRequest(
      (req) => req.url().includes('/api/orders/add') && req.method() === 'POST',
      { timeout: 25_000 },
    );
    await page.getByTestId('triage-start').click();
    const request = await post;
    const payload = request.postDataJSON() as Record<string, unknown>;
    expect(payload.sku).toBe(`SKU-E2E-${s}`);
    expect(payload.quantity).toBe('1');
    expect(payload.orderId).toBe(orderNumber);
    // Inferred slug written as account_source — the number named the channel.
    expect(payload.accountSource).toBe('amazon');

    const response = await (await post).response();
    expect(response?.ok()).toBeTruthy();
    // The form binds to the created caged order.
    await expect(page.getByTestId('order-intake-form')).toContainText(orderNumber, {
      timeout: 15_000,
    });
  });

  test('E2E-EXEMPT: docs exempt turns G2 green in Review', async ({ page }) => {
    await probeSession(page);
    const s = stamp();
    const pk = await createCagedFixture(page, {
      orderNumber: `CFEX-${s}`,
      title: `Exempt probe ${s}`,
      tracking: `CFEX${s}TRACK1`,
      itemNumber: `ITM-EX-${s}`,
    });
    await openBoundTriage(page, pk, `CFEX-${s}`);

    const exempt = page.getByTestId('triage-docs-not-required');
    const saved = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/orders/${pk}/cage-release`)
        && res.request().method() === 'POST'
        && res.ok(),
      { timeout: 20_000 },
    );
    await exempt.click();
    await saved;

    await page.getByTestId('triage-knob-review').click();
    await expect(reviewGateRow(page, 'G2')).toContainText('Green', { timeout: 15_000 });
  });

  test('E2E-LINK: a linked label document closes G3', async ({ page }) => {
    await probeSession(page);
    const s = stamp();
    const tracking = `CFLNK${s}TRACK1`;
    const pk = await createCagedFixture(page, {
      orderNumber: `CFLNK-${s}`,
      title: `Link probe ${s}`,
      tracking,
      itemNumber: `ITM-LNK-${s}`,
    });
    await attachLabelFixture(page, pk, s, tracking);

    await openBoundTriage(page, pk, `CFLNK-${s}`);
    await expect(
      page.getByTestId('order-intake-form').getByText('Label linked to this order.'),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('triage-knob-review').click();
    await expect(reviewGateRow(page, 'G3')).toContainText('Green');
  });

  test('E2E-BUY: mocked purchase — ONE purchase POST; weight+dims ride the rate request', async ({ page }) => {
    await probeSession(page);
    const s = stamp();
    const tracking = `CFBUY${s}TRACK1`;
    const pk = await createCagedFixture(page, {
      orderNumber: `CFBUY-${s}`,
      title: `Buy probe ${s}`,
      tracking,
      itemNumber: `ITM-BUY-${s}`,
    });

    const ratesBodies: Array<Record<string, unknown>> = [];
    let purchaseCount = 0;
    await page.route('**/api/shipping/order-rates', async (route) => {
      ratesBodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          rates: [
            {
              rateId: 'rate-e2e-1',
              carrierId: 'car-1',
              carrierCode: 'usps',
              carrierName: 'USPS',
              serviceCode: 'usps_priority_mail',
              serviceName: 'Priority Mail',
              amount: 8.52,
              currency: 'usd',
              deliveryDays: 2,
            },
          ],
          invalidRates: [],
        }),
      });
    });
    await page.route('**/api/shipping/order-labels/purchase', async (route) => {
      purchaseCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          tracking: `9400E2E${s}`,
          carrier: 'usps',
          service: 'Priority Mail',
          cost: 8.52,
          currency: 'usd',
          labelId: 'lbl-e2e-1',
        }),
      });
    });

    await openBoundTriage(page, pk, `CFBUY-${s}`);

    // Parcel: weight + dims, committed on blur (persist on the order).
    // POST only — the bound form's initial gates GET hits the same URL.
    const parcelSaved = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/orders/${pk}/cage-release`)
        && res.request().method() === 'POST'
        && res.ok(),
      { timeout: 20_000 },
    );
    await page.getByTestId('intake-weight').fill('18');
    await page.getByTestId('intake-dim-l').fill('12');
    await page.getByTestId('intake-dim-w').fill('9');
    await page.getByTestId('intake-dim-h').fill('4');
    await page.getByTestId('intake-dim-h').blur();
    await parcelSaved;

    await page.getByTestId('intake-label-buy-toggle').click();
    const buyHost = page.getByTestId('intake-label-buy');
    await expect(buyHost).toBeVisible();

    await buyHost.getByRole('button', { name: /get shipping rates/i }).click();
    await buyHost.getByRole('button', { name: /buy .*label/i }).click();
    await buyHost.getByRole('button', { name: /confirm & buy/i }).click();
    await expect(buyHost.getByText(/label purchased/i)).toBeVisible({ timeout: 15_000 });

    expect(purchaseCount, 'exactly one purchase POST').toBe(1);
    const lastRates = ratesBodies[ratesBodies.length - 1]!;
    expect(lastRates.weightOz).toBe(18);
    expect(lastRates.dimensions).toEqual({ length: 12, width: 9, height: 4, unit: 'inch' });

    // The mocked purchase writes no document, so the gates (which read the DB)
    // cannot see it — close G3 with a REAL label fixture, then Re-check.
    await attachLabelFixture(page, pk, s, tracking);
    await page.unroute('**/api/shipping/order-rates');
    await page.getByTestId('triage-knob-review').click();
    await page.reload();
    await expect(page.getByTestId('order-intake-form')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('triage-knob-review').click();
    await expect(reviewGateRow(page, 'G3')).toContainText('Green', { timeout: 15_000 });
  });

  test('E2E-CHAN (REQ-ID-05): ShipStation disconnected — Buy disabled with the reason, Link still works', async ({ page }) => {
    await probeSession(page);
    const s = stamp();
    const pk = await createCagedFixture(page, {
      orderNumber: `CFCHAN-${s}`,
      title: `Channel probe ${s}`,
      tracking: `CFCHAN${s}TRACK1`,
    });

    await page.route('**/api/shipping/order-rates', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          error: 'ShipStation is not connected for this organization.',
          code: 'SHIPSTATION_NOT_CONNECTED',
        }),
      });
    });

    await openBoundTriage(page, pk, `CFCHAN-${s}`);
    await page.getByTestId('intake-weight').fill('10');
    await page.getByTestId('intake-weight').blur();

    await page.getByTestId('intake-label-buy-toggle').click();
    await page
      .getByTestId('intake-label-buy')
      .getByRole('button', { name: /get shipping rates/i })
      .click();

    // The form acknowledges the named blocker and falls back to link-only.
    await expect(page.getByTestId('intake-label-buy-toggle')).toBeDisabled({ timeout: 15_000 });
    await expect(
      page.getByText(/ShipStation is not connected — connect it in Settings/i),
    ).toBeVisible();
    await expect(page.getByTestId('intake-label-link')).toBeEnabled();
    await expect(page.getByTestId('triage-open-labels')).toBeEnabled();
  });

  test('E2E-WHO: tech + packer assignment persists through work-orders', async ({ page }) => {
    await probeSession(page);
    const s = stamp();
    const pk = await createCagedFixture(page, {
      orderNumber: `CFWHO-${s}`,
      title: `Assign probe ${s}`,
      tracking: `CFWHO${s}TRACK1`,
    });
    await openBoundTriage(page, pk, `CFWHO-${s}`);
    await page.getByTestId('triage-knob-assignment').click();

    const techGrid = page.getByTestId('intake-assign-tech');
    const packerGrid = page.getByTestId('intake-assign-packer');
    await expect(techGrid).toBeVisible();

    const techEmpty = await techGrid
      .getByText('No technicians present today')
      .isVisible()
      .catch(() => false);
    const packerEmpty = await packerGrid
      .getByText('No packers present today')
      .isVisible()
      .catch(() => false);
    test.skip(
      techEmpty || packerEmpty,
      'no staff present fixture — QA org has no technicians/packers marked present today',
    );

    const patch1 = page.waitForResponse(
      (res) => res.url().includes('/api/work-orders') && res.request().method() === 'PATCH' && res.ok(),
      { timeout: 20_000 },
    );
    await techGrid.getByRole('button').first().click();
    await patch1;

    const patch2 = page.waitForResponse(
      (res) => res.url().includes('/api/work-orders') && res.request().method() === 'PATCH' && res.ok(),
      { timeout: 20_000 },
    );
    await packerGrid.getByRole('button').first().click();
    await patch2;

    // Persistence proof: the work-orders queue row projects both slots.
    const snapshot = await page.request.get('/api/work-orders?queue=orders');
    expect(snapshot.ok()).toBeTruthy();
    const rows = ((await snapshot.json()) as { rows?: Array<Record<string, unknown>> }).rows ?? [];
    const row = rows.find((r) => Number(r.entityId) === pk);
    expect(row, `work-order row for order pk ${pk}`).toBeTruthy();
    expect(row!.techId, 'assigned tech persisted').not.toBeNull();
    expect(row!.packerId, 'assigned packer persisted').not.toBeNull();
  });

  test('E2E-CAGE: missing G3 keeps the order off the default pending grid; Caged facet shows it', async ({ page }) => {
    await probeSession(page);
    const s = stamp();
    const pk = await createCagedFixture(page, {
      orderNumber: `CFCAGE-${s}`,
      title: `Cage probe ${s}`,
      tracking: `CFCAGE${s}TRACK1`,
      itemNumber: `ITM-CAGE-${s}`,
    });

    // Not in the live fulfillment queue…
    const board = await page.request.get(
      '/api/orders?fulfillmentScope=true&listShape=queue&limit=200',
    );
    expect(board.ok()).toBeTruthy();
    const boardIds = (((await board.json()) as { orders?: Array<{ id?: number }> }).orders ?? []).map(
      (r) => Number(r.id),
    );
    expect(boardIds.includes(pk), 'caged order must NOT be on the live queue').toBeFalsy();

    await page.goto(DESK);
    await expect(page.locator(`[data-order-row-id="${pk}"]`)).toHaveCount(0);

    // …but on the Caged facet (deep-linkable — desk open + facet = 2).
    await page.goto(`${DESK}?cage=1`);
    await expect(page.locator(`[data-order-row-id="${pk}"]`).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('E2E-REL: all gates green → Release lands the row on Pending', async ({ page }) => {
    await probeSession(page);
    const s = stamp();
    const orderNumber = `CFREL-${s}`;
    const tracking = `CFREL${s}TRACK1`;
    const pk = await createCagedFixture(page, {
      orderNumber,
      title: `Release probe ${s}`,
      tracking,
      itemNumber: `ITM-REL-${s}`,
    });
    await attachLabelFixture(page, pk, s, tracking);
    // G2 exempt through the same endpoint the form's checkbox posts.
    const exempt = await page.request.post(`/api/orders/${pk}/cage-release`, {
      data: { action: 'docs-not-required', value: true },
    });
    expect(exempt.ok()).toBeTruthy();

    await openBoundTriage(page, pk, orderNumber);
    await page.getByTestId('triage-knob-review').click();
    const releasePosted = page.waitForResponse(
      (res) =>
        res.url().includes(`/api/orders/${pk}/cage-release`)
        && res.request().method() === 'POST'
        && res.ok(),
      { timeout: 20_000 },
    );
    await page.getByTestId('triage-release').click();
    await releasePosted;

    // The rail closes on release.
    await expect(page.getByTestId('order-intake-form')).toBeHidden({ timeout: 15_000 });

    // Released = in the live queue…
    const board = await page.request.get(
      '/api/orders?fulfillmentScope=true&listShape=queue&limit=200',
    );
    const boardIds = (((await board.json()) as { orders?: Array<{ id?: number }> }).orders ?? []).map(
      (r) => Number(r.id),
    );
    expect(boardIds.includes(pk), 'released order must be on the live queue').toBeTruthy();

    // …and painted on Pending with its marketplace id.
    const row = page.locator(`[data-order-row-id="${pk}"]`);
    if (!(await row.isVisible({ timeout: 10_000 }).catch(() => false))) {
      await page.reload();
    }
    await expect(row.first()).toBeVisible({ timeout: 20_000 });
    await expect(row.first()).toHaveAttribute('data-marketplace-order-id', orderNumber);
  });

  test('E2E-BULK: 3-row CSV — two inferred ready, one action-required; inspector is the same form', async ({ page }) => {
    await probeSession(page);
    const s = stamp();
    const amazonId = amazonShaped(s);
    const ebayId = ebayShaped(s);
    const unknownId = `CFLOOP-${s}`;
    const csv = [
      'Order ID,Item title,Qty,Tracking',
      `${amazonId},Bulk Amazon unit ${s},1,9400111899223197428490`,
      `${ebayId},Bulk eBay unit ${s},2,9405511899223197428491`,
      `${unknownId},Bulk internal unit ${s},1,`,
      '',
    ].join('\n');

    await page.goto(DESK);
    // The ingest rail's hidden CSV input is mounted with the desk (the rail
    // registrar renders it regardless of the rail being open) — feed the file
    // straight into it, exactly what the "Import from file" leaf's button does.
    const fileInput = page.locator('input[type="file"][accept*="csv"]');
    await expect(fileInput).toBeAttached({ timeout: 20_000 });
    await fileInput.setInputFiles({
      name: `intake-bulk-${s}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    });

    await expect(page.getByTestId('intake-bulk-grid')).toBeVisible({ timeout: 20_000 });
    // Marketplace-shaped ids are Ready with NO platform column; the unknown
    // shape is Action required (missing platform).
    await expect(page.locator('[data-staging-status="ready"]')).toHaveCount(2);
    await expect(page.locator('[data-staging-status="action_required"]')).toHaveCount(1);

    // The row inspector is the SAME form — same testids.
    await page.locator('[data-staging-row]').filter({ hasText: unknownId }).first().click();
    const rail = page.getByRole('region', { name: /csv import staging inspector/i });
    await expect(rail.getByTestId('order-triage-form')).toBeVisible({ timeout: 15_000 });
    await expect(rail.getByTestId('intake-order-number')).toHaveValue(unknownId);
    // Unknown shape ⇒ the platform combobox is demanded in the inspector too.
    await expect(rail.getByTestId('intake-platform-chosen')).toBeVisible();
  });

  test('E2E-BUDGET: gates green → Review → Release is two clicks from form open', async ({ page }) => {
    await probeSession(page);
    const s = stamp();
    const tracking = `CFBGT${s}TRACK1`;
    const pk = await createCagedFixture(page, {
      orderNumber: `CFBGT-${s}`,
      title: `Budget probe ${s}`,
      tracking,
      itemNumber: `ITM-BGT-${s}`,
    });
    await attachLabelFixture(page, pk, s, tracking);
    await page.request.post(`/api/orders/${pk}/cage-release`, {
      data: { action: 'docs-not-required', value: true },
    });

    await openBoundTriage(page, pk, `CFBGT-${s}`);
    // Click 1: jump to Review. Click 2: Release. (Open Add was the entry.)
    await page.getByTestId('triage-knob-review').click();
    await expect(page.getByTestId('triage-release')).toBeEnabled({ timeout: 15_000 });
    await page.getByTestId('triage-release').click();
    await expect(page.getByTestId('order-intake-form')).toBeHidden({ timeout: 15_000 });
  });

  test('E2E-DS: DS fields, one composed buy host, no second engine dialog', async ({ page }) => {
    await probeSession(page);
    await openTriageForm(page);
    // Textboxes / comboboxes from the DS, not page-local input forks.
    await expect(page.getByTestId('intake-order-number')).toHaveRole('textbox');
    await expect(page.getByTestId('intake-sku')).toHaveRole('textbox');
    await expect(page.getByTestId('intake-fulfillment-channel')).toHaveRole('combobox');
    // No modal dialog titled as a buy engine anywhere in the form.
    await expect(
      page.getByRole('dialog', { name: /buy label/i }),
    ).toHaveCount(0);
    // The buy host only ever renders as the composed section host.
    await expect(page.getByTestId('intake-label-buy')).toHaveCount(0); // unbound: not mounted
  });
});
