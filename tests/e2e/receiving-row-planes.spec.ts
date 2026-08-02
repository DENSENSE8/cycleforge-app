import { test, expect } from '@playwright/test';

/**
 * The receiving tables carry TWO action planes on one row, and they must not
 * collapse into one gesture (`display/workbench.md` → Action planes):
 *
 *   • row body      → the RECORD plane (open the record)
 *   • select gutter → the MULTI-SELECT plane (bulk membership)
 *
 * They used to be one. `useReceivingLineBulkSelection` pins `selectMode` ON for
 * every `isTableOnlyMode` surface, and `handleSelectRow` read `selectMode` as
 * "bulk mode — never open", so a row click could only ever tick a checkbox: the
 * whole row claimed `role="checkbox"`, the gutter was an inert painted span, and
 * `receiving-select-line` was never dispatched from these surfaces at all.
 *
 * Destination differs by surface, deliberately:
 *   • `/incoming` → the non-modal `detail:incoming` inspector.
 *   • `/receiving/history` → `/carton/[id]`, the durable READ record. NOT
 *     `/unbox` (its legacy `receiving-select-line` branch), because dropping a
 *     browse click into the scan bench mixes a Workbench map with a Station.
 *
 * And the split is per SURFACE, not per `mode.id`: the Unbox workbench's default
 * tab shares `mode.id === 'history'` but sits in a three-tab strip under one
 * bulk bar, so it keeps the legacy single-gesture row — asserted below, because
 * that is the regression this scoping exists to prevent.
 *
 * Run against the QA org (`.claude/rules/verify.md`):
 *   npx playwright test tests/e2e/receiving-row-planes.spec.ts --project=qa-desktop
 */

test.describe('Receiving row action planes', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'receiving grids are a desktop layout');

  async function firstRow(page: import('@playwright/test').Page) {
    const rows = page.locator('[data-line-row-id]');
    const ok = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    return ok ? rows : null;
  }

  test('History: the row body opens the carton READ record, not /unbox', async ({ page }) => {
    await page.goto('/receiving/history');
    const rows = await firstRow(page);
    if (!rows) test.skip(true, 'no History rows on this tenant');

    const row = rows!.first();
    const lineId = await row.getAttribute('data-line-row-id');

    // The body is the record plane — a button, not a checkbox.
    await expect(row).toHaveAttribute('role', 'button');
    await expect(row).toHaveAttribute('aria-label', `Open receiving line ${lineId}`);

    await row.locator('[data-col="title"]').click();

    // Lands on the durable read record. `/unbox` here would be the Workbench →
    // Station contract mix this destination was chosen to avoid.
    await expect.poll(() => new URL(page.url()).pathname).toMatch(/^\/carton\/\d+$/);
    expect(new URL(page.url()).pathname).not.toContain('/unbox');
  });

  test('History: the gutter checkbox does bulk WITHOUT navigating', async ({ page }) => {
    await page.goto('/receiving/history');
    const rows = await firstRow(page);
    if (!rows) test.skip(true, 'no History rows on this tenant');

    const before = page.url();
    const box = rows!.first().getByRole('checkbox').first();
    await expect(box).toHaveAttribute('aria-checked', 'false');

    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    // Ticking a box must never move the operator off the surface.
    expect(page.url()).toBe(before);

    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'false');
  });

  test('Unbox workbench keeps the legacy single-gesture row (scoping guard)', async ({ page }) => {
    await page.goto('/unbox');
    const rows = await firstRow(page);
    if (!rows) test.skip(true, 'no Unbox workbench rows on this tenant');

    const row = rows!.first();
    const lineId = await row.getAttribute('data-line-row-id');
    const before = page.url();

    // Same `mode.id === 'history'`, deliberately NOT split: its three tabs share
    // one bulk bar, so a tab whose rows navigate away beside two whose rows tick
    // a box would be the inconsistency. Scoped off by `!embedded`.
    await expect(row).toHaveAttribute('role', 'checkbox');
    await expect(row).toHaveAttribute('aria-label', `Select receiving line ${lineId}`);
    // The gutter stays a painted indicator here — no real checkbox control.
    await expect(row.getByRole('checkbox')).toHaveCount(0);

    await row.locator('[data-col="title"]').click();
    await page.waitForTimeout(1_000);
    expect(page.url()).toBe(before);
  });
});
