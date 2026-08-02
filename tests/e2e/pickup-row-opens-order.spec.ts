import { test, expect } from '@playwright/test';

/**
 * Local Pickup is the sibling surface that did NOT have the click-plane defect,
 * and this pins that verdict so the next sweep does not "fix" it into one.
 *
 * `PickupGridView` never had a `selectMode` at all: the row body always calls
 * `onSelectOrder`, which writes the durable `?lcpu=<orderId>` selection the
 * sidebar rail writes from the other side — Workbench URL-as-state, and
 * reversible (re-clicking the open order clears it). LCPU orders live in
 * `local_pickup_orders` / `_items`, not the receiving-lines pipeline, so there
 * is no receiving inspector for a row to open and no bulk plane to split.
 *
 * The 2rem `select` track stays a painted `aria-hidden` span. That is the
 * house-correct third state for a surface with no multi-select plane — it is
 * NOT a `GridRowCheckbox`, and it must not stop propagation, or it would carve
 * a dead zone out of the one gesture this grid has.
 *
 *   npx playwright test tests/e2e/pickup-row-opens-order.spec.ts --project=desktop
 */

test.describe('Local Pickup — the row click owns the record plane', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the pickup spreadsheet is a desktop layout');

  test('a row click selects its LCPU order in the URL, and toggles back off', async ({ page }) => {
    await page.goto('/pickup', { waitUntil: 'domcontentloaded' });
    const rows = page.locator('[data-pickup-row-id]');
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 40_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no local pickup orders on this tenant');

    // The record plane, announced: a button, and no checkbox anywhere in the
    // row — the gutter is a spacer here, not an unwired control.
    await expect(rows.first()).toHaveAttribute('role', 'button');
    await expect(rows.first().getByRole('checkbox')).toHaveCount(0);

    await rows.first().click();
    await expect(page).toHaveURL(/[?&]lcpu=\d+/);

    // Same toggle the sidebar rail does — a second click clears the selection.
    await rows.first().click();
    await expect(page).not.toHaveURL(/[?&]lcpu=\d+/);
  });
});
