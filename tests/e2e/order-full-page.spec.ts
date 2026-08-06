import { test, expect } from '@playwright/test';

/**
 * Retired `/o/[orderId]` permanently redirects to search order feedback.
 */

const ORDER_ID = Number(
  process.env.PW_FULLPAGE_ORDER_ID || process.env.PW_TRACKING_ORDER_ID || '2902',
);

test.describe('Retired order workbench (/o/[id])', () => {
  test('/o/[id] redirects to search order feedback', async ({ page }) => {
    await page.goto(`/o/${ORDER_ID}`);
    await page.waitForURL(/\/search\?/, { timeout: 15_000 });
    const url = new URL(page.url());
    expect(url.pathname).toBe('/search');
    expect(url.searchParams.get('sel')).toBe(`order:${ORDER_ID}`);
  });
});
