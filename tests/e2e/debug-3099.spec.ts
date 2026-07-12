import { test, expect } from '@playwright/test';

test('debug dashboard 3099', async ({ page }) => {
  await page.goto('http://localhost:3099/dashboard?unshipped=', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'dashboard-3099-debug.png', fullPage: true });
});
