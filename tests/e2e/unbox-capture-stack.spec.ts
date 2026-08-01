import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Capture stack — the Phase-2 (read-only) half of lane B's coverage table
 * (`docs/todo/unbox-B-step-procedure-PLAN.md` → Playwright coverage).
 *
 * Covered here because it is observable with the stack mounted read-only:
 * step order · push-up · photo stage integrity · condition skip · vocabulary
 * per intake type. Back/forward, the multi-qty loop, wedge focus and scroll
 * depth need the anchored input and land with Phase 3 — they are deliberately
 * NOT stubbed here, because a passing test for behavior that does not exist yet
 * is worse than a missing one.
 *
 * Runs on the QA org (`qa-desktop`), never the dogfood tenant
 * (`.claude/rules/verify.md`). Each test provisions the exact carton shape it
 * asserts on rather than hunting for one, so nothing depends on what the tenant
 * happens to hold today.
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-CSTACK-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  const id = Number((await res.json())?.record?.id);
  expect(Number.isFinite(id) && id > 0).toBeTruthy();
  return id;
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: {
      receiving_id: receivingId,
      sku: `E2E-CS-${uniq()}`,
      item_name: 'Capture stack fixture',
    },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

/** Classify the carton — answers the unfound flow's first step. */
async function classify(request: APIRequestContext, receivingId: number, kind = 'RETURN') {
  const res = await request.patch(`/api/receiving/${receivingId}`, { data: { intake_type: kind } });
  expect(res.ok(), `classify ${res.status()}: ${await res.text()}`).toBeTruthy();
}

/**
 * Attach one photo at an explicit stage. Same-origin URL is the allowlisted dev
 * path; `photoType` is validated against the stage SoT server-side.
 */
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
      photoUrl: `/api/nas-dev/e2e-cstack-${uniq()}.jpg`,
      photoType,
    },
  });
  expect(res.ok(), `attach ${photoType} ${res.status()}: ${await res.text()}`).toBeTruthy();
}

async function openUnbox(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-capture-step]').first()).toBeVisible({ timeout: 30_000 });
}

/** The rendered step keys, top to bottom — the ledger then the active card. */
async function stepKeys(page: Page): Promise<string[]> {
  const steps = page.locator('[data-capture-step]');
  return (await steps.all()).reduce<Promise<string[]>>(
    async (acc, el) => [...(await acc), String(await el.getAttribute('data-capture-step'))],
    Promise.resolve([]),
  );
}

/**
 * Assert on the SETTLED stack, not the first paint.
 *
 * The step states depend on an async per-stage photo count, so a one-shot read
 * samples whatever happened to be on screen — the failure mode that made this
 * suite pass vacuously on cartons whose evidence had not loaded yet. Poll the
 * invariant instead.
 */
async function expectSteps(page: Page, expected: string[]) {
  // Generous budget on purpose: the stack settles behind a per-stage photo
  // query, and in dev the first hit on a route also pays compilation. A 20s
  // budget was marginal enough to flake when the whole file runs.
  await expect.poll(() => stepKeys(page), { timeout: 45_000 }).toEqual(expected);
}

test.describe('unbox capture stack (read-only)', () => {
  test('step order: the active step is last and expanded, pending steps are absent', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    // A fresh unfound carton: Classify is the whole stack — everything after it
    // is pending, and pending never renders (it would push the active card up).
    await expectSteps(page, ['classify']);

    const active = page.locator('[data-capture-step="classify"]');
    await expect(active).toContainText(/current step/i);
  });

  test('push-up: completing a step collapses it and promotes the next', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);

    await openUnbox(page, receivingId, lineId);
    const before = await page.locator('[data-capture-step="classify"]').boundingBox();

    await classify(request, receivingId);
    await page.reload();
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-capture-step="po_photos"]')).toBeVisible({ timeout: 30_000 });

    // Classify is now ledger; PO photos is the active card BELOW it.
    await expectSteps(page, ['classify', 'po_photos']);

    const collapsed = await page.locator('[data-capture-step="classify"]').boundingBox();
    const promoted = await page.locator('[data-capture-step="po_photos"]').boundingBox();
    expect(collapsed!.height, 'a completed step collapses').toBeLessThan(before!.height);
    expect(promoted!.y, 'the active card sits below the ledger').toBeGreaterThan(collapsed!.y);
  });

  test('photo stage integrity: a bench carton shot never satisfies the arrival step', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await classify(request, receivingId);

    // The bench's own capture — `unbox_carton`, the stage packing material folds
    // onto. It must satisfy step 2 and leave step 1 (the door's insurance shot)
    // untouched: `require_one` counts only `arrival_package`.
    await attachPhoto(request, receivingId, 'receiving_unbox_carton');
    await openUnbox(page, receivingId, lineId);

    // Packing material is satisfied and drops into the ledger even though it is
    // LATER in the vocabulary (checklist, not wizard). PO photos — the door's
    // insurance shot — is untouched, so it stays the active card at the bottom.
    // `require_one` counts only `arrival_package`, so a bench shot satisfying it
    // would void the gate.
    await expectSteps(page, ['classify', 'packing_material', 'po_photos']);
    await expect(page.locator('[data-capture-step="po_photos"]')).toContainText(/current step/i);
    await expect(page.locator('[data-capture-step="packing_material"]')).not.toContainText(
      /current step/i,
    );
  });

  test('condition skip: the pointer lands on serial, never on the defaulted grade', async ({
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

    // Condition sits in the ledger (behind the pointer, showing its default
    // grade) and Serial is the active card — the pointer never rests on a
    // decision that already has a correct answer.
    await expectSteps(page, [
      'classify',
      'po_photos',
      'packing_material',
      'item_photos',
      'condition',
      'serial',
    ]);
    await expect(page.locator('[data-capture-step="serial"]')).toContainText(/current step/i);
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

    // Serial identifies WHICH unit is being graded, so on a return it precedes
    // Condition — which means Serial is the active card and Condition has not
    // been reached yet (pending steps do not render).
    await expectSteps(page, ['classify', 'po_photos', 'packing_material', 'item_photos', 'serial']);
    await expect(page.locator('[data-capture-step="serial"]')).toContainText(/current step/i);
  });
});
