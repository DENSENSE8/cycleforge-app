import { test, expect } from '@playwright/test';

test('debug dashboard', async ({ page }) => {
  // Use the proxy port if 3099, or 3000
  await page.goto('http://localhost:3000/dashboard?unshipped=', { waitUntil: 'domcontentloaded' });
  
  // Wait for the page to load
  await page.waitForTimeout(2000);
  
  // Take screenshot
  await page.screenshot({ path: 'dashboard-debug.png', fullPage: true });

  const kpiCount = await page.locator('section[aria-label="Outbound KPIs"]').count();
  console.log(`KPI Strip Count: ${kpiCount}`);
});
