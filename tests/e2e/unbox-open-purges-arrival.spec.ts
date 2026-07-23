import { test, expect, type Page } from '@playwright/test';

/**
 * Unbox open purges Arrival — desktop.
 *
 * Contract (inbound scan contract, P0 fix 2026-07-22): a carton visible in the
 * Arrival (/triage) combined rail must EXIT that rail the moment a scan opens
 * it on the Unbox surface — on the very next paint after a client-side return
 * to /triage, with NO hard reload. Pre-fix, the triage rails' 20s-fresh React
 * Query caches kept painting the carton as phantom dock inventory.
 *
 * SoT under test:
 *   - applyUnboxCartonOpened (src/components/sidebar/receiving/scan-apply.ts)
 *     — the single client chokepoint every Unbox open rung funnels through
 *   - purgeTriageRailsAfterUnboxOpen (src/lib/queries/receiving-queries.ts)
 *   - the Phase-0 cache-select rung in useTrackingScan (scan resolves from the
 *     triage-combined cache and must still purge + fire touch-scan)
 *
 * Deterministic data: unfound-queue / receiving-lines / touch-scan /
 * rail-snapshot are mocked, so no live tenant rows are created or mutated. The
 * touch-scan mock flips an `opened` flag, mirroring the real server exclude
 * (`exclude_unbox_intake` + view=scanned NOT-unbox-opened, both verified
 * separately) so post-open refetches return the carton-free list.
 */

// Desktop only — the Unbox scan bench + MasterNav mode nav is a desktop surface.
test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only');

const RECEIVING_ID = 424242;
const TRACKING = '1Z98765432109876';

const unfoundQueueRow = {
  kind: 'unmatched_receiving',
  source_id: String(RECEIVING_ID),
  organization_id: '00000000-0000-0000-0000-000000000001',
  product_title: null,
  serial_numbers: null,
  context: TRACKING,
  created_at: new Date().toISOString(),
  zendesk_ticket_id: null,
  zendesk_synced_at: null,
  usa_team_note: null,
  vietnam_team_note: null,
  follow_up_at: null,
  checked: false,
  checked_at: null,
  photo_count: 0,
};

/**
 * Client-side MasterNav hop: open the nav dropdown, expand Receiving's modes,
 * click the mode row ("Unbox" / "Arrival"). Buttons, not links — this is the
 * app's real client-side navigation, which is what keeps the React Query cache
 * (and therefore the phantom, pre-fix) alive across the mode flip.
 */
async function clickReceivingMode(page: Page, label: 'Unbox' | 'Arrival'): Promise<void> {
  const openBtn = page.locator('button[aria-label="Open navigation menu"]').first();
  if (await openBtn.count()) await openBtn.click();
  let modeBtn = page.getByRole('button', { name: label, exact: true }).first();
  if (!(await modeBtn.count())) {
    const chevron = page
      .locator('div:has(> button[aria-label="Go to Receiving"]) button[aria-label$=" modes"]')
      .first();
    await chevron.click();
    modeBtn = page.getByRole('button', { name: label, exact: true }).first();
  }
  await modeBtn.click();
}

test('scan-opening a carton on Unbox removes it from Arrival without a reload', async ({ page }) => {
  let opened = false;
  const touchScanBodies: Array<Record<string, unknown>> = [];

  // Unfound queue: the carton is Arrival-visible until opened on Unbox, then
  // excluded — the mock mirrors the (separately verified) server predicate.
  await page.route('**/api/receiving/unfound-queue*', (route) =>
    route.fulfill({
      json: {
        success: true,
        rows: opened ? [] : [unfoundQueueRow],
        total: opened ? 0 : 1,
        limit: 200,
        offset: 0,
        filters: { kind: 'unmatched_receiving', checked: 'false', q: '' },
      },
    }),
  );

  // Every receiving-lines list view renders empty — the combined rail's only
  // member is the mocked unfound stub, so assertions are deterministic.
  await page.route('**/api/receiving-lines*', (route) =>
    route.fulfill({
      json: { success: true, receiving_lines: [], total: 0, limit: 50, offset: 0 },
    }),
  );

  await page.route('**/api/receiving/touch-scan', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    touchScanBodies.push(body);
    if (body?.intakeSurface === 'unbox') opened = true;
    return route.fulfill({
      json: { success: true, scan_id: 1, receiving_id: RECEIVING_ID },
    });
  });

  await page.route('**/api/receiving/rail-snapshot', (route) =>
    route.fulfill({ json: { success: true } }),
  );

  // ── Arrival lists the carton ────────────────────────────────────────────
  await page.goto('/triage');
  const arrivalStub = page.locator('aside').getByText('Unfound PO');
  await expect(arrivalStub.first()).toBeVisible({ timeout: 20_000 });

  // Reload sentinel: survives client-side nav only.
  await page.evaluate(() => {
    (window as unknown as { __cf_spec_probe?: string }).__cf_spec_probe = 'alive';
  });

  // ── Open it on Unbox via a scan ─────────────────────────────────────────
  await clickReceivingMode(page, 'Unbox');
  await page.waitForURL('**/unbox**');
  const scanInput = page
    .locator('input[placeholder*="Tracking"], input[placeholder^="Scan"]')
    .first();
  await scanInput.waitFor({ state: 'visible', timeout: 10_000 });
  await scanInput.fill(TRACKING);
  await scanInput.press('Enter');

  // The Phase-0 rung resolves from the cached triage stub and must fire the
  // unbox-open touch-scan (server-side stamp; door stamps stay triage-only).
  await expect
    .poll(() => touchScanBodies.filter((b) => b.intakeSurface === 'unbox').length, {
      timeout: 10_000,
    })
    .toBeGreaterThan(0);
  expect(touchScanBodies.find((b) => b.intakeSurface === 'unbox')).toMatchObject({
    receiving_id: RECEIVING_ID,
    intakeSurface: 'unbox',
  });

  // ── Soft return: the carton must be gone from Arrival immediately ───────
  await clickReceivingMode(page, 'Arrival');
  await page.waitForURL('**/triage**');
  await expect(page.locator('aside').getByText('Unfound PO')).toHaveCount(0, {
    timeout: 5_000,
  });

  // No hard reload happened — the purge fixed the cache, not a page load.
  const probe = await page.evaluate(
    () => (window as unknown as { __cf_spec_probe?: string }).__cf_spec_probe,
  );
  expect(probe).toBe('alive');
});
