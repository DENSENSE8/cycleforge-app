import { test, expect } from '@playwright/test';

test('debug details', async ({ page }) => {
  await page.goto('http://localhost:3000/dashboard?shipped=&layout=all', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // Try to click a row in the table
  const rows = page.locator('table tbody tr');
  if (await rows.count() > 0) {
    await rows.first().click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'dashboard-details-debug.png', fullPage: true });
  } else {
    console.log('No rows found to click');
    await page.screenshot({ path: 'dashboard-details-debug.png', fullPage: true });
  }
});
