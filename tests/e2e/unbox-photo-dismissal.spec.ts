import { test, expect, type Page, type Route } from '@playwright/test';

const RECEIVING_ID = 101;
const LINE_ID = 201;

const receivingLine = {
  id: LINE_ID,
  receiving_id: RECEIVING_ID,
  tracking_number: 'PHOTO-DISMISSAL-001',
  carrier: null,
  zoho_item_id: 'ZI-PHOTO-001',
  zoho_line_item_id: 'ZLI-PHOTO-001',
  zoho_purchase_receive_id: null,
  zoho_purchaseorder_id: 'PO-PHOTO-001',
  zoho_purchaseorder_number: 'PHOTO-PO-001',
  item_name: 'Photo dismissal fixture',
  sku: 'PHOTO-DISMISSAL-SKU',
  quantity_received: 0,
  quantity_expected: 1,
  qa_status: 'PENDING',
  workflow_status: null,
  disposition_code: 'PENDING',
  condition_grade: 'A',
  disposition_audit: [],
  needs_test: false,
  assigned_tech_id: null,
  zoho_sync_source: null,
  zoho_last_modified_time: null,
  zoho_synced_at: null,
  receiving_type: 'PO',
  notes: null,
  image_url: null,
  source_platform: null,
  created_at: '2026-01-01T00:00:00.000Z',
  receiving_source: 'zoho_po',
  serials: [],
};

async function routeFixtureApis(page: Page): Promise<void> {
  await page.route('**/api/receiving-lines**', async (route: Route) => {
    const url = route.request().url();
    const byCarton = url.includes(`receiving_id=${RECEIVING_ID}`);
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        success: true,
        receiving_lines: byCarton ? [receivingLine] : [],
      }),
    });
  });

  await page.route('**/api/receiving-photos**', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        photos: [
          {
            id: 501,
            receivingId: RECEIVING_ID,
            photoUrl: '/api/nas-dev/photo-dismissal-fixture.jpg',
            caption: 'Dismissal fixture',
            uploadedBy: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            clientCapturedAt: null,
          },
        ],
      }),
    });
  });
}

test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only');

test('photo viewer stays open for inside clicks, then closes by X and scrim click-off', async ({ page }) => {
  await routeFixtureApis(page);
  await page.goto(`/unbox?openReceivingId=${RECEIVING_ID}&lineId=${LINE_ID}`);

  await expect(page.locator('[data-testid="carton-context-one-row"]')).toBeVisible({ timeout: 30_000 });
  const photoTrigger = page.getByRole('button', { name: /photos/i }).first();
  await expect(photoTrigger).toBeVisible();

  await photoTrigger.hover();
  await expect(page.getByTestId('photo-launcher-toolbar')).toBeVisible({ timeout: 5_000 });
  await page.getByRole('menuitem', { name: 'View' }).click();

  const lightbox = page.getByTestId('photo-lightbox');
  await expect(lightbox).toBeVisible();

  // The bug: this click is inside the portaled viewer but outside the enclosing
  // AnchoredLayer. The viewer must remain mounted after the outer mousedown.
  await lightbox.locator('[aria-label="More photo actions"]').click();
  await expect(lightbox).toBeVisible();
  await expect(lightbox.getByRole('menu', { name: 'Photo actions' })).toBeVisible();

  // The viewer's explicit close button remains an intentional dismissal path.
  await lightbox.getByRole('button', { name: /close/i }).click();
  await expect(lightbox).toBeHidden({ timeout: 5_000 });

  // Reopen and verify true click-off on the viewer scrim also closes it.
  await photoTrigger.hover();
  await expect(page.getByTestId('photo-launcher-toolbar')).toBeVisible({ timeout: 5_000 });
  await page.getByRole('menuitem', { name: 'View' }).click();
  await expect(lightbox).toBeVisible();
  await lightbox.click({ position: { x: 8, y: 8 } });
  await expect(lightbox).toBeHidden({ timeout: 5_000 });
});
