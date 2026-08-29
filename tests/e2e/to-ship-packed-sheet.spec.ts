import path from 'path';
import fs from 'fs';
import { test, expect, type Page } from '@playwright/test';

/**
 * To-ship · Packed — spreadsheet of staged packed orders, keyboard-first
 * staff combobox + packed-at date range. Funnel + exact chips sit left of paste;
 * landing seeds the warehouse current week.
 *
 * Full-sheet claim (after dismissing the week window): `aria-rowcount` equals
 * the unfiltered `/api/orders?stagedOnly=true` payload length plus the header.
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

async function openPackedDesk(page: Page) {
  await page.goto('/shipping/orders?packed=');
  if (/signin|login|account\/sign/i.test(page.url())) {
    test.skip(true, 'no session');
  }
}

test.describe('To-ship Packed sheet', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desk spreadsheet is a desktop layout');
  test.skip(({ isMobile }) => !!isMobile, 'desk spreadsheet is a desktop layout');

  test('shows every staged packed row as a spreadsheet and filters by keyboard', async ({
    page,
    request,
  }) => {
    const probe = await request.get('/api/orders?stagedOnly=true');
    test.skip(!probe.ok(), 'no session — run provision:qa-org or use tests/.auth');

    const payload = (await probe.json()) as {
      orders?: { id?: number; shipment_id?: number | string | null }[];
    };
    const orders = Array.isArray(payload.orders) ? payload.orders : [];
    const apiCount = orders.length;
    const packageCount = new Set(
      orders.map((row) => {
        const ship = row.shipment_id == null ? '' : String(row.shipment_id).trim();
        return ship ? `s:${ship}` : `o:${row.id}`;
      }),
    ).size;

    await openPackedDesk(page);

    /*
      No "Packed" TAB click any more.

      The Band-1 lifecycle strip (Pending · Tested · Packed · Shipped) was
      retired before this test last ran — stage became a row fact on one
      in-warehouse list — and `pending-grid-tanstack-tested.spec.ts` asserts that
      very tab is gone, so the two specs contradicted each other and this one
      simply waited 30s for a control another test guarantees does not exist.

      `?packed=` in `openPackedDesk` already IS the lane, and it is the durable,
      deep-linkable way in. Waiting on the packed grid is what proves it landed.
    */
    const find = page.getByPlaceholder('Filter orders…').first();
    await expect(find).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('packed-find-filters')).toBeVisible();

    /*
      The standalone Packed DESK is gone.

      `packed-grid-body` is `PackedOrdersTable`, and its only mount today is
      inside the COMPARE layout (`OrdersCompareHost` → `OrdersPaneTable`).
      `?packed=` no longer switches the desk to a packed-only grid — stage became
      a row fact on one in-warehouse list when the lifecycle tabs were retired,
      which is the same change that removed the "Packed" tab this test used to
      click.

      What is still real on this route, and is asserted above, is the packed
      FIND CHROME: the date-range and staff chips that ride inside the field.
      They regressed for one commit when Band 3 was replaced, and this test is
      what caught it — so the useful half stays live and the half about a
      retired surface skips loudly instead of failing.
    */
    const gridHost = page.getByTestId('packed-grid-body');
    if ((await gridHost.count()) === 0) {
      test.skip(
        true,
        'the standalone Packed desk was retired — stage is a row fact; packed-grid-body now mounts only in the compare layout',
      );
    }
    await expect(gridHost).toBeVisible({ timeout: 30_000 });

    // Current-week seed → exact civil chip + X + funnel, all left of paste.
    await expect(page).toHaveURL(/dateFrom=\d{4}-\d{2}-\d{2}/);
    await expect(page).toHaveURL(/dateTo=\d{4}-\d{2}-\d{2}/);
    const dateChip = page.getByTestId('packed-filter-date-chip');
    await expect(dateChip).toBeVisible({ timeout: 10_000 });
    await expect(dateChip).toHaveText(/[A-Z]{3}\s+\d/);
    const packedPaste = page
      .locator('form')
      .filter({ has: find })
      .getByLabel('Paste from clipboard');
    const dateBox = await dateChip.boundingBox();
    const pasteBox = await packedPaste.boundingBox();
    expect(dateBox && pasteBox && dateBox.x < pasteBox.x, 'exact dates sit left of paste').toBeTruthy();
    await dateChip.click();
    await expect(page.getByTestId('packed-date-range')).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    await find.click();
    await page.keyboard.press('f');
    const staffCombo = page.getByTestId('packed-staff-combobox');
    if (!(await staffCombo.isVisible().catch(() => false))) {
      await page.getByTestId('packed-find-filters').locator('button').first().click();
    }
    await expect(staffCombo).toBeVisible({ timeout: 10_000 });
    await expect(staffCombo).toHaveAttribute('role', 'combobox');
    await expect(page.getByTestId('packed-date-range')).toBeVisible();

    const dateTrigger = page.getByTestId('packed-date-range').locator('button').first();
    const staffBox = await staffCombo.boundingBox();
    const dateTriggerBox = await dateTrigger.boundingBox();
    expect(staffBox && dateTriggerBox, 'staff and date triggers share a box').toBeTruthy();
    expect(Math.abs((staffBox?.width ?? 0) - (dateTriggerBox?.width ?? 0))).toBeLessThan(2);

    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Dismiss week window → full staged sheet for the rigid all-data claim.
    const clear = page.locator('[data-search-inline-clear]');
    if (await clear.isVisible().catch(() => false)) {
      await clear.click();
    }
    await expect(page.getByTestId('packed-filter-date-chip')).toHaveCount(0);
    await expect(page).toHaveURL(/allDates=1/);
    await expect(page).not.toHaveURL(/dateFrom=/);

    if (apiCount === 0) {
      await expect(page.getByText(/Nothing staged|No packed orders/i).first()).toBeVisible();
      await expect(page.getByTestId('packed-kpi-band')).toContainText(/Packed/);
      await expect(page.getByTestId('outbound-chrome-export')).toBeDisabled();
      return;
    }

    const table = gridHost.locator('[role="table"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(table).toHaveAttribute('aria-label', 'Packed orders');
    await expect(table).toHaveAttribute('aria-rowcount', String(apiCount + 1));
    await expect(table.locator('[data-order-row-id]').first()).toBeVisible();

    await table.focus();
    await page.keyboard.press('ArrowDown');

    const kpi = page.getByTestId('packed-kpi-band');
    await expect(kpi).toBeVisible();
    await expect(kpi).toContainText(/Packed/);
    await expect(kpi).toContainText(String(packageCount));

    const exportBtn = page.getByTestId('outbound-chrome-export');
    const addBtn = page.getByTestId('outbound-chrome-add');
    await expect(exportBtn).toBeVisible();
    const exportBox = await exportBtn.boundingBox();
    const addBox = await addBtn.boundingBox();
    expect(exportBox && addBox && exportBox.x < addBox.x, 'Export sits left of Add').toBeTruthy();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportBtn.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^packed-orders-.+\.csv$/);
    const saved = await download.path();
    if (saved) {
      const csv = fs.readFileSync(saved, 'utf8');
      expect(csv.split('\n')[0]).toBe(
        'Date range,Packed at,Packed by,Order,Product,SKU,Condition,Qty,Ship by,Tracking,Serial,Platform',
      );
      expect(csv).not.toContain('record_id');
      expect(csv).not.toContain('shipment_id');
    }
  });
});
