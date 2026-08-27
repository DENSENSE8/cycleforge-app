/**
 * Incoming Amazon returns CSV staging — Displays leaf → triage → confirm → Incoming returns.
 *
 * Run: `npx playwright test tests/e2e/incoming-returns-csv-staging.spec.ts --project=qa-desktop`
 */

import { test, expect, type Page } from '@playwright/test';

const DESK = '/incoming';

/**
 * Amazon Manage Returns-shaped CSV (comma). Unique order/tracking per run so
 * re-runs never collide with prior imports.
 */
function returnsCsv(stamp: string): string {
  return [
    'Order ID,ASIN,Merchant SKU,Item Name,Return quantity,Tracking ID,Amazon RMA ID,Return Reason,Return carrier,Return request status',
    `111-${stamp}-1001,B00QAASIN1,SKU-QA-1,QA Return Widget,1,TBA${stamp}1001,RMA-${stamp}-1,Damaged,UPS,Approved`,
    `111-${stamp}-1002,B00QAASIN2,SKU-QA-2,QA Return Gadget,1,TBA${stamp}1002,RMA-${stamp}-2,Wrong item,USPS,Approved`,
    `,B00QAASIN3,SKU-QA-3,Missing Order Row,1,TBA${stamp}1003,RMA-${stamp}-3,Changed mind,UPS,Approved`,
    `111-${stamp}-1004,B00QAASIN4,SKU-QA-4,Cancelled Row,1,TBA${stamp}1004,RMA-${stamp}-4,No longer needed,UPS,Cancelled`,
    '',
  ].join('\n');
}

async function openReturnsStaging(page: Page, csv: string) {
  await page.goto(DESK);
  await page.getByRole('button', { name: 'Add inbound purchase or return' }).click();
  const rail = page.getByRole('region', { name: /add inbound purchase or return/i });
  await expect(rail).toBeVisible({ timeout: 15_000 });
  await rail.getByTestId('station-displays-index-import-returns').click();
  await expect(page.getByTestId('incoming-returns-choose-csv')).toBeVisible();

  const fileInput = page.locator('input[type="file"][accept*="csv"]');
  await fileInput.setInputFiles({
    name: 'qa-amazon-returns.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await expect(page).toHaveURL(/import=csv/, { timeout: 15_000 });
}

test.describe('Incoming returns CSV staging', () => {
  test('staging triage → confirm → Incoming inkind=return', async ({ page }) => {
    const stamp = String(Date.now()).slice(-6);
    const csv = returnsCsv(stamp);
    await openReturnsStaging(page, csv);

    const grid = page.getByRole('table', { name: /csv import staging rows/i });
    await expect(grid).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`111-${stamp}-1001`)).toBeVisible();
    await expect(page.getByText('SKU-QA-1')).toBeVisible();

    // 2 ready (approved with order) + 2 action required (missing order + cancelled)
    await expect(page.locator('[data-staging-status="ready"]')).toHaveCount(2);
    await expect(page.locator('[data-staging-status="action_required"]')).toHaveCount(2);

    const confirmCta = page.getByTestId('csv-import-staging-confirm');
    await expect(confirmCta).toHaveText(/confirm 2 ready/i);

    await page.getByRole('button', { name: /^refine\b/i }).click();
    await page.getByRole('button', { name: /^action required$/i }).click();
    await expect(page.locator('[data-staging-row]')).toHaveCount(2);

    // Fix missing order on the action-required row that is not cancelled.
    const orderCell = page.getByRole('button', {
      name: /edit order for staging row 3/i,
    });
    await orderCell.click();
    const editor = page.getByRole('textbox', {
      name: /edit order for staging row 3/i,
    });
    await editor.fill(`111-${stamp}-1003`);
    await editor.press('Enter');

    await page.getByRole('button', { name: /^refine\b/i }).click();
    await page.getByRole('button', { name: /^all rows$/i }).click();
    await expect(confirmCta).toHaveText(/confirm 3 ready/i);

    await confirmCta.click();
    await expect(page).toHaveURL(/inkind=return/, { timeout: 30_000 });
    await expect(page).not.toHaveURL(/import=csv/);
    // Incoming paints truncated order faces — assert on the imported item title.
    await expect(page.getByText('QA Return Widget').first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('QA Return Gadget').first()).toBeVisible();
  });

  test('Band-1 Import CSV aliases the same import-returns leaf', async ({ page }) => {
    await page.goto(DESK);
    await page.getByRole('button', { name: /import incoming orders/i }).click();
    await page.getByRole('button', { name: /upload csv/i }).click();
    const rail = page.getByRole('region', { name: /add inbound purchase or return/i });
    await expect(rail).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('incoming-returns-choose-csv')).toBeVisible({
      timeout: 10_000,
    });
  });
});
