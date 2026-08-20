import { test, expect } from '@playwright/test';

/**
 * Desk inspector leaf chrome is a BAND, never a bare mount.
 *
 * `StationDisplayLeafHeader` is authored for the Displays column's horizontal
 * top band, so it carries `h-full flex-1`. Mounted bare into the desk shell's
 * COLUMN flex, that `flex-1` grows the header VERTICALLY: the title floats in
 * the middle of the panel and the leaf body is pinned to the floor. That
 * shipped on `detail:order-ingest` → "Import latest orders" (field + CTA at the
 * bottom of an otherwise empty rail) and on every other
 * `DeskInspectorIndexShell` consumer, Support context included.
 *
 * The invariant is geometric, so it is measured, not grepped: the header band
 * stays a chrome row, and the leaf body starts directly under it.
 */
test.describe('desk inspector leaf header', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desk rail is a desktop layout');

  test('leaf chrome stays a chrome row and the body starts under it', async ({ page }) => {
    await page.goto('/shipping/orders');

    const add = page.getByTestId('outbound-chrome-add').or(
      page.getByRole('button', { name: /add order/i }),
    ).first();
    await expect(add).toBeVisible({ timeout: 30_000 });
    await add.click();

    const rail = page.getByTestId('order-ingest-rail');
    await expect(rail).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /Import latest orders/i }).first().click();

    const band = rail.locator('[data-desk-inspector-leaf-band]');
    const body = rail.locator('[data-station-displays-leaf-body]');
    await expect(band).toBeVisible();
    await expect(body).toBeVisible();

    const bandBox = (await band.boundingBox())!;
    const bodyBox = (await body.boundingBox())!;
    const railBox = (await rail.boundingBox())!;

    // A chrome row, not a grown column: well under a third of the rail.
    expect(bandBox.height).toBeLessThan(40);
    expect(bandBox.height).toBeLessThan(railBox.height / 3);

    // The body begins immediately under the band — no swallowed void above it.
    expect(bodyBox.y - (bandBox.y + bandBox.height)).toBeLessThan(4);

    // The leaf's own first control sits at the TOP of the body, not the floor.
    const field = body.locator('input, button').first();
    const fieldBox = (await field.boundingBox())!;
    expect(fieldBox.y - bodyBox.y).toBeLessThan(80);
  });

  test('support context rail opens its leaf under a chrome band', async ({ page }) => {
    // `anchor` is derived from the param alone, so the rail mounts on any id;
    // it opens straight onto the first leaf (Connections), which is exactly the
    // frame that regressed. Pre-fix this header measured 391px of a 860px rail
    // and pushed the body from y=146 to y=509.
    await page.goto('/support?ticket=1');

    const rail = page.locator('aside[role="region"][aria-label*="support context"]');
    await expect(rail).toBeVisible({ timeout: 30_000 });

    const band = rail.locator('[data-desk-inspector-leaf-band]');
    const body = rail.locator('[data-station-displays-leaf-body]');
    await expect(band).toBeVisible({ timeout: 20_000 });
    await expect(body).toBeVisible();

    const bandBox = (await band.boundingBox())!;
    const bodyBox = (await body.boundingBox())!;
    const railBox = (await rail.boundingBox())!;

    expect(bandBox.height).toBeLessThan(40);
    expect(bandBox.height).toBeLessThan(railBox.height / 3);
    expect(bodyBox.y - (bandBox.y + bandBox.height)).toBeLessThan(4);
  });
});
