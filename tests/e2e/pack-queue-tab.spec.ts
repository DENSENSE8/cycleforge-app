import path from 'path';
import { test, expect } from '@playwright/test';

/**
 * Pack desk chrome — Queue is always the leftmost tab on `/pack`, including
 * when no packer is assigned (staff filter cleared / packedBy irrelevant).
 *
 * Origin hid Queue as an unlabeled default body (`PACK_VIEW_TABS = History`
 * only). Queue must stay drawn so every scan-station Pack browse can reach
 * ready-to-pack without an assignee.
 *
 *   npx playwright test tests/e2e/pack-queue-tab.spec.ts --project=qa-desktop
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

test.describe('Pack desk — Queue tab', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop pack station layout');

  test('Queue is leftmost and visible with no staff assignee', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'qa-desktop', 'QA org fixtures — qa-desktop project');

    await page.goto('/pack?staff=all');

    await expect(page.getByTestId('desk-page-header')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Packing', exact: true })).toBeVisible();

    const band = page.getByTestId('desk-page-chrome-band');
    await expect(band).toBeVisible();

    const queueTab = page.getByTestId('desk-tab-queue');
    const historyTab = page.getByTestId('desk-tab-history');
    await expect(queueTab).toBeVisible();
    await expect(historyTab).toBeVisible();
    await expect(queueTab).toHaveAttribute('aria-selected', 'true');

    // Leftmost among desk tabs — Queue before History in DOM order.
    const tabIds = await band.locator('[role="tab"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-testid')),
    );
    expect(tabIds[0]).toBe('desk-tab-queue');
    expect(tabIds).toContain('desk-tab-history');

    // Body may be soft idle ("Awaiting scan") or a populated ready-to-pack grid —
    // either is fine; the Queue tab itself must not depend on assignees.
    await expect(page.getByTestId('desk-page-stage')).toBeVisible();
  });

  test('History tab still reachable; Queue remains in the strip', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'qa-desktop', 'QA org fixtures — qa-desktop project');

    await page.goto('/pack?packview=history&staff=all');

    const queueTab = page.getByTestId('desk-tab-queue');
    const historyTab = page.getByTestId('desk-tab-history');
    await expect(historyTab).toBeVisible({ timeout: 30_000 });
    await expect(historyTab).toHaveAttribute('aria-selected', 'true');
    await expect(queueTab).toBeVisible();
    await expect(queueTab).toHaveAttribute('aria-selected', 'false');

    await queueTab.click();
    await expect(queueTab).toHaveAttribute('aria-selected', 'true');
  });
});
