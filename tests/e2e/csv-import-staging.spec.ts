/**
 * To-Ship CSV import staging — the operator path, end to end, on the QA org.
 *
 *   Band-1 Import → Import from CSV → the sheet paints immediately (no mapping
 *   takeover) → refine IN the find field → fix a row IN THE CELL → fix the
 *   column mapping on the rail → Confirm into the live To-Ship queue.
 *
 * E2E is required per mount, not optional: the predecessor's paint bug (a
 * mount-gated URL open destroyed by a teardown effect one frame early) was
 * invisible to every guard and unit test.
 *
 * Run: `npx playwright test tests/e2e/csv-import-staging.spec.ts --project=qa-desktop`
 * (asserts against `QA_ORG_ID` fixtures, never the dogfood tenant — verify.md).
 */

import { test, expect, type Page } from '@playwright/test';

const DESK = '/shipping/orders';

/**
 * Headers deliberately use the ALIAS spellings (`Order ID` / `Item Number` /
 * `Qty` / `Buyer` / `Tracking` / `Channel`) so the run proves auto-map rather
 * than a canonical passthrough. Row 3 has no order number and row 4 no SKU —
 * the two Action-required shapes.
 */
const CSV = [
  'Order ID,Item Number,Qty,Buyer,Tracking,Channel',
  'CFQA-1001,SKU-AAA-1,2,Jane Doe,9400111899223197428490,eBay',
  'CFQA-1002,SKU-BBB-2,1,John Smith,9405511899223197428491,Ecwid',
  ',SKU-CCC-3,1,No Order Row,9405511899223197428492,eBay',
  'CFQA-1004,,3,Blank Sku Row,,Amazon',
  'CFQA-1005,SKU-EEE-5,1,Ada Lovelace,1Z999AA10123456784,eBay',
  '',
].join('\n');

/** Unique per run so a re-run never collides with the orders it just wrote. */
function uniqueCsv(stamp: string): string {
  return CSV.replace(/CFQA-(\d+)/g, `CFQA-$1-${stamp}`);
}

async function openCsvStaging(page: Page, csv: string) {
  await page.goto(DESK);
  await page.getByRole('button', { name: /import orders/i }).click();
  const fileInput = page.locator('input[type="file"][accept*="csv"]');
  await fileInput.setInputFiles({
    name: 'qa-staging.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv, 'utf8'),
  });
  await expect(page).toHaveURL(/import=csv/);
}

/** The rail is index→leaf; open a topic by its Root Index row. */
async function openRailLeaf(page: Page, leaf: 'row' | 'map' | 'batch') {
  const rail = page.getByRole('region', { name: /csv import staging inspector/i });
  await expect(rail).toBeVisible();
  const indexRow = rail.getByTestId(`station-displays-index-${leaf}`);
  if (await indexRow.isVisible().catch(() => false)) {
    await indexRow.click();
  } else {
    // Already on a leaf — pop to the index first.
    await rail.getByRole('button', { name: /back to topics/i }).click();
    await rail.getByTestId(`station-displays-index-${leaf}`).click();
  }
  return rail;
}

test.describe('To-Ship CSV import staging', () => {
  test('sheet-first triage: in-cell fix, in-field refine, rail mapping, confirm', async ({
    page,
  }) => {
    const stamp = String(Date.now()).slice(-6);
    const csv = uniqueCsv(stamp);
    await openCsvStaging(page, csv);

    const grid = page.getByRole('table', { name: /csv import staging rows/i });

    // ── 1. Auto-map landed straight on the triage grid (order_number bound) ──
    await expect(grid).toBeVisible();

    // ── 2. The data table shows the ACTUAL row details ──────────────────────
    await expect(page.getByText(`CFQA-1001-${stamp}`)).toBeVisible();
    await expect(page.getByText('SKU-AAA-1')).toBeVisible();
    await expect(page.getByText('Jane Doe')).toBeVisible();

    // ── 3. …with the triage state in its own column ─────────────────────────
    await expect(page.locator('[data-staging-status="ready"]')).toHaveCount(3);
    await expect(page.locator('[data-staging-status="action_required"]')).toHaveCount(2);

    // ── 4. Band 1 is one primary CTA naming the set it will write ───────────
    // No selection ⇒ Confirm targets every Ready row (selection only narrows).
    const confirmCta = page.getByTestId('csv-import-staging-confirm');
    await expect(confirmCta).toHaveText(/confirm 3 ready/i);

    // ── 5. Refine rides IN the find field, not as a chip band ───────────────
    // `Refine` gains "(… active)" once hot — match the stem, not the whole name.
    await page.getByRole('button', { name: /^refine\b/i }).click();
    await page.getByRole('button', { name: /^action required$/i }).click();
    await expect(page.locator('[data-staging-row]')).toHaveCount(2);

    // ── 6. Fix the missing order number IN THE CELL (Sheets keys) ───────────
    const orderCell = page.getByRole('button', {
      name: /edit order number for staging row 3/i,
    });
    await orderCell.click();
    const editor = page.getByRole('textbox', {
      name: /edit order number for staging row 3/i,
    });
    await editor.fill(`CFQA-1003-${stamp}`);
    await editor.press('Enter');

    // The commit re-classifies in place, so the row leaves the filtered lane.
    await expect(page.locator('[data-staging-row]')).toHaveCount(1);
    await expect(confirmCta).toHaveText(/confirm 4 ready/i);

    // ── 7. The column mapping is a RAIL leaf, not a middle takeover ─────────
    const rail = await openRailLeaf(page, 'map');
    const skuSelect = rail.getByLabel(/source column for sku/i);
    await expect(skuSelect).toHaveValue('Item Number'); // auto-mapped alias
    // Unmapping SKU means the blank-SKU row is no longer blocked.
    await skuSelect.selectOption('');
    // The Action-required lane empties, so the sheet shows its no-match state —
    // and Band 1 keeps naming the (now larger) Ready set.
    await expect(page.locator('[data-staging-row]')).toHaveCount(0);
    await expect(confirmCta).toHaveText(/confirm 5 ready/i);

    // ── 8. Back to every row, then confirm into the live queue ──────────────
    await page.getByRole('button', { name: /^refine\b/i }).click();
    await page.getByRole('button', { name: /^all rows$/i }).click();
    await expect(grid).toBeVisible();
    await expect(page.locator('[data-staging-row]')).toHaveCount(5);

    const importPost = page.waitForResponse(
      (r) => r.url().includes('/api/orders/import-csv') && r.request().method() === 'POST',
    );
    await confirmCta.click();
    await page.getByRole('button', { name: /^import \d+$/i }).click();

    const res = await importPost;
    expect(res.status(), await res.text()).toBe(200);

    // Staging exits — the draft is gone and the desk is back.
    await expect(page).not.toHaveURL(/import=csv/);
    await expect(grid).toHaveCount(0);
  });

  test('an unmapped order number paints the sheet Action-required and gates Confirm', async ({
    page,
  }) => {
    // No alias for order_number anywhere in the header row.
    const csv = ['Reference,Item Number,Qty', 'REF-1,SKU-AAA-1,1', 'REF-2,SKU-BBB-2,4', ''].join(
      '\n',
    );
    await openCsvStaging(page, csv);

    // The sheet paints IMMEDIATELY — the mapping panel no longer owns the
    // middle. Every row is Action required and the reason is in `status`.
    const grid = page.getByRole('table', { name: /csv import staging rows/i });
    await expect(grid).toBeVisible();
    await expect(page.locator('[data-staging-status="action_required"]')).toHaveCount(2);
    await expect(page.locator('[data-staging-status="ready"]')).toHaveCount(0);

    // The commit gate survives the takeover's removal: nothing is ready.
    const confirmCta = page.getByTestId('csv-import-staging-confirm');
    await expect(confirmCta).toHaveText(/confirm 0 ready/i);
    await expect(confirmCta).toBeDisabled();

    // An unmapped field has nowhere to write, so its cell is NOT an editor.
    await expect(
      page.getByRole('button', { name: /edit order number for staging row 1/i }),
    ).toHaveCount(0);

    // Bind `Reference` on the rail and the gate opens.
    const rail = await openRailLeaf(page, 'map');
    await rail.getByLabel(/source column for order number/i).selectOption('Reference');
    await expect(page.locator('[data-staging-status="ready"]')).toHaveCount(2);
    await expect(confirmCta).toHaveText(/confirm 2 ready/i);
    await expect(confirmCta).toBeEnabled();
    await expect(page.getByText('REF-1')).toBeVisible();
  });
});
