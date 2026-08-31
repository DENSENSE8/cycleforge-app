import { test, expect } from '@playwright/test';

/**
 * Import / Add Order intake = NON-MODAL right-rail regions.
 *
 * Same modality metric as `dashboard-inspector-non-modal.spec.ts`:
 * `DetailStackRailRegistrar` + `modal={false}` → `role="region"`, no scrim,
 * no body scroll lock, queue stays hit-testable underneath.
 *
 * Covers:
 *   (1) Add Order (`detail:new-order`) via `?new=true`
 *   (2) Order sync progress (`detail:order-sync`) after starting Import
 *       (API hung so the panel stays open without needing a live sheet)
 */

test.describe('Import / Add Order — non-modal right rail', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  const BACKDROP_SELECTOR = '[class*="z-panelBackdrop"], [class*="z-detailStackBackdrop"]';

  test('Add Order opens as a named region without scrim or scroll lock', async ({ page }) => {
    await page.goto('/dashboard?unshipped&new=true');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });

    const intake = page.locator('aside[role="region"][aria-label="New order entry"]');
    await expect(intake).toBeVisible({ timeout: 20_000 });

    expect(await intake.getAttribute('aria-modal')).toBeNull();
    await expect(page.locator('aside[role="dialog"]')).toHaveCount(0);
    await expect(page.locator(BACKDROP_SELECTOR)).toHaveCount(0);

    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .not.toBe('hidden');

    // Queue remains live under the float — hit-test a point in the grid body
    // left of the inspector card.
    const tableBox = await table.boundingBox();
    expect(tableBox).not.toBeNull();
    const hit = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return {
          inGrid: !!el?.closest('[data-testid="pending-grid-body"]'),
          inAside: !!el?.closest('aside'),
        };
      },
      {
        x: tableBox!.x + Math.min(80, tableBox!.width / 4),
        y: tableBox!.y + Math.min(40, tableBox!.height / 2),
      },
    );
    expect(hit).toEqual({ inGrid: true, inAside: false });

    await page.keyboard.press('Escape');
    await expect(intake).toBeHidden({ timeout: 10_000 });
  });

  test('Order import progress opens as a named region without scrim', async ({ page }) => {
    // Hang connector syncs so the progress panel stays open for modality asserts.
    await page.route('**/api/integrations/**/sync', async (route) => {
      await new Promise(() => {});
    });
    await page.route('**/api/google-sheets/transfer-orders**', async (route) => {
      await new Promise(() => {});
    });

    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });

    const importBtn = page.getByRole('button', { name: /Import orders/i });
    await expect(importBtn).toBeVisible({ timeout: 20_000 });
    await importBtn.click();

    const startImport = page.getByRole('button', { name: /Import Latest Orders/i });
    test.skip(!(await startImport.isVisible().catch(() => false)), 'no orders.import permission');
    await startImport.click();

    const sync = page.locator('aside[role="region"][aria-label="Order import progress"]');
    await expect(sync).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('order-sync-panel')).toBeVisible();

    expect(await sync.getAttribute('aria-modal')).toBeNull();
    await expect(page.locator('aside[role="dialog"]')).toHaveCount(0);
    await expect(page.locator(BACKDROP_SELECTOR)).toHaveCount(0);

    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .not.toBe('hidden');

    // Cancel (only intentional abort while running) then Escape should close.
    const cancel = page.getByRole('button', { name: /^Cancel$/i });
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
    }
    await page.keyboard.press('Escape');
    await expect(sync).toBeHidden({ timeout: 10_000 });
  });

  test('opening Add Order while an order inspector is open keeps one region', async ({ page }) => {
    await page.goto('/dashboard?unshipped');

    const table = page.locator('[data-testid="pending-grid-body"]').first();
    await expect(table).toBeVisible({ timeout: 20_000 });
    const row = table.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.locator('[data-col="item"]').click();

    const orderInspector = page.locator('aside[role="region"][aria-label^="Order "]');
    await expect(orderInspector).toBeVisible({ timeout: 20_000 });

    // Import + Add are one Band-1 control now: open it, pick Add, then enter.
    await page.getByRole('button', { name: /add or import orders/i }).click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('button', { name: 'New order entry' }).click();

    const intake = page.locator('aside[role="region"][aria-label="New order entry"]');
    await expect(intake).toBeVisible({ timeout: 20_000 });
    // One aside region at a time — store top-occupant exclusivity.
    await expect(page.locator('aside[role="region"]')).toHaveCount(1);
    await expect(page.locator(BACKDROP_SELECTOR)).toHaveCount(0);
  });
});
