import { test, expect, type Route, type Page } from '@playwright/test';

test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only');

const RECEIVING_ID = 101;
const LINE_ID = 201;

const matchedReceivingLine = {
  id: LINE_ID,
  receiving_id: RECEIVING_ID,
  tracking_number: null,
  carrier: null,
  zoho_item_id: 'ZI-001',
  zoho_line_item_id: 'ZLI-001',
  zoho_purchase_receive_id: null,
  zoho_purchaseorder_id: 'PO-9001',
  zoho_purchaseorder_number: 'USAV12345',
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

test('DEBUG cold deep link timeline', async ({ page }) => {
  page.on('console', (m) => {
    // eslint-disable-next-line no-console
    console.log(`[browser:${m.type()}]`, m.text());
  });
  page.on('request', (r) => {
    if (r.url().includes('/api/receiving-lines')) {
      // eslint-disable-next-line no-console
      console.log('[req]', r.method(), r.url());
    }
  });

  await page.addInitScript(() => {
    for (const ev of [
      'receiving-select-line',
      'receiving-workspace-open',
      'receiving-workspace-close',
      'receiving-clear-line',
      'receiving-workspace-nav-state',
    ]) {
      window.addEventListener(ev, (e) => {
        const d = (e as CustomEvent).detail;
        // eslint-disable-next-line no-console
        console.log(`[event] ${ev}`, d ? JSON.stringify(d).slice(0, 200) : 'null');
      });
    }
    const origReplace = history.replaceState.bind(history);
    history.replaceState = function (...args: unknown[]) {
      // eslint-disable-next-line no-console
      console.log('[replaceState]', String(args[2] ?? ''));
      // @ts-expect-error passthrough
      return origReplace(...args);
    };
  });

  await routeReceivingLines(page);

  await page.goto(`/unbox?openReceivingId=${RECEIVING_ID}&lineId=${LINE_ID}`, {
    waitUntil: 'networkidle',
  });

  await page.waitForTimeout(4000);
  // eslint-disable-next-line no-console
  console.log('[final url]', page.url());
  const ws = await page.getByTestId('receiving-workspace').count();
  // eslint-disable-next-line no-console
  console.log('[workspace count]', ws);
  expect(true).toBe(true);
});
