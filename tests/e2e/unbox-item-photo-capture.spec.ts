import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * The desktop's item-evidence surface — `unbox_item` on the active line.
 *
 * Until 2026-08-01 there was none: `ReceivingPhotoButton` documented an item
 * mode (`photoStage="unbox_item"` + `receivingLineId`) that no desktop call site
 * mounted, so a bench operator could shoot item photos from their phone and not
 * from the station. The pill now hangs on the active line's work body, beside
 * the condition and serial steps it sits between in the procedure.
 *
 * This closes the last cell of lane B's photo-stage-integrity row. The carton
 * leg is pinned in `unbox-procedure-checklist.spec.ts` ("a bench carton shot
 * never satisfies the arrival step"); the item leg is here.
 *
 * The assertion is deliberately about SCOPE, not about a file landing on disk:
 * the failure mode this guards is a mis-threaded stage — an item control that
 * counts, or writes, carton evidence. Whether bytes reach the NAS is a different
 * spec with a different (mount-dependent) fixture.
 *
 * QA org only (`.claude/rules/verify.md`).
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-ITEMPHOTO-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.record?.id);
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: { receiving_id: receivingId, sku: `E2E-IP-${uniq()}`, item_name: 'Item photo fixture' },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
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
      photoUrl: `/api/nas-dev/e2e-ip-${uniq()}.jpg`,
      photoType,
    },
  });
  expect(res.ok(), `attach ${photoType} ${res.status()}: ${await res.text()}`).toBeTruthy();
}

async function openUnbox(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
}

/** The labeled item-photos step row on the active line's work body. */
const itemPhotoRow = (page: Page) => page.locator('[data-unbox-item-photos]').first();
const itemPhotoPill = (page: Page) => itemPhotoRow(page).getByRole('button').first();

test.describe('unbox item photo capture', () => {
  test('the active line carries an item-scoped capture control', async ({ request, page }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    await expect(itemPhotoRow(page)).toBeVisible({ timeout: 30_000 });
    await expect(itemPhotoRow(page)).toContainText(/item photos/i);

    // The pill names its own scope. "carton" here would mean the mount lost its
    // line id and is writing carton evidence under an item label — the exact
    // half-wiring `item-photo-wiring.guard.test.ts` pins at the source.
    await expect(itemPhotoPill(page)).toHaveAttribute('aria-label', /\bitem\b/i);
    await expect(itemPhotoPill(page)).not.toHaveAttribute('aria-label', /\bcarton\b/i);
  });

  test('carton and arrival evidence never satisfy the item control', async ({ request, page }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);

    // Both non-item stages, on the carton: the door's insurance shot and the
    // bench's own carton capture. Neither is a photo OF THE ITEM.
    await attachPhoto(request, receivingId, 'receiving_package');
    await attachPhoto(request, receivingId, 'receiving_unbox_carton');

    await openUnbox(page, receivingId, lineId);
    await expect(itemPhotoRow(page)).toBeVisible({ timeout: 30_000 });

    // Empty item scope renders the "+" face — a count would mean the pill is
    // reading the carton's evidence set. Poll: the count is an async fetch, so a
    // one-shot read would pass before the wrong number ever arrived.
    await expect
      .poll(async () => (await itemPhotoPill(page).innerText()).trim(), { timeout: 30_000 })
      .toBe('');

    // Now the real thing — line-scoped item evidence.
    await attachPhoto(request, receivingId, 'receiving_item', lineId);
    await openUnbox(page, receivingId, lineId);

    await expect
      .poll(async () => (await itemPhotoPill(page).innerText()).trim(), {
        timeout: 30_000,
        message: 'the item pill counts item evidence, and only item evidence',
      })
      .toBe('1');
  });
});
