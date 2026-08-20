import { test, expect } from '@playwright/test';

/**
 * Photo library — fullscreen viewer context panel.
 *
 * The flat library views (grid-sm/grid-lg/grid-ticket/list) open the shared
 * `PhotoViewerModal` at the clicked photo, and the viewer surfaces a right-side
 * info panel ({@link PhotoContextPanel}) with the photo's source, a deep link
 * back to that source, dimensions, uploader, and analysis verdict.
 *
 * Seed data is not guaranteed in every environment, so each test is defensive:
 * it exercises the panel only when a photo tile exists, and always asserts the
 * surface renders without uncaught errors.
 */

test.describe('Photo library · viewer context panel', () => {
  test('clicking a grid tile opens the viewer with a details panel', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // grid-sm is a flat view — tiles open the shared lightbox (not a new tab).
    await page.goto('/ops/photos?view=grid-sm');
    await expect(page.locator('[data-testid="photo-library-meta"]')).toContainText(/\d+ photo/i);

    const firstTile = page.getByTestId('photo-tile').first();
    if (await firstTile.count()) {
      await firstTile.click();

      const lightbox = page.getByTestId('photo-lightbox');
      await expect(lightbox).toBeVisible();

      // Details is a persistent top-level toggle (like zoom), not a ⋮ menu item.
      await page.getByRole('button', { name: /show photo details/i }).click();
      const panel = page.getByTestId('photo-context-panel');
      await expect(panel).toBeVisible();

      // Both the toolbar toggle and the panel's own collapse control share this
      // label; either dismisses the panel — take the toolbar one.
      await page.getByRole('button', { name: /hide photo details/i }).first().click();
      await expect(panel).toHaveCount(0);

      // Rotate must not crash the viewer.
      await page.getByRole('button', { name: /rotate/i }).click();
      await expect(lightbox).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByTestId('photo-lightbox')).toHaveCount(0);
    }

    expect(pageErrors, `Uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });

  test('the panel deep link returns to a source-scoped library view', async ({ page }) => {
    await page.goto('/ops/photos?view=grid-sm');
    await expect(page.locator('[data-testid="photo-library-meta"]')).toContainText(/\d+ photo/i);

    const firstTile = page.getByTestId('photo-tile').first();
    if (!(await firstTile.count())) test.skip(true, 'no photos seeded in this environment');

    await firstTile.click();
    await expect(page.getByTestId('photo-lightbox')).toBeVisible();

    // Open the info panel from the persistent details toggle.
    await page.getByRole('button', { name: /show photo details/i }).click();
    await expect(page.getByTestId('photo-context-panel')).toBeVisible();

    // The "view all from this source" link is present only when the photo has a
    // resolvable source (PO ref or linked ticket). When present, following it
    // lands back on a filtered library that still renders the count line.
    const sourceLink = page.getByTestId('photo-context-source-link');
    if (await sourceLink.count()) {
      const href = await sourceLink.getAttribute('href');
      expect(href).toMatch(/\/ops\/photos\?/);
      await sourceLink.click();
      await expect(page).toHaveURL(/\/ops\/photos\?/);
      await expect(page.locator('[data-testid="photo-library-meta"]')).toContainText(/\d+ photo/i);
    }
  });

  test('the panel surfaces SKU and evidence-stage identity when the row resolves them', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/ops/photos?view=grid-sm');
    await expect(page.locator('[data-testid="photo-library-meta"]')).toContainText(/\d+ photo/i);

    const firstTile = page.getByTestId('photo-tile').first();
    if (!(await firstTile.count())) test.skip(true, 'no photos seeded in this environment');

    await firstTile.click();
    await expect(page.getByTestId('photo-lightbox')).toBeVisible();
    await page.getByRole('button', { name: /show photo details/i }).click();
    await expect(page.getByTestId('photo-context-panel')).toBeVisible();

    // SKU · serial · stage are display joins resolved by the library query —
    // present only when the photo links to a receiving line / serialized unit.
    // Assert defensively: when rendered, the values must be non-empty and the
    // stage chip must speak the stage SoT vocabulary (photoStageLabel).
    const skuField = page.getByTestId('photo-context-sku');
    if (await skuField.count()) {
      await expect(skuField).not.toBeEmpty();
    }
    const stageChip = page.getByTestId('photo-context-stage');
    if (await stageChip.count()) {
      await expect(stageChip).toHaveText(
        /^(Arrival · package|Unbox · carton|Unbox · item|Testing|Packing)$/,
      );
    }

    expect(pageErrors, `Uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });

  test('grid views render a flat contact sheet and the masonry view without crashing', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // The stream is day-banded at every grid density — `PhotoFlatGrid` groups
    // by capture day and emits a sticky `DateGroupHeader` per group.
    await page.goto('/ops/photos?view=grid-sm');
    await expect(page.locator('[data-testid="photo-library-meta"]')).toContainText(/\d+ photo/i);
    if (await page.getByTestId('photo-tile').count()) {
      await expect(page.getByTestId('photo-tile').first()).toBeVisible();
    }
    /*
      Day bands are part of the stream, not absent from it.

      This asserted `toHaveCount(0)` and passed for one reason: the settled
      gate above it was a bare `toBeVisible()` on an element that is mounted
      while loading, so the count was read before a single band had rendered.
      With an honest gate the real DOM shows five. A test that only passes
      because it runs too early is worse than no test — it reports coverage of
      a claim that was never true.
    */
    if (await page.getByTestId('photo-tile').count()) {
      expect(await page.locator('[data-date]').count()).toBeGreaterThan(0);
    }

    // Large grid switches to the masonry layout; must render error-free.
    await page.goto('/ops/photos?view=grid-lg');
    await expect(page.locator('[data-testid="photo-library-meta"]')).toContainText(/\d+ photo/i);

    expect(pageErrors, `Uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });
});
