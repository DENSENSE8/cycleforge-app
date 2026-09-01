import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Unbox centre bands — Items · Label — are a full-row accordion.
 *
 * Placement is gone. Show / Hide label is the Label row itself. Headers do not
 * wrap into chips; each is end-to-end of the content well with the workbench
 * px-3 gutter.
 *
 * QA org:
 *   npx playwright test tests/e2e/unbox-band-accordion.spec.ts --project=qa-desktop
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-BAND-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.record?.id);
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: {
      receiving_id: receivingId,
      sku: `E2E-BAND-${uniq()}`,
      item_name: 'Band accordion fixture',
    },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

async function openUnbox(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('unbox-station-center')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('unbox-band-items')).toBeVisible({ timeout: 15_000 });
}

test.describe('Unbox centre band accordion', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'station centre is a desktop layout');

  test('the whole header row toggles, and a closed band stays a row', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    await expect(page.locator('[data-station-band-rail]')).toHaveCount(0);
    await expect(page.getByTestId('unbox-band-placement')).toHaveCount(0);

    const items = page.getByTestId('unbox-band-items');
    const label = page.getByTestId('unbox-band-label');
    const itemsToggle = items.locator('[data-collapse-toggle]');
    const labelToggle = label.locator('[data-collapse-toggle]');

    // Ticket mode may fold the centre. Open Items alone so Label stays shut —
    // Expand all would drag Label open with it.
    if ((await itemsToggle.getAttribute('aria-expanded')) !== 'true') {
      await itemsToggle.click();
    }
    await expect(itemsToggle).toHaveAttribute('aria-expanded', 'true');

    // Open band bodies inherit the shared well; headers sit on the header token.
    await expect(items.locator(':scope > .bg-surface-station-well')).toHaveCount(1);
    await expect(label.locator(':scope > .bg-surface-station-well')).toHaveCount(0);
    await expect(page.locator('[data-item-record-thumb]')).toHaveClass(/bg-surface-station-slot/);
    await expect(page.locator('[data-unbox-serial-input]')).toHaveClass(/bg-surface-station-slot/);

    const itemsBox = await itemsToggle.boundingBox();
    expect(itemsBox, 'hit target is a real row, not a 12px seam').toBeTruthy();
    expect(itemsBox!.height).toBeGreaterThanOrEqual(28);
    const centreBox = await page.getByTestId('unbox-station-center').boundingBox();
    expect(centreBox).toBeTruthy();
    // End-to-end of the column: the bar is flush, names keep px-3 inside it.
    expect(itemsBox!.width).toBeGreaterThan(centreBox!.width - 8);

    await expect(labelToggle).toHaveAttribute('aria-expanded', 'false');

    await labelToggle.click();
    await expect(labelToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(label.locator(':scope > .bg-surface-station-well')).toHaveCount(1);
    await expect(page.getByTestId('unbox-label-preview')).toBeVisible();
    await expect(page.getByTestId('unbox-label-show')).toHaveCount(0);
    await expect(page.getByTestId('unbox-label-hide')).toHaveCount(0);

    await labelToggle.click();
    await expect(labelToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('unbox-label-preview')).toHaveCount(0);
    await expect(label).toBeVisible();

    await itemsToggle.click();
    await expect(itemsToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(items).toBeVisible();
    await expect(labelToggle).toHaveAttribute('aria-expanded', 'false');
  });
});
