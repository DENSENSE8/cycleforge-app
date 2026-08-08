import { test, expect, type Page } from '@playwright/test';

/**
 * Photo viewer dismissal — regression coverage for the dismissal bugs:
 *
 *  1. Ghost overlay: closing the fullscreen `PhotoViewerModal` must fully
 *     unmount the scrim. A stuck full-screen scrim (the old `mode="wait"` +
 *     keyless AnimatePresence deadlock in `PhotoGallery`) left the page
 *     un-clickable until a reload.
 *  2. HoverTooltip portal leak: the toolbar controls (Rotate, Close, …) wrap
 *     their icons in `HoverTooltip`, which renders the label in a `document.body`
 *     portal. On close, `mouseleave` often never fires (the trigger unmounts
 *     under the cursor), so a body-portalled bubble (e.g. "Rotate (r)") could
 *     linger over the page toolbar until the whole viewer unmounted.
 *  3. Stale hit target: `pointer-events-auto` toolbar controls inside a fading
 *     modal (or the `Layer` shell) can keep blocking clicks on the page controls
 *     underneath (grid-density toggles, Filter PO) during/after the exit.
 *  4. Click-off: clicking the dark backdrop around the photo closes the viewer
 *     (standard lightbox affordance); clicking the image itself or a bottom
 *     filmstrip thumbnail does not.
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

/** Viewer toolbar tooltip labels that must never leak after dismiss. */
const VIEWER_TOOLTIP_PATTERN =
  /rotate \(r\)|reset \(0\)|zoom in \(\+\)|zoom out \(-\)|close \(esc\)|show photo details|hide photo details|download photo|download photos|more actions/i;

/** Body-portalled HoverTooltip bubbles tied to the viewer — must be 0 after close. */
async function leftoverViewerTooltips(page: Page): Promise<string[]> {
  return page.evaluate((patternSource) => {
    const re = new RegExp(patternSource, 'i');
    return Array.from(document.querySelectorAll('[role="tooltip"]'))
      .map((el) => (el.textContent ?? '').trim())
      .filter((t) => t.length > 0 && re.test(t));
  }, VIEWER_TOOLTIP_PATTERN.source);
}

/** DOM proof the modal shell is gone. */
async function assertLightboxFullyGone(page: Page) {
  await expect(page.getByTestId('photo-lightbox')).toHaveCount(0);
}

/**
 * Poll until ALL dismiss artifacts are gone — covers the exit animation (~150ms
 * scrim) AND the deferViewerClose panel width collapse (~300–1200ms). Prefer
 * expect.poll over a naked waitForTimeout so a slow-but-clearing exit passes and
 * only a genuinely stuck artifact fails.
 */
async function assertDismissArtifactsCleared(page: Page, timeoutMs = 2000) {
  await assertLightboxFullyGone(page);
  await expect
    .poll(async () => leftoverViewerTooltips(page), { timeout: timeoutMs })
    .toEqual([]);
  await expect
    .poll(async () => leftoverBlockingLayers(page), { timeout: timeoutMs })
    .toEqual([]);
}

/**
 * Functional proof the page accepts clicks again — hits the exact controls that
 * were blocked in the reported bug (the photo-library header cluster). If a ghost
 * scrim (`fixed inset-0`) or a stale toolbar hit target lingered, these clicks
 * would be swallowed.
 */
async function assertPhotoLibraryHeaderClickable(page: Page) {
  // Grid density toggle (the pill group beside the count line). Default density is
  // `lg`, so Medium starts unpressed → clicking must flip it to pressed.
  const mediumGrid = page.getByRole('button', { name: 'Medium grid' }).first();
  await expect(mediumGrid).toBeVisible();
  await mediumGrid.click();
  await expect(mediumGrid).toHaveAttribute('aria-pressed', 'true');

  // Sidebar filter — the same control the deferViewerClose test proves focusable.
  const filter = page.getByRole('textbox', { name: /filter po/i });
  await filter.click();
  await expect(filter).toBeFocused();
}

/** Hover the Rotate control until its body-portalled tooltip is on screen. */
async function hoverRotateTooltip(page: Page) {
  // Rotate lives in the sm+ zoom/rotate pill; the desktop project is 1440px wide.
  const rotate = page.getByRole('button', { name: /rotate 90 degrees/i });
  await expect(rotate).toBeVisible();
  await rotate.hover();
  await expect(page.getByRole('tooltip', { name: /rotate \(r\)/i })).toBeVisible();
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
    await assertDismissArtifactsCleared(page);
  });

  test('close with the details panel open (deferViewerClose) leaves no overlay and stays clickable', async ({ page }) => {
    await openLightbox(page);
    await page.getByRole('button', { name: /show photo details/i }).click();
    await expect(page.getByTestId('photo-context-panel')).toBeVisible();
    await page.getByRole('button', { name: /close photo viewer/i }).click();
    // deferViewerClose waits for the panel width-collapse exit before unmounting.
    await assertDismissArtifactsCleared(page);
    await assertPhotoLibraryHeaderClickable(page);
  });

  test('clicking the backdrop around the photo closes the viewer', async ({ page }) => {
    await openLightbox(page);
    // Top-left dark padding of the stage — not the image, toolbar, or thumbnails.
    await page.mouse.click(120, 470);
    await assertDismissArtifactsCleared(page);
  });

  test('clicking the image itself does NOT close the viewer', async ({ page }) => {
    await openLightbox(page);
    await page.getByTestId('photo-lightbox').locator('img').first().click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('photo-lightbox')).toBeVisible();
  });

  test('clicking a filmstrip thumbnail does NOT close the viewer and changes the photo', async ({ page }) => {
    await openLightbox(page);
    const lightbox = page.getByTestId('photo-lightbox');
    // Filmstrip only mounts when the opened entity has 2+ photos.
    const otherThumb = lightbox.getByRole('button', { name: /thumbnail 2/i });
    if (!(await otherThumb.count())) {
      test.skip(true, 'opened photo has no filmstrip (need 2+ photos on the entity)');
    }
    await expect(lightbox.getByText('1 /')).toBeVisible();
    await otherThumb.click();
    await expect(lightbox).toBeVisible();
    await expect(lightbox.getByText(/^2\s*\/\s*\d+$/)).toBeVisible();
  });

  test('hovering a toolbar tooltip then pressing Escape leaves no tooltip leak and the page clickable', async ({ page }) => {
    await openLightbox(page);
    // Surface the "Rotate (r)" body portal, then dismiss with the cursor still
    // parked over where the (now-unmounting) trigger was — the exact condition
    // where `mouseleave` never fires and the bubble used to linger.
    await hoverRotateTooltip(page);
    await page.keyboard.press('Escape');
    await assertDismissArtifactsCleared(page);
    await assertPhotoLibraryHeaderClickable(page);
  });

  test('closing via the toolbar Close button clears the tooltip + overlay and restores header clicks', async ({ page }) => {
    await openLightbox(page);
    // Hover the Close control so its own "Close (Esc)" tooltip is live, then close
    // by clicking it — the trigger unmounts mid-hover.
    const close = page.getByRole('button', { name: /close photo viewer/i });
    await close.hover();
    await expect(page.getByRole('tooltip', { name: /close \(esc\)/i })).toBeVisible();
    await close.click();
    await assertDismissArtifactsCleared(page);
    await assertPhotoLibraryHeaderClickable(page);
  });
});
