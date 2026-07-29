import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Photo evidence stages — WS-PHOTO station-staged photo chain.
 *
 * Stage SoT: `src/lib/photos/stages.ts` (PHOTO_EVIDENCE_STAGES + the cross-entity
 * write matrix) composing `src/lib/receiving/photo-intent.ts` (RECEIVING /
 * RECEIVING_LINE stage×type mapping) and `src/lib/receiving/photo-scope.ts`
 * (capture-surface scope → write target + phone-bridge routing). The matrix
 * under test:
 *
 *   RECEIVING       (carton) → receiving_package | receiving_unbox_carton | receiving (legacy)
 *   RECEIVING_LINE  (item)   → receiving_item
 *
 * Covers (see also photo-evidence-policy-gate.spec.ts for the mark-received
 * photo-policy gate, kept in its own file — that wiring is still landing):
 *   1. Triage carton pill → RECEIVING/package evidence only, never a line row.
 *   2. Unbox active-line item camera → RECEIVING_LINE/item evidence only.
 *   3. POST /api/photos/upload write-waist — illegal (entityType × photoType)
 *      pairs 400 before ever touching storage; the one legal carton-side unbox
 *      stamp 200s (gated — see below).
 *   4. /ops/photos stage sub-filter (`?sourceScope=unboxing&stage=unbox_item`)
 *      surfaces a line-linked tile with SKU + stage identity in the context panel.
 *   5. Phone-bridge capture routing.
 *
 * Phone-bridge routing choice (task item 5): this suite has NO existing
 * Ably-mock-at-the-page-level pattern (checked realtime-token.spec.ts and
 * photos-realtime-sync.spec.ts — both test the token/API layer only, never a
 * page-side `channel.publish` call), so per the assignment's own fallback
 * instruction this spec covers the MOBILE ROUTE variant instead of asserting a
 * captured Ably payload: visiting the phone-bridge deep links directly and
 * asserting the capture studio mounts with the correct per-stage header
 * (`photoStageLabel` via `src/lib/photos/stages.ts`), which is exactly what
 * `mobileCaptureHrefForRequest` (`photo-scope.ts`) builds for a real request.
 *
 * Gating: any test that needs a REAL successful `/api/photos/upload` (a 200,
 * not just the 400 write-waist) requires GCS configured — set
 * `E2E_PHOTOS_GCS=1`, mirroring `unit-photo-scan.spec.ts` / `photos-gcs-upload.spec.ts`.
 * Without it those tests skip (the write-waist 400s still run always — the
 * matrix check throws before `uploadPhoto()` ever reaches the storage adapter).
 *
 * Fixtures: cartons + lines are REAL rows created through the same production
 * endpoints the UI uses (`/api/receiving-entry` with `skipZohoMatch: true` for
 * an isolated `source='unmatched'` carton, then `/api/receiving/add-unmatched-line`
 * for a line) — no page.route mocking of receiving data, so the Unbox/Triage
 * workspace deep-link (`?openReceivingId=&lineId=`) resolves against real rows
 * exactly like `unbox-refresh-stickiness.spec.ts` proves for `/unbox`, and this
 * file exercises the identical mechanism on `/triage`. No serial is needed for
 * any scenario here (photo evidence primary-links RECEIVING/RECEIVING_LINE, not
 * SERIAL_UNIT).
 *
 * Cleanup / KNOWN GAP: photos are always deleted (`DELETE /api/photos/:id`) and
 * lines via `DELETE /api/receiving-lines?id=`. The carton itself is deleted via
 * `DELETE /api/receiving-logs?id=` (a real, permission-gated hard delete of
 * `receiving_carton` — confirmed in route source), but this is best-effort:
 * `receiving-entry` also writes a `receiving_triage` row (door stamp) and a
 * `receiving_scans` row in the SAME request, and this file could not verify
 * against a running server whether those carry `ON DELETE CASCADE` back to
 * `receiving_carton`. If they don't, the carton delete 500s and a residual,
 * zero-line, zero-photo `receiving_carton` row (tracking prefixed
 * `E2E-PHOTO-<tag>-`, easy to find/purge) is left in the target tenant. This is
 * intentionally non-fatal to the test (wrapped in `.catch(() => {})`) — flagged
 * for a human to verify on the first real run.
 */

// Minimal valid 1×1 JPEG — same fixture as unit-photo-scan.spec.ts /
// photos-gcs-upload.spec.ts. Only the JPEG magic + image/jpeg mime matter.
const TINY_JPEG = Buffer.from(
  '/9j/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64',
);

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Create a bare, unmatched receiving carton (zero lines) via the real intake
 * endpoint used by the desktop/mobile scan-in flow — `skipZohoMatch: true`
 * keeps the fixture isolated from the background Zoho auto-match `after()`
 * work. Returns the new `receiving_carton.id`.
 */
async function createUnmatchedCarton(request: APIRequestContext, tag: string): Promise<number> {
  const tracking = `E2E-PHOTO-${tag}-${uniq()}`;
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: tracking, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry failed (${res.status()}): ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  const id = Number(body?.record?.id);
  expect(Number.isFinite(id) && id > 0, `bad receiving id in response: ${JSON.stringify(body)}`).toBeTruthy();
  return id;
}

/** Add one manually-entered line to an unmatched carton — real `receiving_line` row. */
async function addLine(request: APIRequestContext, receivingId: number, sku: string): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: { receiving_id: receivingId, sku, item_name: `E2E Photo Evidence ${sku}` },
  });
  expect(res.ok(), `add-unmatched-line failed (${res.status()}): ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  const id = Number(body?.line?.id);
  expect(Number.isFinite(id) && id > 0, `bad line id in response: ${JSON.stringify(body)}`).toBeTruthy();
  return id;
}

/** Best-effort teardown — see the file-level docstring's carton-delete caveat. */
async function cleanupCarton(request: APIRequestContext, receivingId: number | null): Promise<void> {
  if (!receivingId) return;
  await request.delete(`/api/receiving-logs?id=${receivingId}`).catch(() => {});
}

async function cleanupLine(request: APIRequestContext, lineId: number | null): Promise<void> {
  if (!lineId) return;
  await request.delete(`/api/receiving-lines?id=${lineId}`).catch(() => {});
}

async function cleanupPhoto(request: APIRequestContext, photoId: number | null): Promise<void> {
  if (!photoId) return;
  await request.delete(`/api/photos/${photoId}`).catch(() => {});
}

// ─── 3. API write waist — POST /api/photos/upload (entityType × photoType) ────

test.describe('Photo write waist — entityType × photoType matrix (POST /api/photos/upload)', () => {
  test.skip(({ isMobile }) => isMobile, 'API contract — desktop project only');

  test('RECEIVING + receiving_item is rejected (400) — item stamp never lands on a carton', async ({ request }) => {
    const res = await request.post('/api/photos/upload', {
      multipart: {
        entityType: 'RECEIVING',
        entityId: '999999999',
        photoType: 'receiving_item',
        file: { name: 'e2e-waist.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG },
      },
    });
    expect(res.status(), await res.text()).toBe(400);
    const body = await res.json().catch(() => ({}));
    // src/lib/receiving/photo-intent.ts validateReceivingPhotoWrite — negative
    // lookahead so this doesn't also match the RECEIVING_LINE case below.
    expect(String(body.error ?? '')).toMatch(/not allowed on RECEIVING(?!_LINE)/i);
  });

  test('RECEIVING_LINE + receiving_package is rejected (400) — package stamp never lands on a line', async ({ request }) => {
    const res = await request.post('/api/photos/upload', {
      multipart: {
        entityType: 'RECEIVING_LINE',
        entityId: '999999999',
        photoType: 'receiving_package',
        file: { name: 'e2e-waist.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG },
      },
    });
    expect(res.status(), await res.text()).toBe(400);
    const body = await res.json().catch(() => ({}));
    expect(String(body.error ?? '')).toMatch(/not allowed on RECEIVING_LINE/i);
  });

  test('RECEIVING + receiving_unbox_carton is accepted (200) — the one legal carton-side unbox stamp', async ({ request }) => {
    test.skip(!process.env.E2E_PHOTOS_GCS, 'Set E2E_PHOTOS_GCS=1 (GCS configured) to run the real upload leg');

    let receivingId: number | null = null;
    let photoId: number | null = null;
    try {
      receivingId = await createUnmatchedCarton(request, 'waist');

      const res = await request.post('/api/photos/upload', {
        multipart: {
          entityType: 'RECEIVING',
          entityId: String(receivingId),
          photoType: 'receiving_unbox_carton',
          file: { name: 'e2e-waist.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG },
        },
      });
      expect(res.status(), await res.text()).toBe(200);
      const body = await res.json();
      photoId = Number(body.id);
      expect(photoId).toBeGreaterThan(0);

      const get = await request.get(`/api/receiving-photos?receivingId=${receivingId}&photoIntent=unbox_carton`);
      expect(get.ok()).toBeTruthy();
      const { photos } = await get.json();
      expect(
        (photos as Array<{ id: number }>).some((p) => p.id === photoId),
        'unbox_carton-intent GET should list the just-uploaded photo',
      ).toBe(true);
    } finally {
      await cleanupPhoto(request, photoId);
      await cleanupCarton(request, receivingId);
    }
  });
});

// ─── 1. Triage carton pill — package evidence only, never a line row ──────────

test.describe('Triage carton pill — package evidence only', () => {
  // Station chrome is a desktop surface (mirrors unbox-refresh-stickiness.spec.ts).
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only');
  test.skip(!process.env.E2E_PHOTOS_GCS, 'Set E2E_PHOTOS_GCS=1 (GCS configured) to run the real capture-pill upload');

  test('uploading via the triage carton pill creates RECEIVING/package evidence, never RECEIVING_LINE', async ({
    request,
    page,
  }) => {
    let receivingId: number | null = null;
    let lineId: number | null = null;
    let photoId: number | null = null;
    const sku = `E2E-TRIAGE-${uniq()}`;

    try {
      receivingId = await createUnmatchedCarton(request, 'triage');
      lineId = await addLine(request, receivingId, sku);

      // No networkidle: the workspace keeps polling/realtime requests open, so
      // idle never settles — the workspace testid below is the real ready gate.
      await page.goto(`/triage?openReceivingId=${receivingId}&lineId=${lineId}`);
      await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });

      // The condensed carton-context header's photo pill — default stage
      // (arrival_package) on Triage. A fresh carton has zero photos, so the
      // click deterministically opens the upload overlay (see ReceivingPhotoButton:
      // with existing photos AND phone-capable, a click sends to phone instead).
      const pill = page.getByRole('button', { name: /Add carton photos/i });
      await expect(pill).toBeVisible({ timeout: 10_000 });

      const uploadResponse = page.waitForResponse(
        (r) => r.url().includes('/api/photos/upload') && r.request().method() === 'POST',
        { timeout: 20_000 },
      );
      await pill.click();

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({ name: 'e2e-triage.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG });

      const res = await uploadResponse;
      expect(res.ok(), await res.text()).toBeTruthy();
      photoId = Number((await res.json()).id);
      expect(photoId).toBeGreaterThan(0);

      const itemGet = await request.get(`/api/receiving-photos?receivingId=${receivingId}&photoIntent=item`);
      expect(itemGet.ok()).toBeTruthy();
      const { photos: itemPhotos } = await itemGet.json();
      expect(
        (itemPhotos as Array<{ id: number }>).some((p) => p.id === photoId),
        'item-intent GET must NOT list a photo the triage carton pill created',
      ).toBe(false);

      const packageGet = await request.get(`/api/receiving-photos?receivingId=${receivingId}&photoIntent=package`);
      expect(packageGet.ok()).toBeTruthy();
      const { photos: packagePhotos } = await packageGet.json();
      expect(
        (packagePhotos as Array<{ id: number }>).some((p) => p.id === photoId),
        'package-intent GET should list the triage carton pill upload',
      ).toBe(true);
    } finally {
      await cleanupPhoto(request, photoId);
      await cleanupLine(request, lineId);
      await cleanupCarton(request, receivingId);
    }
  });
});

// ─── 2. Unbox active-line item camera — item evidence only ────────────────────

test.describe('Unbox active-line item camera — item evidence only', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only');
  test.skip(!process.env.E2E_PHOTOS_GCS, 'Set E2E_PHOTOS_GCS=1 (GCS configured) to run the real capture-pill upload');

  test('uploading via the unbox active-line item camera creates RECEIVING_LINE/receiving_item evidence, never carton evidence', async ({
    request,
    page,
  }) => {
    let receivingId: number | null = null;
    let lineId: number | null = null;
    let photoId: number | null = null;
    const sku = `E2E-UNBOX-${uniq()}`;

    try {
      receivingId = await createUnmatchedCarton(request, 'unbox');
      lineId = await addLine(request, receivingId, sku);

      // No networkidle: the unbox workspace keeps polling/realtime requests
      // open, so idle never settles — the workspace testid is the ready gate.
      await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
      await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });

      // The active-line ITEM cluster's camera pill (LineEditPanel.tsx —
      // photoStage="unbox_item" + receivingLineId={row.id}); "item" scopeNoun is
      // unique to this pill (the header's own carton pill says "carton photos").
      const pill = page.getByRole('button', { name: /Add item photos/i });
      await expect(pill).toBeVisible({ timeout: 10_000 });

      const uploadResponse = page.waitForResponse(
        (r) => r.url().includes('/api/photos/upload') && r.request().method() === 'POST',
        { timeout: 20_000 },
      );
      await pill.click();

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({ name: 'e2e-unbox-item.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG });

      const res = await uploadResponse;
      expect(res.ok(), await res.text()).toBeTruthy();
      photoId = Number((await res.json()).id);
      expect(photoId).toBeGreaterThan(0);

      const itemGet = await request.get(`/api/receiving-photos?receivingId=${receivingId}&photoIntent=item`);
      expect(itemGet.ok()).toBeTruthy();
      const { photos: itemPhotos } = await itemGet.json();
      expect(
        (itemPhotos as Array<{ id: number }>).some((p) => p.id === photoId),
        'item-intent GET should list the active-line camera upload',
      ).toBe(true);

      const packageGet = await request.get(`/api/receiving-photos?receivingId=${receivingId}&photoIntent=package`);
      expect(packageGet.ok()).toBeTruthy();
      const { photos: packagePhotos } = await packageGet.json();
      expect(
        (packagePhotos as Array<{ id: number }>).some((p) => p.id === photoId),
        'package-intent GET must NOT list the active-line camera upload',
      ).toBe(false);

      const unboxCartonGet = await request.get(`/api/receiving-photos?receivingId=${receivingId}&photoIntent=unbox_carton`);
      expect(unboxCartonGet.ok()).toBeTruthy();
      const { photos: unboxCartonPhotos } = await unboxCartonGet.json();
      expect(
        (unboxCartonPhotos as Array<{ id: number }>).some((p) => p.id === photoId),
        'unbox_carton-intent GET must NOT list the active-line camera upload',
      ).toBe(false);
    } finally {
      await cleanupPhoto(request, photoId);
      await cleanupLine(request, lineId);
      await cleanupCarton(request, receivingId);
    }
  });
});

// ─── 4. Library stage sub-filter — SKU + stage identity ───────────────────────

test.describe('Photo library — unbox_item stage filter surfaces line-linked SKU + stage identity', () => {
  // /ops/photos is a desktop ops surface — its grid chrome ("N photos in view")
  // doesn't render under phone emulation, so this runs on desktop only.
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only');

  test('a line-linked item photo tile shows its SKU and the context panel shows sku + stage', async ({ request, page }) => {
    test.skip(!process.env.E2E_PHOTOS_GCS, 'Set E2E_PHOTOS_GCS=1 (GCS configured) to seed a real item photo for this library assertion');

    let receivingId: number | null = null;
    let lineId: number | null = null;
    let photoId: number | null = null;
    const sku = `E2E-LIB-${uniq()}`;

    try {
      receivingId = await createUnmatchedCarton(request, 'lib');
      lineId = await addLine(request, receivingId, sku);

      const upload = await request.post('/api/photos/upload', {
        multipart: {
          entityType: 'RECEIVING_LINE',
          entityId: String(lineId),
          photoType: 'receiving_item',
          file: { name: 'e2e-lib.jpg', mimeType: 'image/jpeg', buffer: TINY_JPEG },
        },
      });
      expect(upload.status(), await upload.text()).toBe(200);
      photoId = Number((await upload.json()).id);
      expect(photoId).toBeGreaterThan(0);

      // Deep link proven by photos-library-deep-link.spec.ts's "unboxing stage
      // sub-filter" test; grid-sm is the flat contact-sheet view (tiles open the
      // shared lightbox — see photos-library-context-panel.spec.ts).
      await page.goto('/ops/photos?sourceScope=unboxing&stage=unbox_item&view=grid-sm');
      await expect(page.getByText(/photos? in view/i)).toBeVisible();

      // PhotoCard.tsx stamps data-photo-id — locate THIS photo's tile precisely
      // rather than fuzzy-matching visible text (house selector discipline).
      const tile = page.locator(`[data-testid="photo-tile"][data-photo-id="${photoId}"]`);
      await expect(tile).toBeVisible({ timeout: 20_000 });

      await tile.click();
      await expect(page.getByTestId('photo-lightbox')).toBeVisible();
      await page.getByRole('button', { name: /show photo details/i }).click();
      await expect(page.getByTestId('photo-context-panel')).toBeVisible();

      await expect(page.getByTestId('photo-context-sku')).toHaveText(sku);
      // photoStageLabel('unbox_item') — src/lib/photos/stages.ts.
      await expect(page.getByTestId('photo-context-stage')).toHaveText('Unbox · item');
    } finally {
      await cleanupPhoto(request, photoId);
      await cleanupLine(request, lineId);
      await cleanupCarton(request, receivingId);
    }
  });
});

// ─── 5. Phone-bridge capture routing (mobile-route variant — see docstring) ───

test.describe('Phone-bridge photo capture routing — mobile studio renders per stage', () => {
  test.skip(({ isMobile }) => !isMobile, 'mobile-only');

  test('carton stage deep link (/m/r/[id]/photos?stage=unbox_carton) renders the Unbox · carton studio', async ({ page }) => {
    // mobileCaptureHrefForRequest (photo-scope.ts) routes a carton-stage phone
    // request here. The page resolves headerLabel best-effort but renders the
    // capture studio regardless of whether the id resolves to real data, so any
    // finite positive id is a valid, deterministic assertion target.
    const receivingId = process.env.PW_TEST_RECEIVING_ID || '1';
    await page.goto(`/m/r/${receivingId}/photos?stage=unbox_carton`);

    // MobileReceivingPhotoStudio's header eyebrow — photoStageLabel('unbox_carton').
    await expect(page.getByText('Unbox · carton')).toBeVisible({ timeout: 15_000 });
    // Sanity the capture studio (not an error/blank screen) actually mounted.
    await expect(page.getByRole('button', { name: /close camera/i })).toBeVisible();
  });

  test('item stage deep link (/m/receiving/po/[poId]/item/[itemId]/photos?stage=unbox_item) renders the Unbox · item studio', async ({
    page,
  }) => {
    // Unlike the carton route, the item route gates its render on
    // GET /api/receiving/po/{poId} resolving a real item.receiving_id — mock it
    // so this assertion needs no live Zoho PO fixture (mirrors the established
    // page.route mocking recipe in unbox-refresh-stickiness.spec.ts /
    // testing-lineless-carton-scan.spec.ts for this same receiving domain).
    const poId = 'E2E-PHOTO-PO';
    const itemId = 4242;

    await page.route(`**/api/receiving/po/${encodeURIComponent(poId)}`, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          header: { po_number: poId, po_id: poId },
          items: [{ id: itemId, receiving_id: 1, item_name: 'E2E Item', sku: 'E2E-SKU' }],
        }),
      }),
    );

    await page.goto(`/m/receiving/po/${poId}/item/${itemId}/photos?stage=unbox_item`);

    await expect(page.getByText('Unbox · item')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /close camera/i })).toBeVisible();
  });
});
