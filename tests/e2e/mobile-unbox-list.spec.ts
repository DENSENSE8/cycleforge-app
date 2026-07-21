import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Mobile unbox list display guard — `/m/receiving` (and the <768px desktop
 * fallback) render {@link MobileReceivingList}, which must show the EXACT same
 * list as the desktop Unbox "Unboxed" rail: `view=unbox_opened` (first
 * Unbox-open axis, server-sorted, all-staff). See
 * docs/todo/unbox-triage-mode-separation-handoff.md — the old
 * `view=activity&sort=unboxed_newest` query is the retired axis; asserting it
 * here is exactly the contract drift this spec exists to catch.
 *
 * Guards two regressions:
 *  - the feed silently using a different `view` than the desktop Unboxed rail, and
 *  - the feed rendering "No packages yet" when the rail has rows.
 *
 * Auth comes from the saved storageState (tests/.auth/admin.json) via
 * global-setup, so request.* / page.* run as the admin staff.
 */

const FEED_PARAMS = 'view=unbox_opened&include=serials';

async function unboxRailRows(request: APIRequestContext) {
  const res = await request.get(`/api/receiving-lines?limit=100&offset=0&${FEED_PARAMS}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  return (body.receiving_lines ?? body.rows ?? []) as any[];
}

test.describe('mobile unbox list mirrors the desktop unbox-mode rail', () => {
  test('API: the unbox-rail query returns rows to display', async ({ request }) => {
    const rows = await unboxRailRows(request);
    test.skip(rows.length === 0, 'no unbox-opened receiving lines in this environment');
    expect(rows.length).toBeGreaterThan(0);
    console.log(`[mobile-unbox] unbox-rail (view=unbox_opened) rows=${rows.length}`);
  });

  test('UI: /m/receiving requests the unbox-rail query and renders rows', async ({ page }) => {
    test.skip(test.info().project.name !== 'mobile', 'mobile-only');

    // The feed must hit the SAME view as the desktop Unboxed rail — the
    // first-open axis, never the retired activity/unboxed_newest query.
    const feedReq = page.waitForResponse(
      (r) =>
        r.url().includes('/api/receiving-lines') && r.url().includes('view=unbox_opened'),
      { timeout: 20_000 },
    );

    await page.goto('/m/receiving');

    const res = await feedReq;
    expect(res.status()).toBe(200);
    const body = await res.json();
    const rows: any[] = body.receiving_lines ?? body.rows ?? [];

    test.skip(rows.length === 0, 'no unboxed receiving lines in this environment');

    // With data present, the empty state must NOT show (MobileFeed renders the
    // empty branch only when rows===0 && !isLoading — so any stale/failed fetch
    // would surface here).
    await expect
      .poll(async () => page.getByText(/No packages yet/i).count(), { timeout: 10_000 })
      .toBe(0);
  });
});
