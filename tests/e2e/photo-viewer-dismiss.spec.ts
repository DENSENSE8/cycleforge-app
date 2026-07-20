import { test, expect, type Page } from '@playwright/test';

/**
 * Photo viewer dismissal — regression coverage for two dismissal bugs:
 *
 *  1. Ghost overlay: closing the fullscreen `PhotoViewerModal` must fully
 *     unmount the scrim. A stuck full-screen scrim (the old `mode="wait"` +
 *     keyless AnimatePresence deadlock in `PhotoGallery`) left the page
 *     un-clickable until a reload.
 *  2. Click-off: clicking the dark backdrop area around the photo closes the
 *     viewer (standard lightbox affordance); clicking the image itself does not.
 *
 * Driven through the photo library (`/ops/photos`), which mounts the same shared
 * `PhotoViewerModal`. Defensive: skips when no photos are seeded.
 */

/** Report any high-z, click-capturing full-screen layer still in the DOM. */
async function leftoverBlockingLayers(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll('body *').forEach((n) => {
      const s = getComputedStyle(n);
      const r = n.getBoundingClientRect();
      const coversScreen = r.width >= window.innerWidth - 4 && r.height >= window.innerHeight - 4;
      const positioned = s.position === 'fixed' || s.position === 'absolute';
      if (coversScreen && positioned && s.pointerEvents !== 'none') {
        const z = s.zIndex;
        if (z !== 'auto' && Number(z) >= 40) {
          out.push(`${n.tagName}.${(n.getAttribute('class') || '').slice(0, 70)} z=${z}`);
        }
      }
    });
    return out;
  });
}

async function openLightbox(page: Page) {
  await page.goto('/ops/photos?view=grid-sm');
  await expect(page.getByText(/photos? in view/i)).toBeVisible();
  const tile = page.getByTestId('photo-tile').first();
  if (!(await tile.count())) test.skip(true, 'no photos seeded in this environment');
  await tile.click();
  await expect(page.getByTestId('photo-lightbox')).toBeVisible();
}

test.describe('photo viewer · dismissal', () => {
  // Desktop lightbox layout only — the mobile viewer is a separate component
  // (MobileSwipePhotoViewer) with its own gestures.
  test.skip(({ isMobile }) => !!isMobile, 'desktop lightbox layout only');

  test('Escape close leaves no click-blocking overlay', async ({ page }) => {
    await openLightbox(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('photo-lightbox')).toHaveCount(0);
    await page.waitForTimeout(600);
    expect(await leftoverBlockingLayers(page)).toHaveLength(0);
  });

  test('close with the details panel open (deferViewerClose) leaves no overlay and stays clickable', async ({ page }) => {
    await openLightbox(page);
    await page.getByRole('button', { name: /show photo details/i }).click();
    await expect(page.getByTestId('photo-context-panel')).toBeVisible();
    await page.getByRole('button', { name: /close photo viewer/i }).click();
    await expect(page.getByTestId('photo-lightbox')).toHaveCount(0);
    await page.waitForTimeout(1200);
    expect(await leftoverBlockingLayers(page)).toHaveLength(0);
    // Proof the page accepts clicks again (the ghost scrim is `fixed inset-0`, so
    // if it lingered it would swallow this too): a sidebar control focuses.
    const filter = page.getByRole('textbox', { name: /filter po/i });
    await filter.click();
    await expect(filter).toBeFocused();
  });

  test('clicking the backdrop around the photo closes the viewer', async ({ page }) => {
    await openLightbox(page);
    // Top-left dark padding of the stage — not the image, toolbar, or thumbnails.
    await page.mouse.click(120, 470);
    await expect(page.getByTestId('photo-lightbox')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await leftoverBlockingLayers(page)).toHaveLength(0);
  });

  test('clicking the image itself does NOT close the viewer', async ({ page }) => {
    await openLightbox(page);
    await page.getByTestId('photo-lightbox').locator('img').first().click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('photo-lightbox')).toBeVisible();
  });
});
