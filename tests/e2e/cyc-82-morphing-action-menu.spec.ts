import path from 'path';
import { test, expect } from '@playwright/test';

/**
 * CYC-82 morphing left-gutter menu on To-ship.
 * Does not confirm an assignment (no prod write).
 *
 * Run it through the lane config, which drops `globalSetup` so the shared
 * `tests/.auth` states are read and never re-minted:
 *
 *   PW_BASE_URL=http://localhost:3052 \
 *     npx playwright test -c playwright.cyc82.config.ts --project=qa-desktop
 *
 * Turbopack 500s the authenticated APIs on this worktree, so serve :3052 with
 * `pnpm exec next dev --webpack -p 3052`.
 */

// Storage state comes from the PROJECT, not from this file: the roster this
// menu paints (Tuan / Thuy / Sang / Ajax / Lien / Michael) is USAV staff, so
// `--project=desktop` (tests/.auth/admin.json) is the run that sees people.

const SHOT = process.env.CYC82_SHOT_DIR || '/tmp/cyc-82-e2e';

test.describe('CYC-82 morphing action menu', () => {
  test.skip(({ isMobile }) => !!isMobile, 'desk checkbox is desktop');

  test('checkbox opens morphing menu; A/P/Esc; Shift does not open', async ({ page }, testInfo) => {
    const probe = await page.request.get('/api/orders/queue-counts');
    test.skip(!probe.ok(), `no session (${probe.status()})`);

    await page.goto('/shipping/orders', { waitUntil: 'domcontentloaded' });
    if (/signin|login|account\/sign/i.test(page.url())) {
      test.skip(true, 'bounced to signin');
    }

    const grid = page.locator('[data-testid="pending-grid-body"]').filter({ visible: true }).first();
    await expect(grid).toBeVisible({ timeout: 30_000 });

    const gutter = grid.locator('[data-select-gutter] button[role="checkbox"]').first();
    await expect(gutter).toBeVisible();

    await gutter.click();
    const menu = page.getByTestId('morphing-row-action-menu');
    await expect(menu).toBeVisible({ timeout: 8_000 });
    for (const verb of [
      /Picked by/i,
      /Packed by/i,
      /Notes/i,
      /More information/i,
      /Mark urgent/i,
      /Out of stock/i,
      /^Delete/i,
    ]) {
      await expect(menu.getByRole('button', { name: verb })).toBeVisible();
    }
    // No confirm step anywhere in the manifold — a pick IS the commit.
    await expect(menu.getByRole('button', { name: /^Confirm|^Deny/i })).toHaveCount(0);

    // It opens to the LEFT, outside the table's left edge — and never off the
    // window. How much of it clears the table depends on the page gutter: at
    // 1440 with the sidebar there are only ~128px left of the grid, so the
    // panel rests against the viewport edge. Both halves are asserted.
    const panelBox = await menu.boundingBox();
    const gridBox = await grid.boundingBox();
    expect(panelBox, 'panel has a box').toBeTruthy();
    expect(gridBox, 'grid has a box').toBeTruthy();
    expect(panelBox!.x, 'opens left of the table').toBeLessThan(gridBox!.x);
    expect(panelBox!.x, 'never off the left of the window').toBeGreaterThanOrEqual(0);

    await page.screenshot({
      path: path.join(SHOT, `${testInfo.project.name}-01-actions.png`),
      fullPage: false,
    });

    await page.keyboard.press('n');
    await expect(menu.locator('[data-view="notes-view"]')).toBeVisible({ timeout: 5_000 });
    await expect(menu.getByLabel('Add an order note')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu.locator('[data-view="actions-view"]')).toBeVisible();

    // A → pickers. Wait for a REAL name, not just the morphed view: the roster
    // arrives from /api/staff and an empty panel would otherwise pass.
    await page.keyboard.press('a');
    await expect(menu.locator('[data-view="pickers-view"]')).toBeVisible({ timeout: 5_000 });
    await expect(menu.getByText('Assign picker')).toBeVisible();
    await expect(menu.getByPlaceholder('Search staff…')).toBeVisible();
    await expect(menu.getByPlaceholder('Search staff…')).toBeFocused();
    await expect(menu.getByTestId('stage-staff-all-staff')).toBeVisible();
    await expect(
      menu.getByRole('option', { name: /Sang|Ajax|Lien|Michael/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
    // Live staff only — never an invented roster, and Kai is never on it.
    await expect(menu.getByRole('option', { name: /Kai|Alex|Jordan|Taylor|Morgan|Casey/i })).toHaveCount(0);
    await page.screenshot({
      path: path.join(SHOT, `${testInfo.project.name}-02-pickers.png`),
      fullPage: false,
    });

    await page.keyboard.press('Escape');
    await expect(menu.locator('[data-view="actions-view"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // Row stays selected after Esc — a click now unselects. Click again to
    // select and reopen the assign menu.
    await gutter.click();
    await gutter.click();
    await expect(menu).toBeVisible({ timeout: 8_000 });
    await page.keyboard.press('p');
    await expect(menu.getByText('Assign packer')).toBeVisible();
    await expect(menu.getByRole('option', { name: /Tuan|Thuy/i }).first()).toBeVisible({
      timeout: 10_000,
    });
    // Faces, not just names: IdentityMark paints a round mark per staffer —
    // their photo, or their assigned colour behind their initials.
    const face = menu.locator('span.rounded-full').first();
    await expect(face).toBeVisible();
    const painted = await face.evaluate((el) => {
      const bg = getComputedStyle(el).backgroundColor;
      return Boolean(el.querySelector('img')) || (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent');
    });
    expect(painted, 'staff mark shows a photo or a colour').toBe(true);
    await expect(menu.getByRole('option', { name: /Sang|Ajax|Lien|Michael|Kai/i })).toHaveCount(0);
    await page.screenshot({
      path: path.join(SHOT, `${testInfo.project.name}-02b-packers.png`),
      fullPage: false,
    });
    await page.keyboard.press('Escape');
    await expect(menu.locator('[data-view="actions-view"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    await gutter.click();
    await gutter.click();
    await expect(menu).toBeVisible({ timeout: 8_000 });
    await page.keyboard.press('i');
    const overlay = page.getByTestId('desk-order-stage-overlay');
    await expect(overlay).toBeVisible({ timeout: 8_000 });
    await expect(overlay).toHaveAttribute('data-desk-stage-fill', 'stage');
    await page.keyboard.press('Escape');
    await expect(overlay).toHaveCount(0);

    await gutter.click({ modifiers: ['Shift'] });
    await expect(page.getByTestId('morphing-row-action-menu')).toHaveCount(0);
    await page.screenshot({
      path: path.join(SHOT, `${testInfo.project.name}-03-shift-triage.png`),
      fullPage: false,
    });

    // The verbs live on the gutter now, so with rows selected To-ship must NOT
    // paint the column action row or the legacy Copy pill under the grid.
    await expect(page.getByTestId('data-table-column-actions')).toHaveCount(0);
    await expect(page.getByTestId('data-table-selection-action-wrap')).toHaveCount(0);
  });
});
