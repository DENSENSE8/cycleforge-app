/**
 * Smoke tests for the three workspace mode displays that were refactored to
 * share components as part of the mode-first architecture:
 *
 *   1. Unbox mode  (/unbox)                  — LineEditPanel, Receive bar
 *   2. Triage mode (/triage)                 — LineEditPanel, Save for unbox button
 *   3. Testing mode (/test?view=testing)     — TestingPanel (shared CartonContextCard
 *                                              + LineEditToolbar) + Pass · … action
 *
 * These tests guard against regressions where the shared LineEditToolbar /
 * CartonContextCard composition breaks silently in any of the three modes.
 *
 * Auth is reused from the saved session in tests/.auth/admin.json (minted by
 * global-setup.ts). No credentials are inlined here.
 *
 * Data-resilience contract: the left rail may be empty in the test environment.
 * Each test asserts route-level chrome unconditionally; right-pane assertions
 * are gated on whether a rail item is present, so the suite is green against
 * an empty DB and still exercises the panel when data exists.
 */

import { test, expect } from '@playwright/test';

// Desktop workspace smoke tests — phone layouts route these pages to /m/*
// (MOBILE_ALLOWED_PREFIXES), so the desktop chrome under test never mounts there.
test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only');

// How long to wait for the BootGate / sign-in splash to clear and the initial
// data fetch to land. The global timeout is 60 s; this is just the per-expect
// wait on the first always-present chrome element.
const BOOT_TIMEOUT = 20_000;

// After clicking a rail item, give the right-pane panel time to mount + fetch
// its data before asserting inner chrome.
const PANEL_TIMEOUT = 15_000;

test.use({ storageState: 'tests/.auth/admin.json' });

test.describe('Receiving + Tech workspace mode smoke tests', () => {
  // ── 1. UNBOX MODE (/receiving) ────────────────────────────────────────────
  test('unbox mode — page loads and right pane shows Receive bar when a line is present', async ({
    page,
  }) => {
    await page.goto('/unbox');

    // The split pane's <aside> is always rendered; it is the stable chrome
    // anchor regardless of rail data. Located by TAG, not by
    // `role="complementary"` — the rails stopped carrying that role, and an
    // implicit role is not a contract a spec can lean on.
    const aside = page.locator('aside').first();
    await expect(aside).toBeVisible({ timeout: BOOT_TIMEOUT });

    // No Next.js error overlay or app error boundary should be present.
    await expect(page.locator('#__next-error-overlay, [data-nextjs-error]')).toHaveCount(0);
    await expect(page.getByText('Application error')).toHaveCount(0);

    // The desk's tab strip is footed by `DataTable`, so its tabs carry the
    // house `data-table-tab-<id>` testids rather than being loose buttons.
    // Queue is deliberately ABSENT: it is the default body, and a default has
    // no tab — the same rule that keeps an "All" tab off every other strip.
    //
    // Attached, not visible: the desk pane goes `visibility: hidden` while a
    // carton overlay owns the middle, and this station legitimately restores a
    // carton on load. Asserting visibility would make route-level chrome —
    // which the file's own contract says is unconditional — depend on whether
    // the fixture happens to have a carton open.
    for (const id of ['incoming', 'recent', 'history']) {
      await expect(page.getByTestId(`data-table-tab-${id}`)).toBeAttached({
        timeout: PANEL_TIMEOUT,
      });
    }
    // The recents tab reads "Recent" (house vocabulary, `unbox-workspace-state.ts`);
    // `viewed` survives only as the WIRE value, because that is the server's
    // name for the feed (`view=viewed` / `receiving_line_views`).
    const recentPill = page.getByTestId('data-table-tab-recent');

    // The Unboxed rail lives in the sidebar (mode-scoped; see
    // unbox-rail-order.spec.ts for its full contract). Unscoped: the desk
    // mounts more than one <aside>, so anchoring this to `.first()` would
    // assert against whichever one happens to lead.
    await expect(page.locator('ul[aria-label="Unboxed activity"]')).toBeAttached({
      timeout: PANEL_TIMEOUT,
    });

    // The Recent tab and `?unboxview=viewed` are the same state.
    //
    // Asserted by NAVIGATING rather than by clicking: the strip sits in the
    // desk pane, which a restored carton hides, and a click that cannot land is
    // a flake rather than a finding. Driving the URL and reading the lit tab
    // back tests the contract in the direction that actually matters — a
    // bookmark has to reproduce the view — and it works whether or not an
    // overlay is up.
    await page.goto('/unbox?unboxview=viewed');
    await expect(recentPill).toHaveAttribute('aria-selected', 'true', {
      timeout: PANEL_TIMEOUT,
    });

    // Browse-first: open a line from the sidebar Unboxed rail when rows exist.
    const firstRow = aside.getByRole('option').first();
    const hasRow = await firstRow
      .waitFor({ state: 'visible', timeout: PANEL_TIMEOUT })
      .then(() => true)
      .catch(() => false);

    if (!hasRow) {
      console.log('[unbox] No feed rows — route chrome + pills asserted, skipping panel.');
      return;
    }

    await firstRow.click();

    // Shared LineEditToolbar mounts after a row click.
    const auditBtn = page.getByRole('button', { name: 'View audit log' });
    const opened = await auditBtn
      .first()
      .waitFor({ state: 'visible', timeout: PANEL_TIMEOUT })
      .then(() => true)
      .catch(() => false);

    if (!opened) {
      console.log('[unbox] Row click did not open panel — chrome asserted, skipping panel.');
      return;
    }

    // CartonContextCard Platform pill + the unbox terminal action.
    await expect(page.getByRole('button', { name: /Platform/i }).first()).toBeVisible({ timeout: PANEL_TIMEOUT });
    await expect(
      page.getByRole('button', { name: /^Receive(\s+all)?$|^Receive locally$/i }),
    ).toBeVisible({ timeout: PANEL_TIMEOUT });

    // Tab-aware terminal dock: Inventory notes replaces Print · Receive with
    // Save to inventory, and the in-card footer row is gone.
    const inventoryNotesTab = page.getByRole('tab', { name: /Inventory notes/i });
    const hasPoNoteTab = await inventoryNotesTab
      .first()
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false);

    if (hasPoNoteTab) {
      await inventoryNotesTab.first().click();
      await expect(
        page.getByRole('button', { name: /Save to inventory|Saving/i }),
      ).toBeVisible({ timeout: PANEL_TIMEOUT });
      // Mode-default receive CTA is replaced (not stacked) on this tab.
      await expect(
        page.getByRole('button', { name: /^Receive(\s+all)?$|^Receive locally$/i }),
      ).toHaveCount(0);
      // Inline card footer removed — Sync lives in the dock split menu, not in-card.
      await expect(
        page.getByRole('button', { name: /Sync from inventory/i }),
      ).toHaveCount(0);
    } else {
      console.log('[unbox] No Inventory notes tab (unfound/unmatched carton) — dock swap skipped.');
    }
  });

  // ── 2. TRIAGE MODE (/triage) ──────────────────────────────────────────────
  test('triage mode — page loads and right pane shows Save for unbox button when a line is present', async ({
    page,
  }) => {
    await page.goto('/triage');

    // Tag, not `role="complementary"` — see the unbox test.
    const aside = page.locator('aside').first();
    await expect(aside).toBeVisible({ timeout: BOOT_TIMEOUT });

    await expect(page.locator('#__next-error-overlay, [data-nextjs-error]')).toHaveCount(0);
    await expect(page.getByText('Application error')).toHaveCount(0);

    // Triage's own strip — Prioritize · Unfound · Done (`triage-workspace-state.ts`).
    // Attached rather than visible, for the reason the unbox test gives.
    for (const id of ['found', 'unfound', 'done']) {
      await expect(page.getByTestId(`data-table-tab-${id}`)).toBeAttached({
        timeout: PANEL_TIMEOUT,
      });
    }

    // Triage auto-selects its top line too, so the panel mounts without a click.
    // Best-effort: assert the triage-only terminal action when a line is present.
    const auditBtn = page.getByRole('button', { name: 'View audit log' });
    const opened = await auditBtn
      .first()
      .waitFor({ state: 'visible', timeout: PANEL_TIMEOUT })
      .then(() => true)
      .catch(() => false);

    if (!opened) {
      console.log('[triage] No line auto-opened — route chrome asserted, skipping panel.');
      return;
    }

    // Triage's terminal action: "Save for unbox" SlicedActionDock (caps.saveBar)…
    await expect(
      page.getByRole('button', { name: /Save for unbox/i }),
    ).toBeVisible({ timeout: PANEL_TIMEOUT });

    // …and the unbox-only Receive action bar must be ABSENT in triage.
    await expect(
      page.getByRole('button', { name: /^Receive(\s+all)?$/i }),
    ).toHaveCount(0);
  });

  // ── 3. TESTING MODE (/test?view=testing) ─────────────────────────────────
  test('testing mode — page loads onto history browse; toolbar + Pass appear when a line is open', async ({
    page,
  }) => {
    await page.goto('/test?view=testing');

    // The DashboardSidebar wraps TechSidebarPanel — it renders an <aside> for
    // the left rail on desktop. Wait for any aside to appear.
    const aside = page.locator('aside').first();
    await expect(aside).toBeVisible({ timeout: BOOT_TIMEOUT });

    await expect(page.locator('#__next-error-overlay, [data-nextjs-error]')).toHaveCount(0);
    await expect(page.getByText('Application error')).toHaveCount(0);

    // Testing mode lands on the desk's browse body (no cold restore).
    // `History` is the only TAB: Returns is the default body and All was
    // dropped with the rest of the display layer, and neither a default nor an
    // "all" gets a control (`testing-workspace-state.ts` is the tab SoT).
    await expect(page.getByTestId('data-table-tab-history')).toBeVisible({
      timeout: PANEL_TIMEOUT,
    });
    await expect(page.getByTestId('data-table-tab-all')).toHaveCount(0);

    /*
      ── The testing record plane is not reachable from here any more ─────────

      This half asserted a `TestingPanel` (LineEditToolbar icons · "Back to all
      tested lines" · classify pills · the Pass · Print dock) opened by clicking
      the first row of "the testing rail". Measured 2026-08-30 against a built
      lane, none of that holds:

        • `/test?view=testing` mounts ONE <aside>, and it is the nav spine. It
          contains zero `[data-rail-row]`. The single rail row on the page sits
          outside every aside, so the `aside`-scoped lookup below returned 0 and
          this test took its "no rail items" early return — it has been passing
          WITHOUT running any of the panel assertions. A guard that silently
          skips is worse than one that fails: it reports coverage it never had.
        • That rail row is a station SCAN row (`data-rail-key="stn:1ZY…"`).
          Clicking it opens a receiving/PO record — Back to list · Link PO ·
          Open Amazon listing — not a testing line.
        • The History tab's own grid (`testing-grid-body`) had no rows to open.

      So the entry point moved and I could not establish where to. Marked fixme
      rather than re-pointed at whatever happens to render: rewriting the
      assertions to match the PO panel would pin the wrong surface, and deleting
      them would drop the Pass · Print terminal action from coverage entirely
      with nothing recording that it went. The route-level chrome above is real
      and still runs.
    */
    test.fixme(true, 'testing record plane: no known path from this desk to a testing line');

    const railRows = aside.locator('[data-rail-row]');
    await railRows.first().click();

    // The testing toolbar (LineEditToolbar mode="testing") mounts with the panel.
    const auditBtn = page.getByRole('button', { name: 'View audit log' });
    const pairBtn = page.getByRole('button', { name: 'Open SKU pairing' });
    const copyBtn = page.getByRole('button', { name: 'Copy all testing details' });
    const anyToolbarIcon = auditBtn.or(pairBtn).or(copyBtn);
    await expect(anyToolbarIcon.first()).toBeVisible({ timeout: PANEL_TIMEOUT });

    // Back-to-browse affordance on the testing toolbar.
    await expect(
      page.getByRole('button', { name: 'Back to all tested lines' }),
    ).toBeVisible({ timeout: PANEL_TIMEOUT });

    // Shared station entity-context bookmark chrome — classify pills always on
    // (hide/show toggle removed); the old standalone Platform pill is retired.
    await expect(
      page.getByTestId('carton-context-classify-pills'),
    ).toBeVisible({ timeout: PANEL_TIMEOUT });

    // The Pass · Print SlicedActionDock — the testing terminal action.
    const passBtn = page.getByRole('button', { name: /^Pass\s*[·•]|^Printing/i });
    await expect(passBtn).toBeVisible({ timeout: PANEL_TIMEOUT });
  });

  // ── 4. TESTING MODE — deterministic deep check of the rewrite ──────────────
  // Fetches a REAL testing line, clicks it from the history browse (or via
  // receiving-select-line), then asserts the rewritten panel composes the
  // SHARED CartonContextCard (Platform pill) + the Pass · Print StickyActionBar.
  test('testing mode — opening a history line renders the rewritten TestingPanel chrome', async ({
    page,
    request,
  }) => {
    // Authed by the same storageState (the request fixture carries the cookie).
    const res = await request.get('/api/testing/receiving-lines?view=testing&limit=1');
    const data = await res.json().catch(() => ({}));
    const line = (data.receiving_lines || [])[0];
    test.skip(!line || line.receiving_id == null, 'no openable testing line in this environment');

    await page.goto('/test?view=testing');

    // Boot gate FIRST, the way the smoke test above does it. Asserting desk
    // chrome straight off `goto` measures the BootGate, not the desk: this test
    // passed in a full-file run (warm) and failed run alone (cold), which is the
    // signature of a missing wait rather than a missing control.
    const aside = page.locator('aside').first();
    await expect(aside).toBeVisible({ timeout: BOOT_TIMEOUT });

    await expect(page.locator('#__next-error-overlay, [data-nextjs-error]')).toHaveCount(0);
    // `History` is the desk's only tab — Returns is the default body. See the
    // previous test for why that is not a missing control.
    await expect(page.getByTestId('data-table-tab-history')).toBeAttached({
      timeout: PANEL_TIMEOUT,
    });

    /*
      Same gap as the test above — see its note for the measurements.

      This one is the sharper evidence: the API fetch at the top PROVES an
      openable testing line exists, so an empty environment cannot explain it.
      The line is there and the desk offers no way in. It used to dispatch
      `receiving-select-line`, which still exists but no longer opens this panel
      (`useReceivingDetailOverlays` gates that listener on Incoming mode, and
      `TestingSidebarPanel` uses it to track its rail's own selection), so the
      dispatch quietly did nothing and every assertion below read as a panel
      that had stopped composing.
    */
    test.fixme(true, 'testing record plane: a real line exists and no entry point opens it');

    const railRows = aside.locator('[data-rail-row]');
    await railRows.first().click();

    // The testing toolbar only exists inside a mounted TestingPanel, so ANY of
    // its icons is the "panel mounted" gate. Which ones render is per-line —
    // SKU pairing needs something to pair — so naming a subset made this assert
    // the fixture rather than the panel. Same three-way check as the smoke test
    // above, on purpose: one definition of "the toolbar is up".
    await expect(
      page
        .getByRole('button', { name: 'Open SKU pairing' })
        .or(page.getByRole('button', { name: 'View audit log' }))
        .or(page.getByRole('button', { name: 'Copy all testing details' }))
        .first(),
    ).toBeVisible({ timeout: PANEL_TIMEOUT });

    // Shared station entity-context bookmark chrome (CartonContextCard
    // density="bar") — classify pills prove testing reuses receiving's
    // condensed identity header (the old standalone Platform pill is retired).
    await expect(
      page.getByTestId('carton-context-classify-pills'),
    ).toBeVisible({ timeout: PANEL_TIMEOUT });

    // SectionTabsSlider — unbox-style display switcher under the carton header.
    await expect(
      page.getByRole('tablist', { name: 'Testing displays' }),
    ).toBeVisible({ timeout: PANEL_TIMEOUT });
    await expect(page.getByRole('tab', { name: 'Testing' })).toBeVisible({ timeout: PANEL_TIMEOUT });
    await expect(page.getByRole('tab', { name: 'SKU Pairing' })).toBeVisible({ timeout: PANEL_TIMEOUT });
    await expect(page.getByRole('tab', { name: 'Ticket' })).toBeVisible({ timeout: PANEL_TIMEOUT });
    await expect(page.getByRole('tab', { name: 'Timeline' })).toBeVisible({ timeout: PANEL_TIMEOUT });

    // The Pass · Print SlicedActionDock — the testing terminal action.
    await expect(
      page.getByRole('button', { name: /^Pass\s*[·•]|^Printing/i }),
    ).toBeVisible({ timeout: PANEL_TIMEOUT });
  });

  // ── 5. SHIPPING MODE (/test default) — History rail aligned with History tab ─
  test('shipping mode — History rail is present; stays off testing view', async ({
    page,
  }) => {
    await page.goto('/test');

    const aside = page.locator('aside').first();
    await expect(aside).toBeVisible({ timeout: BOOT_TIMEOUT });
    await expect(page.locator('#__next-error-overlay, [data-nextjs-error]')).toHaveCount(0);

    await expect(page).not.toHaveURL(/view=testing/);

    // History is a TAB on the desk's status strip now, not a heading inside the
    // rail. Same readout, different altitude — asserting it in the aside was
    // pinning where the old band happened to draw it.
    await expect(page.getByTestId('data-table-tab-history')).toBeVisible({
      timeout: PANEL_TIMEOUT,
    });

    const railRows = aside.locator('[data-rail-row]');
    const count = await railRows.count();
    if (count === 0) {
      console.log('[shipping] No history rail rows — skipping preview assert.');
      return;
    }
    await railRows.first().click();
    await expect(page).not.toHaveURL(/view=testing/);
  });
});
