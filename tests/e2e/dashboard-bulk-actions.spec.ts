import { test, expect, type Page } from '@playwright/test';

/**
 * Dashboard bulk actions — lifecycle-scoped (execution plan Phase 5).
 *
 * House rule: **actions diverge by lifecycle stage; column layout does not.**
 * All four outbound tabs render one grid with one persisted column layout, so
 * the divergence has to live in the action set — "assign a tester" is
 * meaningless on Shipped, "print a shipping label" is meaningless on Pending.
 *
 * To-ship paints those verbs as **column-aligned icons** under the grid
 * (`data-table-column-actions`), not status-bar pills. Rail still owns export /
 * print / listing-rule.
 */

test.describe('Dashboard bulk actions', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  async function selectFirstRow(page: Page, query: string) {
    await page.goto(`/dashboard?${query}`);
    const row = page.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole('checkbox').first().check();
    await expect(page.getByTestId('data-table-column-actions')).toBeVisible({ timeout: 20_000 });
    return row;
  }

  function columnActionKeys(page: Page): Promise<string[]> {
    return page
      .getByTestId('data-table-column-actions')
      .locator('button[data-testid^="data-table-selection-action-"]')
      .evaluateAll((els) =>
        els
          .map((e) => e.getAttribute('data-testid') ?? '')
          .map((id) => id.replace('data-table-selection-action-', ''))
          .filter(Boolean),
      );
  }

  test('column-aligned icons sit under Image and Order', async ({
    page,
  }) => {
    await selectFirstRow(page, 'unshipped');
    const pending = await columnActionKeys(page);
    expect(pending).toContain('copy');
    expect(pending).toContain('download-photos');
    expect(pending).toContain('assign-pick');
    expect(pending).toContain('assign-pack');
    expect(pending).toContain('ship-by');
    expect(pending).toContain('condition');
    expect(pending).toContain('qty');
    expect(pending).toContain('notes');
    expect(pending).not.toContain('print-shipping');
    expect(pending).not.toContain('export');

    const thumb = page.locator('[data-grid-col-header] [data-col="thumb"]');
    const download = page.getByTestId('data-table-selection-action-download-photos');
    const thumbBox = await thumb.boundingBox();
    const downloadBox = await download.boundingBox();
    expect(thumbBox).toBeTruthy();
    expect(downloadBox).toBeTruthy();
    expect(Math.abs((thumbBox!.x + thumbBox!.width / 2) - (downloadBox!.x + downloadBox!.width / 2))).toBeLessThan(24);

    const orderHeader = page.locator('[data-grid-col-header] [data-col="fulfillment"]');
    const copy = page.getByTestId('data-table-selection-action-copy');
    const orderBox = await orderHeader.boundingBox();
    const copyBox = await copy.boundingBox();
    expect(orderBox).toBeTruthy();
    expect(copyBox).toBeTruthy();
    expect(Math.abs((orderBox!.x + orderBox!.width / 2) - (copyBox!.x + copyBox!.width / 2))).toBeLessThan(48);
  });

  test('Assign pick / pack open upward staff search under the column icons', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const rows = page.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    test.skip((await rows.count()) < 2, 'needs at least two pending rows');

    await rows.nth(0).getByRole('checkbox').first().check();
    await rows.nth(1).getByRole('checkbox').first().check();

    const pickBtn = page.getByTestId('data-table-selection-action-assign-pick');
    const packBtn = page.getByTestId('data-table-selection-action-assign-pack');
    await expect(pickBtn).toBeVisible();
    await expect(packBtn).toBeVisible();

    await pickBtn.click();
    const pickPanel = page.getByTestId('stage-assign-bottom-up-pick');
    await expect(pickPanel).toBeVisible({ timeout: 20_000 });
    await expect(pickPanel.getByPlaceholder('Search staff…')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Foot icons stay painted while the panel floats above the grid.
    await expect(pickBtn).toBeVisible();
    await expect(packBtn).toBeVisible();
    const panelBox = await pickPanel.boundingBox();
    const tableBox = await page.locator('[data-testid="data-table-column-actions"]').boundingBox();
    expect(panelBox).toBeTruthy();
    expect(tableBox).toBeTruthy();
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(tableBox!.y + 2);

    await packBtn.click();
    const packPanel = page.getByTestId('stage-assign-bottom-up-pack');
    await expect(packPanel).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('stage-assign-bottom-up-pick')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(pickBtn).toBeVisible();
    await expect(packBtn).toBeVisible();
  });

  test('checkbox multi-select keeps both rows in the set', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const rows = page.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    test.skip((await rows.count()) < 2, 'needs at least two pending rows');

    await rows.nth(0).getByRole('checkbox').first().check();
    await rows.nth(1).getByRole('checkbox').first().check();

    await expect(page.getByText(/\b2 selected\b/).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(rows.nth(0).getByRole('checkbox').first()).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(rows.nth(1).getByRole('checkbox').first()).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('row body does not open the documents rail and does not toggle the checkbox', async ({
    page,
  }) => {
    await page.goto('/dashboard?unshipped');
    const row = page.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    const checkbox = row.getByRole('checkbox').first();
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await row.click({ position: { x: 180, y: 12 } });
    await expect(checkbox).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText('Draft saved.')).toHaveCount(0);
    await expect(page.getByTestId('order-documents-section')).toHaveCount(0);
  });

  test('Set ship-by opens a date picker scoped to the selection', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const rows = page.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    test.skip((await rows.count()) < 2, 'needs at least two pending rows');

    await rows.nth(0).getByRole('checkbox').first().check();
    await rows.nth(1).getByRole('checkbox').first().check();

    await expect(page.getByText(/\b2 selected\b/).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByTestId('data-table-selection-action-ship-by').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText('Applies to all 2 selected orders.');
    await expect(dialog.getByRole('button', { name: '--' })).toBeVisible();
  });
});
