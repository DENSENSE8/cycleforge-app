import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Main Unbox active-line body is condition · serial only — the shared
 * ITEM PHOTOS eyebrow + camera was removed from `ActiveLineConditionSerial`.
 *
 * This spec pins that absence so a re-wire of `ReceivingPhotoButton` into
 * `LinePoItemsSection` / `UnmatchedAccordionSurface` does not land without an
 * intentional E2E rewrite (and the per-unit photo plan). Item-stage integrity
 * for mounts that still exist is covered by `item-photo-wiring.guard.test.ts`
 * + carton/arrival specs elsewhere.
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

async function openUnbox(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
}

test.describe('unbox item photo capture', () => {
  test('the active PO-line body has no Item photos row', async ({ request, page }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-unbox-item-photos]')).toHaveCount(0);
  });
});
