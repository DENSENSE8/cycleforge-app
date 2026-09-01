import { test, expect, type Page } from '@playwright/test';

/**
 * Scan-out composer = HID gun mouth.
 *
 * Autofocus lands in OmnichannelComposerDock. The global wedge stands down
 * over editables, so the scanner types into the textarea and terminates with
 * Enter — that Enter must POST `/api/shipped/scan-out` with the full tracking
 * (live DOM, not a stale React commitDisabled frame).
 *
 * Fixture: USPS IMpb `420928059300110990513567668182` (operator 2026-08-31).
 */

const TRACKING = '420928059300110990513567668182';
const COMPOSER = '[aria-label="Scan-out label or package note"]';

async function gotoScanOut(page: Page): Promise<void> {
  await page.goto('/shipping/scan-out', { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).pathname === '/signin') {
    test.skip(true, 'no session for this project');
  }
  await expect(page.getByTestId('scan-out-workspace')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(COMPOSER)).toBeVisible({ timeout: 15_000 });
}

/** Wedge-shaped burst: sub-50ms gaps + Enter terminator (useWedgeScanner contract). */
async function wedgeIntoFocusedComposer(page: Page, tracking: string): Promise<void> {
  const field = page.locator(COMPOSER);
  await field.click();
  await expect(field).toBeFocused();
  await field.pressSequentially(tracking, { delay: 5 });
  await page.keyboard.press('Enter');
}

test.describe('scan-out composer gun linkage', () => {
  test.skip(({ isMobile }) => !!isMobile, 'floor gun path is desktop / wedge');

  test(`Enter after wedge posts ${TRACKING}`, async ({ page }) => {
    let posted: string | null = null;
    await page.route('**/api/shipped/scan-out', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.fallback();
        return;
      }
      const body = route.request().postDataJSON() as { trackingNumber?: string };
      posted = String(body?.trackingNumber ?? '').trim();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          matched: true,
          duplicate: false,
          shipmentId: 9001,
          tracking: posted,
          orderRowId: 42,
          orderId: 'E2E-SCAN-OUT',
          productTitle: 'E2E scan-out fixture',
          sku: 'E2E-SKU',
          condition: 'USED',
          quantity: 1,
          accountSource: 'ebay',
          message: null,
        }),
      });
    });

    await gotoScanOut(page);
    await wedgeIntoFocusedComposer(page, TRACKING);

    await expect
      .poll(() => posted, { timeout: 10_000 })
      .toBe(TRACKING);

    // Focus pane may briefly dual-mount during AnimatePresence swap — assert
    // the settled mock payload, not a single testid node.
    await expect(page.getByText('E2E scan-out fixture').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
