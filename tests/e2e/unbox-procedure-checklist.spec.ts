import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Unbox procedure checklist — the `checklist` display in the right-edge Displays
 * push column. The procedure IS the checklist; there is no second one, and it is
 * never in the work surface.
 *
 * Covers the read-only half of lane B's coverage table: step order · pointer
 * advance · photo stage integrity · condition skip · vocabulary per intake type.
 * Back/forward, the multi-qty loop, wedge focus and scroll depth need the
 * anchored input and land with the next phase — deliberately not stubbed here,
 * because a passing test for behavior that does not exist is worse than none.
 *
 * QA org only (`.claude/rules/verify.md`); each test provisions the exact carton
 * shape it asserts on.
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-PROC-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.record?.id);
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: { receiving_id: receivingId, sku: `E2E-PR-${uniq()}`, item_name: 'Procedure fixture' },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

async function classify(request: APIRequestContext, receivingId: number, kind = 'RETURN') {
  const res = await request.patch(`/api/receiving/${receivingId}`, { data: { intake_type: kind } });
  expect(res.ok(), `classify ${res.status()}: ${await res.text()}`).toBeTruthy();
}

async function attachPhoto(
  request: APIRequestContext,
  receivingId: number,
  photoType: string,
  opts: { receivingLineId?: number; photoAspect?: string } = {},
) {
  const res = await request.post('/api/receiving-photos', {
    data: {
      receivingId,
      ...(opts.receivingLineId != null ? { receivingLineId: opts.receivingLineId } : {}),
      ...(opts.photoAspect ? { photoAspect: opts.photoAspect } : {}),
      photoUrl: `/api/nas-dev/e2e-proc-${uniq()}.jpg`,
      photoType,
    },
  });
  expect(res.ok(), `attach ${photoType} ${res.status()}: ${await res.text()}`).toBeTruthy();
}

/** All three bench carton shots — one per aspect, which is what the gates want. */
async function attachCartonShots(request: APIRequestContext, receivingId: number) {
  for (const aspect of ['shipping_label', 'box_exterior', 'packing_material']) {
    await attachPhoto(request, receivingId, 'receiving_unbox_carton', { photoAspect: aspect });
  }
}

async function confirmContents(request: APIRequestContext, receivingId: number) {
  const res = await request.post(`/api/receiving/${receivingId}/contents-confirm`, {
    data: { confirmed: true },
  });
  expect(res.ok(), `contents-confirm ${res.status()}: ${await res.text()}`).toBeTruthy();
}

/**
 * Open the carton with its Displays column already on the Checklist display.
 * Leaf selection is local React state — open via ←| then the strip progress ring.
 */
async function openUnbox(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('unbox-displays-pane-toggle').click();
  await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('unbox-displays-expand-button').click();
  // The procedure lives in the Displays column — never in the work surface.
  await expect(page.locator('[data-procedure-step]').first()).toBeVisible({ timeout: 30_000 });
}

const stepKeys = (page: Page) =>
  page.locator('[data-procedure-step]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-procedure-step') ?? ''),
  );

const activeKeys = (page: Page) =>
  page
    .locator('[data-procedure-state="active"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-procedure-step') ?? ''));

/** Assert on the SETTLED checklist — step state depends on an async photo count. */
async function expectActive(page: Page, expected: string[]) {
  await expect.poll(() => activeKeys(page), { timeout: 45_000 }).toEqual(expected);
}

test.describe('unbox procedure checklist', () => {
  test('renders the whole procedure in order, with exactly one active step', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    // A checklist shows the WHOLE procedure — pending steps included. That is
    // the point of moving it out of the work surface.
    await expect
      .poll(() => stepKeys(page), { timeout: 45_000 })
      .toEqual([
        'classify',
        'arrival_label_photo',
        'shipping_label_photo',
        'box_photo',
        'packing_material',
        'contents',
        'condition',
        'item_photos',
        'serial',
      ]);
    await expectActive(page, ['classify']);
  });

  test('completing a step advances the pointer without reordering the list', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);

    await openUnbox(page, receivingId, lineId);
    await expectActive(page, ['classify']);
    const orderBefore = await stepKeys(page);

    // Classify as PO: the intake kind is itself vocabulary input (a RETURN
    // legitimately moves Serial ahead of Condition), so PO keeps the step list
    // fixed and isolates the thing under test — the pointer moving.
    await classify(request, receivingId, 'PO');
    // Re-open rather than reload+goto: one navigation, one settle.
    await openUnbox(page, receivingId, lineId);

    await expectActive(page, ['arrival_label_photo']);
    expect(await stepKeys(page), 'the list does not reorder as work lands').toEqual(orderBefore);
    await expect(page.locator('[data-procedure-step="classify"]')).toHaveAttribute(
      'data-procedure-state',
      'done',
    );
  });

  test('a bench carton shot never satisfies the arrival step', async ({ request, page }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await classify(request, receivingId);

    // `unbox_carton` is the bench's own capture. `require_one` counts only
    // `arrival_package`, so satisfying step 1 from the bench would void the
    // receive gate.
    await attachCartonShots(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    await expectActive(page, ['arrival_label_photo']);
    await expect(page.locator('[data-procedure-step="packing_material"]')).toHaveAttribute(
      'data-procedure-state',
      'done',
    );
  });

  test('one carton shot cannot satisfy all three carton steps', async ({ request, page }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await classify(request, receivingId, 'PO');
    await attachPhoto(request, receivingId, 'receiving_package');
    // Shipping label ONLY. The three bench steps share the `unbox_carton`
    // stage and are told apart by aspect — gating them on the stage count
    // would mark the box and the dunnage done off this single photo.
    await attachPhoto(request, receivingId, 'receiving_unbox_carton', {
      photoAspect: 'shipping_label',
    });

    await openUnbox(page, receivingId, lineId);

    await expectActive(page, ['box_photo']);
    await expect(page.locator('[data-procedure-step="shipping_label_photo"]')).toHaveAttribute(
      'data-procedure-state',
      'done',
    );
    await expect(page.locator('[data-procedure-step="packing_material"]')).toHaveAttribute(
      'data-procedure-state',
      'pending',
    );
  });

  test('condition is gated on the grading act, not on the defaulted grade', async ({
    request,
    page,
  }) => {
    // Reversal of the old "the pointer skips condition" rule: `condition_grade`
    // is NOT NULL with a default, so it exists on a carton nobody has touched
    // and can never be the gate. `condition_graded_at` — the ACT — is.
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await classify(request, receivingId, 'PO');
    await attachPhoto(request, receivingId, 'receiving_package');
    await attachCartonShots(request, receivingId);
    await confirmContents(request, receivingId);
    await attachPhoto(request, receivingId, 'receiving_item', { receivingLineId: lineId });

    await openUnbox(page, receivingId, lineId);

    // Everything before Condition is done, and the pointer STOPS there — it
    // used to step over it.
    await expectActive(page, ['condition']);
    await expect(page.locator('[data-procedure-step="contents"]')).toHaveAttribute(
      'data-procedure-state',
      'done',
    );

    const graded = await request.patch(`/api/receiving/lines/${lineId}/condition`, {
      data: { condition_grade: 'USED_A' },
    });
    expect(graded.ok(), `condition ${graded.status()}: ${await graded.text()}`).toBeTruthy();

    await openUnbox(page, receivingId, lineId);
    await expectActive(page, ['serial']);
    await expect(page.locator('[data-procedure-step="condition"]')).toHaveAttribute(
      'data-procedure-state',
      'done',
    );
  });

  test('vocabulary is data: a return captures the serial before the grade', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await classify(request, receivingId, 'RETURN');
    await attachPhoto(request, receivingId, 'receiving_package');
    await attachCartonShots(request, receivingId);
    await attachPhoto(request, receivingId, 'receiving_item', { receivingLineId: lineId });

    await openUnbox(page, receivingId, lineId);

    // Poll the ORDER, don't snapshot it. The vocabulary is derived from row
    // fields (`intake_type`, `zoho_purchaseorder_id`) that hydrate async, so a
    // one-shot read taken the instant the first step paints can catch the
    // pre-swap shape — the latent race behind the 9/10 repeat-run result this
    // spec used to show. Every other assertion here already waits; this one
    // was the exception.
    await expect
      .poll(
        async () => {
          const keys = await stepKeys(page);
          return keys.indexOf('serial') < keys.indexOf('condition');
        },
        { timeout: 45_000, message: 'the scan names the unit being graded' },
      )
      .toBe(true);
    await expectActive(page, ['serial']);
  });
});
