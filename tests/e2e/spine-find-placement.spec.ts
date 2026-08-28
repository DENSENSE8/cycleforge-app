import { test, expect } from '@playwright/test';

/**
 * MasterNav no longer mounts an in-spine "Go to…" field (2026-08-28) —
 * destination / record find is ⌘K (header Find). This pins the absence so a
 * stale transform cannot quietly put the field back.
 */
test('the spine has no Go to find field', async ({ page }) => {
  await page.goto('/unbox');
  await expect(page.locator('main').first()).toBeVisible({ timeout: 30_000 });

  const show = page.getByRole('button', { name: 'Show navigation' });
  if ((await show.count()) > 0) await show.first().click();
  await page.waitForTimeout(600);

  await expect(page.locator('[data-spine-find]')).toHaveCount(0);
  await expect(page.getByPlaceholder('Go to…')).toHaveCount(0);
  await expect(page.locator('[data-spine-scrollport]')).toBeVisible();
});
