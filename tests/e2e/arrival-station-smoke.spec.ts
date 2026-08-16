import { test, expect } from '@playwright/test';

/**
 * Arrival station — QA-org smoke (Page 1 of the station port,
 * `.claude/rules/display/station-port-from-unbox.md`).
 *
 * Certifies the Unbox-golden anatomy renders end-to-end when a carton opens on
 * `/triage`:
 *   Rows 1-2 — flow identity + one white door-flow ops plane (`arrival-door-flow`)
 *   Row 3   — flush `UnboxDockHost` floor: dogfood Save strip + Staging Band-1
 *             ACTION (`data-arrival-staging-dock`) + the compact `w-8` procedure
 *             scan waist (`data-arrival-dock-scan`, Unbox scan-entry parity)
 *   Row 4   — the `←|` Open-displays control mounts the Ticket + Pairing push
 *             (`arrival-displays-push`), never a `RightRailHost` occupant
 *
 * Opening: `/triage` restores a carton ONLY via the `receiving-select-line`
 * event — the `?openReceivingId=` deep-link is Unbox-surface-only
 * (`shouldRestoreOpenReceiving`) — so the smoke performs the operator action:
 * open the first triage recent-rail row.
 *
 * Runs on the QA tenant (qa-desktop / qa-admin.json) — never dogfood. Requires
 * `pnpm provision:qa-org` (seeds a triage carton via `seedReceivingFixture`;
 * the tenant also carries prior E2E cartons in the scanned feed).
 */

test.describe('Arrival station — Unbox-port anatomy (QA org)', () => {
  // Desktop scan surface — the mobile project mounts a different shell.
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop scan surface');

  test('Arrival opens a carton and renders all four ported layers', async ({ page }) => {
    test.setTimeout(120_000);

  await page.goto('/triage');

  // A triage carton auto-opens on this surface (first-row select). If the tenant
  // ever loads with an empty rail, fall back to the operator action: open the
  // first triage recent-rail row.
  const center = page.getByTestId('arrival-station-center');
  try {
    await center.waitFor({ state: 'visible', timeout: 25_000 });
  } catch {
    await page
      .locator('li[role="option"] button[data-rail-row]')
      .first()
      .click({ timeout: 15_000 });
    await center.waitFor({ state: 'visible', timeout: 20_000 });
  }

  // Row 1 + 2 — flow identity + one white door-flow ops plane.
  await expect(page.getByTestId('arrival-station-center')).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('arrival-door-flow')).toBeVisible();

  // Row 3 — flush UnboxDockHost floor: dogfood Save strip + Staging Band-1
  // ACTION + the compact w-8 procedure scan waist (Unbox scan-entry parity).
  await expect(page.locator('[data-arrival-dock-float]')).toBeVisible();
  await expect(page.locator('[data-arrival-staging-dock]')).toBeVisible();
  await expect(page.locator('[data-arrival-dock-scan]')).toBeVisible();

  // Row 4 — the ←| Open displays control mounts the Ticket + Pairing push
  // (StationDisplaysPushStack), never a RightRailHost occupant.
  const openDisplays = page.getByTestId('unbox-displays-pane-toggle');
  await expect(openDisplays).toBeVisible();
  await openDisplays.click();
  await expect(page.getByTestId('arrival-displays-push')).toBeVisible({
    timeout: 15_000,
  });
  });
});
