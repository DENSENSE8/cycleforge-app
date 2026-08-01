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
  receivingLineId?: number,
) {
  const res = await request.post('/api/receiving-photos', {
    data: {
      receivingId,
      ...(receivingLineId != null ? { receivingLineId } : {}),
      photoUrl: `/api/nas-dev/e2e-proc-${uniq()}.jpg`,
      photoType,
    },
  });
  expect(res.ok(), `attach ${photoType} ${res.status()}: ${await res.text()}`).toBeTruthy();
}

/**
 * Open the carton with its Displays column already on the Checklist display.
 *
 * `?display=` is the column's URL-durable open state (absence IS closed), so
 * deep-linking is the honest way in — it exercises the same param a reload or a
 * shared link uses, rather than driving the strip's overflow menu.
 */
async function openUnbox(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}&display=checklist`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
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
      .toEqual(['classify', 'po_photos', 'packing_material', 'item_photos', 'condition', 'serial']);
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

    await expectActive(page, ['po_photos']);
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

    // `unbox_carton` is the bench's own capture — the stage packing material
    // folds onto. `require_one` counts only `arrival_package`, so satisfying
    // step 1 from the bench would void the receive gate.
    await attachPhoto(request, receivingId, 'receiving_unbox_carton');
    await openUnbox(page, receivingId, lineId);

    await expectActive(page, ['po_photos']);
    await expect(page.locator('[data-procedure-step="packing_material"]')).toHaveAttribute(
      'data-procedure-state',
      'done',
    );
  });

  test('the pointer skips condition — a defaulted grade is not a gate', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await classify(request, receivingId, 'PO');
    await attachPhoto(request, receivingId, 'receiving_package');
    await attachPhoto(request, receivingId, 'receiving_unbox_carton');
    await attachPhoto(request, receivingId, 'receiving_item', lineId);

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
    await attachPhoto(request, receivingId, 'receiving_unbox_carton');
    await attachPhoto(request, receivingId, 'receiving_item', lineId);

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
