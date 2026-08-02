import { test, expect } from '@playwright/test';

/**
 * `/receiving/history` splits the two action planes, same as `/incoming`:
 * the row body is the RECORD plane and the select gutter is the MULTI-SELECT
 * plane (`display/workbench.md` → Action planes).
 *
 * History's record is the durable carton READ page `/carton/[id]` — NOT the
 * `/unbox?openReceivingId=` deep link its `receiving-select-line` branch would
 * otherwise take. A browse table handing a click to the scan bench mixes a
 * Workbench map with a Station, and `searchHitHref` already sends a RECEIVING
 * hit to `/carton/[id]`, so this is the destination that already existed.
 *
 * Before the split, `useReceivingLineBulkSelection` pinned `selectMode` ON for
 * every `isTableOnlyMode` surface and the row click could only tick a checkbox:
 * measured on dogfood 2026-08-01, 31 rows, zero `receiving-select-line` events.
 *
 * Run against the QA org (`.claude/rules/verify.md`):
 *   pnpm provision:qa-org && npx playwright test tests/e2e/history-row-opens-carton.spec.ts --project=qa-desktop
 */
test.describe('History row → carton read record', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grids are a desktop layout');

  test('a row click opens /carton/[id]', async ({ page }) => {
    await page.goto('/receiving/history');

    const rows = page.locator('[data-line-row-id]');
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no History rows on this tenant');

    // The body is the record plane, so it announces as a button — the row used
    // to carry `role="checkbox"` across its whole width.
    await expect(rows.first()).toHaveAttribute('role', 'button');

    await rows.first().click();
    await expect(page).toHaveURL(/\/carton\/\d+/, { timeout: 15_000 });
  });

  test('the gutter checkbox does bulk WITHOUT navigating', async ({ page }) => {
    await page.goto('/receiving/history');

    const rows = page.locator('[data-line-row-id]');
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no History rows on this tenant');

    const box = rows.first().getByRole('checkbox').first();
    await expect(box).toHaveAttribute('aria-checked', 'false');

    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    // Still on the browse map — a check is not a row click.
    await expect(page).toHaveURL(/\/receiving\/history/);

    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'false');
  });

  test('the Unbox workbench opens IN PLACE, not at /carton', async ({ page }) => {
    // The scoping this surface flag exists for. `/unbox`'s default tab shares
    // `mode.id === 'history'`, but its record plane is the LineEditPanel
    // workspace, not the read page — a flip keyed on the mode id alone would
    // have sent the station's own feed off to `/carton/[id]`.
    // Unbox's own contract lives in `unbox-feed-opens-carton.spec.ts`.
    await page.goto('/unbox');

    const rows = page.locator('[data-line-row-id]');
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no Unbox rows on this tenant');

    await rows.first().click();
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/unbox/);
  });
});
