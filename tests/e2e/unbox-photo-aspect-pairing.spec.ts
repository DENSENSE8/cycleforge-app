import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Pair an existing carton photo with a capture step — `PATCH
 * /api/photos/[id]/aspect` and the step-body panel that drives it.
 *
 * ## Why the round trip is asserted through the UI
 *
 * `photos.photo_aspect` was write-once at INSERT until 2026-08-02, so a carton
 * shot that arrived with no aspect could never satisfy the step it depicts —
 * every layer correct in isolation, nothing erroring, the pointer parked
 * forever. That is the same shape as the `normalizeRow` gap: a route returning
 * 200 was never evidence. So the pair is made by CLICKING, and the result is
 * read off both procedure surfaces — the deck in the centre and the checklist on
 * the right edge, which share one derivation and must therefore agree.
 *
 * QA org only (`.claude/rules/verify.md`); each test provisions its own carton.
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-ASPECT-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.record?.id);
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: { receiving_id: receivingId, sku: `E2E-AS-${uniq()}`, item_name: 'Aspect fixture' },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

async function classify(request: APIRequestContext, receivingId: number, kind = 'PO') {
  const res = await request.patch(`/api/receiving/${receivingId}`, { data: { intake_type: kind } });
  expect(res.ok(), `classify ${res.status()}: ${await res.text()}`).toBeTruthy();
}

/** Attach a photo and return its id. `photoAspect` omitted ⇒ unclassified. */
async function attachPhoto(
  request: APIRequestContext,
  receivingId: number,
  photoType: string,
  opts: { photoAspect?: string } = {},
): Promise<number> {
  const res = await request.post('/api/receiving-photos', {
    data: {
      receivingId,
      ...(opts.photoAspect ? { photoAspect: opts.photoAspect } : {}),
      photoUrl: `/api/nas-dev/e2e-aspect-${uniq()}.jpg`,
      photoType,
    },
  });
  expect(res.ok(), `attach ${photoType} ${res.status()}: ${await res.text()}`).toBeTruthy();
  const json = await res.json();
  return Number(json?.photo?.id ?? json?.id);
}

/**
 * Open the carton with the Displays column already on the Checklist, so the
 * deck and the checklist are on screen together and can be compared.
 *
 * No `networkidle` — the realtime channel means /unbox never settles.
 */
async function openUnbox(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('unbox-displays-pane-toggle').click();
  await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('unbox-displays-expand-button').click();
  await expect(page.locator('[data-procedure-deck]')).toBeVisible({ timeout: 30_000 });
}

/** Step state on ONE named surface — never a bare `[data-procedure-step]`. */
function stepState(page: Page, surface: 'deck' | 'checklist', key: string) {
  const root = surface === 'deck' ? '[data-procedure-deck]' : '[data-procedure-checklist]';
  return page.locator(`${root} [data-procedure-step="${key}"]`);
}

async function expectStepState(
  page: Page,
  surface: 'deck' | 'checklist',
  key: string,
  state: string,
) {
  await expect
    .poll(
      () => stepState(page, surface, key).getAttribute('data-procedure-state'),
      { timeout: 45_000, message: `${surface}: ${key} → ${state}` },
    )
    .toBe(state);
}

test.describe('unbox carton photo aspect pairing', () => {
  test('an unclassified carton shot is paired from the step, then cleared', async ({
    request,
    page,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await classify(request, receivingId);
    // Arrival evidence so the pointer lands on the first BENCH shot.
    await attachPhoto(request, receivingId, 'receiving_package');
    // The subject: a bench shot with no aspect. This is what a phone capture
    // launched from generic chrome produces, and before the aspect write path
    // it could satisfy nothing.
    await attachPhoto(request, receivingId, 'receiving_unbox_carton');

    await openUnbox(page, receivingId, lineId);

    // Unclassified evidence is not missing evidence — the photo counts on the
    // carton, and the step it depicts is still pending.
    await expectStepState(page, 'deck', 'shipping_label_photo', 'active');
    await expectStepState(page, 'checklist', 'shipping_label_photo', 'active');

    const deckCard = stepState(page, 'deck', 'shipping_label_photo');
    await deckCard.getByRole('button', { name: /pair an existing photo/i }).click();

    const row = deckCard.locator('li', { hasText: /unclassified/i }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole('button', { name: /this one/i }).click();

    // Both surfaces read ONE derivation, so both must flip. Checking only the
    // deck would pass on a UI that had grown a second, local answer.
    await expectStepState(page, 'deck', 'shipping_label_photo', 'done');
    await expectStepState(page, 'checklist', 'shipping_label_photo', 'done');
    // One photo, one aspect — pairing must not satisfy the two siblings.
    await expectStepState(page, 'checklist', 'box_photo', 'active');
    await expectStepState(page, 'checklist', 'packing_material', 'pending');

    // Backward: name it as nothing again. The claim is retractable, and the
    // step must go back to pending rather than staying done off a stale count.
    const boxCard = stepState(page, 'deck', 'box_photo');
    await boxCard.getByRole('button', { name: /pair an existing photo/i }).click();
    const paired = boxCard.locator('li', { hasText: /shipping label/i }).first();
    await paired.getByRole('button', { name: /name what this photo shows/i }).click();
    await page.getByRole('menuitem', { name: /clear — unclassified/i }).click();

    await expectStepState(page, 'deck', 'shipping_label_photo', 'active');
    await expectStepState(page, 'checklist', 'shipping_label_photo', 'active');
  });

  test('an aspect illegal for the photo stage is rejected, and require_one is unaffected', async ({
    request,
  }) => {
    const receivingId = await createCarton(request);
    await addLine(request, receivingId);
    const arrivalPhotoId = await attachPhoto(request, receivingId, 'receiving_package');

    // `arrival_package` is the pre-opening door stage and the ONLY stage the
    // `require_one` receive gate counts. A bench aspect there would describe a
    // photo taken after the box was open.
    const rejected = await request.patch(`/api/photos/${arrivalPhotoId}/aspect`, {
      data: { aspect: 'packing_material' },
    });
    expect(rejected.status(), await rejected.text()).toBe(400);

    // A missing key is a 400 too — "clear" and "don't touch" must not be
    // spelled the same way.
    const missing = await request.patch(`/api/photos/${arrivalPhotoId}/aspect`, { data: {} });
    expect(missing.status(), await missing.text()).toBe(400);

    // An unknown string is a 400, never a silent clear of a correct claim.
    const unknown = await request.patch(`/api/photos/${arrivalPhotoId}/aspect`, {
      data: { aspect: 'shipping-label' },
    });
    expect(unknown.status(), await unknown.text()).toBe(400);

    // A LEGAL pre-opening aspect still lands, and the arrival photo still
    // counts for the receive gate afterwards — classification names a shot, it
    // never moves it between stages.
    const ok = await request.patch(`/api/photos/${arrivalPhotoId}/aspect`, {
      data: { aspect: 'box_exterior' },
    });
    expect(ok.ok(), `${ok.status()}: ${await ok.text()}`).toBeTruthy();

    const photos = await request.get(
      `/api/receiving-photos?receivingId=${receivingId}&photoIntent=package`,
    );
    expect(photos.ok()).toBeTruthy();
    const rows = ((await photos.json())?.photos ?? []) as Array<{
      id: number;
      photoAspect: string | null;
    }>;
    const arrival = rows.find((p) => p.id === arrivalPhotoId);
    expect(arrival, 'the arrival photo is still arrival evidence').toBeTruthy();
    expect(arrival?.photoAspect).toBe('box_exterior');
  });
});
