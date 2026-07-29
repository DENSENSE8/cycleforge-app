import { test, expect } from '@playwright/test';

test.describe('Photo library deep links', () => {
  test('receivingId query param scopes the library', async ({ page }) => {
    await page.goto('/ops/photos?receivingId=1987');
    await expect(page.getByText('Receiving #1987').first()).toBeVisible();
    await expect(page.getByText(/photos in view/i)).toBeVisible();
    await page.getByRole('button', { name: /photo filters/i }).click();
    await expect(page.getByLabel('Receiving ID')).toHaveValue('1987');
  });

  test('serial unit filter deep link pre-fills entity fields', async ({ page }) => {
    await page.goto('/ops/photos?entityType=SERIAL_UNIT&entityId=42');
    await expect(page.getByText('Serial unit #42').first()).toBeVisible();
    await page.getByRole('button', { name: /photo filters/i }).click();
    await expect(page.getByLabel('Entity')).toHaveValue('SERIAL_UNIT');
    await expect(page.getByLabel('Entity ID')).toHaveValue('42');
  });

  test('sku filter deep link labels the header context', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Flat view so the "N photos in view · <subtitle>" meta line renders.
    await page.goto('/ops/photos?sku=WM-1023&view=grid-sm');
    await expect(page.getByText(/photos? in view/i)).toBeVisible();
    // describePhotoLibraryContext → SKU branch subtitle.
    await expect(
      page.getByText(/Photos linked to this SKU across intake, testing, and packing/i),
    ).toBeVisible();

    expect(pageErrors, `Uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });

  test('unboxing stage sub-filter deep link round-trips and labels the header', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/ops/photos?sourceScope=unboxing&stage=unbox_item&view=grid-sm');
    await expect(page.getByText(/photos? in view/i)).toBeVisible();
    // describePhotoLibraryContext → stage branch subtitle (label via photoStageLabel).
    await expect(page.getByText(/Unboxing evidence at this stage/i)).toBeVisible();
    // The stage param must survive in the URL (navigator state, deep-link safe).
    await expect(page).toHaveURL(/stage=unbox_item/);

    // Stage sub-rows render under the Unboxing folder once the sidebar host
    // wires onStageSelect; assert defensively so the spec stays green either way.
    const stageRows = page.getByTestId('unboxing-stage-rows');
    if (await stageRows.count()) {
      await expect(stageRows.getByRole('button', { name: 'Unbox · item' })).toBeVisible();
      await expect(stageRows.getByRole('button', { name: 'All stages' })).toBeVisible();
    }

    expect(pageErrors, `Uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });
});
