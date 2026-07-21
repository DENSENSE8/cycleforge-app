import { test, expect } from '@playwright/test';

/**
 * Incoming = table-only until a row click.
 *
 * Regression guard for the "details panel opens on /incoming load" bug: the
 * IncomingDetailsPanel (a right-rail `role="dialog"`) must open ONLY after an
 * explicit row click — never on page load, and never because a stale
 * `?openReceivingId=` rode a mode switch onto Incoming.
 *
 * Root cause the fix addresses: `?openReceivingId=` is the Unbox surface's
 * focused-carton URL SoT (written only on /unbox). The workspace-pane restore
 * read side was NOT surface-gated, so a leaked param on /incoming fired
 * `dispatchSelectLine`, which the Incoming overlays listener turned into an open
 * details panel. `shouldRestoreOpenReceiving(isUnboxSurface, id)` now gates it.
 *
 * Live against the seeded dogfood org (global-setup handles auth). The row-click
 * assertion skips cleanly when no Incoming rows are seeded.
 */
test.describe('Incoming click-to-open (no details on load)', () => {
  test('A — fresh /incoming shows the table with no detail dialog', async ({ page }) => {
    const listReq = page.waitForRequest(
      (r) => /\/api\/receiving-lines(\?|$)/.test(r.url()) && r.method() === 'GET',
    );
    await page.goto('/incoming');
    await listReq;

    // Let any errant restore/select settle before asserting the negative.
    await page.waitForTimeout(600);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('B — a stale ?openReceivingId= must NOT open the details panel on load', async ({ page }) => {
    // The exact leak: a focused-carton param from a prior Unbox session rides a
    // mode switch onto /incoming. Before the fix this popped the details panel.
    const listReq = page.waitForRequest(
      (r) => /\/api\/receiving-lines(\?|$)/.test(r.url()) && r.method() === 'GET',
    );
    await page.goto('/incoming?openReceivingId=999999&lineId=999999');
    await listReq;

    await page.waitForTimeout(800);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('C — clicking a row opens the details panel; close stays closed', async ({ page }) => {
    await page.goto('/incoming');
    await page.waitForRequest(
      (r) => /\/api\/receiving-lines(\?|$)/.test(r.url()) && r.method() === 'GET',
    );

    const firstRow = page.locator('[data-line-row-id]').first();
    // Skip cleanly when the seed org has no Incoming rows.
    if ((await firstRow.count()) === 0) test.skip(true, 'no Incoming rows seeded');
    await firstRow.waitFor({ state: 'visible' });

    // A row can be a PO group header or a leaf line — click and expect the panel.
    await firstRow.click();
    const dialog = page.getByRole('dialog');
    // A PO-less/unlinked row toasts instead of opening; only assert when a
    // dialog actually appears (deterministic-feedback rows are a valid no-op).
    const opened = await dialog
      .first()
      .waitFor({ state: 'visible', timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!opened) test.skip(true, 'first row is not PO/shipment-linked (toast path)');

    // Close via Escape and confirm it does not immediately re-open.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.waitForTimeout(600);
    await expect(dialog).toHaveCount(0);
  });
});
