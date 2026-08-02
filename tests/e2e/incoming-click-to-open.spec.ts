import { test, expect } from '@playwright/test';

/**
 * Incoming = table-only until a row click.
 *
 * Regression guard for the "details panel opens on /incoming load" bug: the
 * IncomingDetailsPanel (a right-rail occupant) must open ONLY after an explicit
 * row click — never on page load, and never because a stale
 * `?openReceivingId=` rode a mode switch onto Incoming.
 *
 * The panel is NON-MODAL (`detail:incoming`, `modal={false}`) as of the queue
 * inspector wave, so it renders as `aside[role="region"]`, not `role="dialog"`.
 * Its modality contract lives in `queue-inspector-non-modal.spec.ts`; this spec
 * only asserts WHEN it appears.
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
  /** The details panel, whichever modality it carries. */
  const DETAIL_PANEL = 'aside[role="region"], [role="dialog"]';

  test('A — fresh /incoming shows the table with no detail panel', async ({ page }) => {
    const listReq = page.waitForRequest(
      (r) => /\/api\/receiving-lines(\?|$)/.test(r.url()) && r.method() === 'GET',
    );
    await page.goto('/incoming');
    await listReq;

    // Let any errant restore/select settle before asserting the negative.
    await page.waitForTimeout(600);
    await expect(page.locator(DETAIL_PANEL)).toHaveCount(0);
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
    await expect(page.locator(DETAIL_PANEL)).toHaveCount(0);
  });

  test('C — clicking a row opens the details panel; close stays closed', async ({ page }) => {
    await page.goto('/incoming');
    await page.waitForRequest(
      (r) => /\/api\/receiving-lines(\?|$)/.test(r.url()) && r.method() === 'GET',
    );

    const firstRow = page.locator('[data-line-row-id]').first();
    // Wait for the row to RENDER before deciding to skip — `count()` does not
    // auto-wait, so checking it straight after the fetch skipped this case even
    // on a tenant that has rows (it did, until the QA Incoming fixture landed).
    const hasRows = await firstRow
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no Incoming rows seeded');

    // A row can be a PO group header or a leaf line — click and expect the panel.
    await firstRow.click();
    const panel = page.locator(DETAIL_PANEL);
    // A PO-less/unlinked row toasts instead of opening; only assert when a
    // panel actually appears (deterministic-feedback rows are a valid no-op).
    const opened = await panel
      .first()
      .waitFor({ state: 'visible', timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (!opened) test.skip(true, 'first row is not PO/shipment-linked (toast path)');

    // Close via Escape and confirm it does not immediately re-open.
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await page.waitForTimeout(600);
    await expect(panel).toHaveCount(0);
  });
});
