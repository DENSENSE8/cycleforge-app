import { test, expect, type Route, type Page } from '@playwright/test';

/**
 * Unbox refresh stickiness — desktop.
 *
 * Contract: open a carton on /unbox → the session SoT writes
 * `?openReceivingId=` (+ `?lineId=`) → a hard refresh reopens the SAME edit
 * overlay (`[data-testid="receiving-workspace"]`), NOT the browse workbench.
 *
 * SoT under test:
 *   - src/lib/receiving/unbox-selection-url.ts (param apply / restore pick)
 *   - src/components/receiving/useReceivingWorkspacePane.ts (write on open,
 *     clear on close, deep-link restore, bridge-close-on-mount guard)
 *
 * Deterministic data: /api/receiving/lookup-po and /api/receiving-lines are
 * mocked so a scanned PO opens a fixed carton (RECEIVING_ID) whose hydration
 * fetch also serves the reload deep-link restore. This exercises the real URL
 * sync + reload path without depending on live tenant data.
 */

// Desktop only — the Unbox scan bench + workspace overlay is a desktop surface.
test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only');

const RECEIVING_ID = 101;
const LINE_ID = 201;
const MATCHED_PO_NUMBER = 'USAV12345';

const matchedLookupPoPayload = {
  success: true,
  matched: true,
  po_matched: true,
  receiving_id: RECEIVING_ID,
  po_ids: ['PO-9001'],
  lines: [
    {
      id: LINE_ID,
      receiving_id: RECEIVING_ID,
      sku: 'TEST-SKU-001',
      item_name: 'Test Product',
      quantity_expected: 1,
      quantity_received: 0,
    },
  ],
  receiving_package: null,
};

const matchedReceivingLine = {
  id: LINE_ID,
  receiving_id: RECEIVING_ID,
  tracking_number: null,
  carrier: null,
  zoho_item_id: 'ZI-001',
  zoho_line_item_id: 'ZLI-001',
  zoho_purchase_receive_id: null,
  zoho_purchaseorder_id: 'PO-9001',
  zoho_purchaseorder_number: MATCHED_PO_NUMBER,
  item_name: 'Test Product',
  sku: 'TEST-SKU-001',
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
  receiving_type: null,
  notes: null,
  image_url: null,
  source_platform: null,
  created_at: new Date().toISOString(),
  receiving_source: 'zoho_po',
  serials: [],
};

/** Workspace hydration + deep-link restore both hit /api/receiving-lines. */
async function routeReceivingLines(page: Page): Promise<void> {
  await page.route('**/api/receiving-lines**', async (route: Route) => {
    const url = route.request().url();
    const isCartonFetch = url.includes(`receiving_id=${RECEIVING_ID}`);
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        isCartonFetch
          ? { success: true, receiving_lines: [matchedReceivingLine] }
          : { success: true, receiving_lines: [] },
      ),
    });
  });
}

async function routeLookupPo(page: Page): Promise<void> {
  await page.route('**/api/receiving/lookup-po', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(matchedLookupPoPayload),
    });
  });
}

test.describe('Unbox refresh stickiness', () => {
  test('open carton → URL sync → reload reopens the same workspace', async ({ page }) => {
    await routeReceivingLines(page);
    await routeLookupPo(page);

    await page.goto('/unbox', { waitUntil: 'networkidle' });

    // Open via scan (deterministic; no dependence on live rail rows).
    const scanInput = page.getByPlaceholder(/Tracking|PO/i).first();
    await scanInput.fill(MATCHED_PO_NUMBER);
    await scanInput.press('Enter');

    const workspace = page.getByTestId('receiving-workspace');
    await expect(workspace).toBeVisible({ timeout: 15_000 });

    // ── First failure point: the session SoT must have written the URL ──
    await expect
      .poll(() => new URL(page.url()).searchParams.get('openReceivingId'), { timeout: 5_000 })
      .toBe(String(RECEIVING_ID));

    const afterOpen = new URL(page.url());
    // eslint-disable-next-line no-console
    console.log('[stickiness] after open:', afterOpen.search);
    expect(afterOpen.searchParams.get('openReceivingId')).toMatch(/^\d+$/);

    // ── Hard refresh ──
    await page.reload({ waitUntil: 'networkidle' });

    // URL must survive the reload…
    expect(new URL(page.url()).searchParams.get('openReceivingId')).toBe(String(RECEIVING_ID));

    // …and the edit overlay must reopen (NOT the browse workbench).
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });
  });

  test('cold deep link (?openReceivingId=) opens the workspace', async ({ page }) => {
    await routeReceivingLines(page);
    await routeLookupPo(page);

    await page.goto(`/unbox?openReceivingId=${RECEIVING_ID}&lineId=${LINE_ID}`, {
      waitUntil: 'networkidle',
    });

    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });
  });

  test('closing the workspace strips the open params and returns to browse', async ({ page }) => {
    await routeReceivingLines(page);
    await routeLookupPo(page);

    await page.goto(`/unbox?openReceivingId=${RECEIVING_ID}&lineId=${LINE_ID}`, {
      waitUntil: 'networkidle',
    });

    const workspace = page.getByTestId('receiving-workspace');
    await expect(workspace).toBeVisible({ timeout: 15_000 });

    // Close the overlay via its back-to-browse control.
    await page.getByRole('button', { name: /back to all|all lines/i }).first().click();

    await expect
      .poll(() => new URL(page.url()).searchParams.get('openReceivingId'), { timeout: 5_000 })
      .toBeNull();
  });
});
