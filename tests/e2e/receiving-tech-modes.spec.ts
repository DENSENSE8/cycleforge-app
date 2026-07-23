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

    // The split pane's <aside role="complementary"> is always rendered; it is
    // the stable chrome anchor regardless of rail data. Wait for it to appear
    // after the BootGate clears.
    const aside = page.getByRole('complementary');
    await expect(aside).toBeVisible({ timeout: BOOT_TIMEOUT });

    // No Next.js error overlay or app error boundary should be present.
    await expect(page.locator('#__next-error-overlay, [data-nextjs-error]')).toHaveCount(0);
    await expect(page.getByText('Application error')).toHaveCount(0);

    // The unbox workbench tabs (WorkbenchChromeHeader, button pills) expose
    // History (default) · Queue · Viewed in the right pane; the Unboxed list is
    // the SIDEBAR rail only (unbox-workspace-state.ts is the tab SoT).
    // "Viewed" is the per-staff recents feed (receiving_line_views).
    const workbench = page.locator('main');
    await expect(workbench.getByRole('button', { name: /^Queue\b/ }).first()).toBeVisible({
      timeout: PANEL_TIMEOUT,
    });
    await expect(workbench.getByRole('button', { name: /^History\b/ }).first()).toBeVisible({
      timeout: PANEL_TIMEOUT,
    });
    const viewedPill = workbench.getByRole('button', { name: /^Viewed\b/ }).first();
    await expect(viewedPill).toBeVisible({ timeout: PANEL_TIMEOUT });

    // The Unboxed rail lives in the sidebar (mode-scoped; see
    // unbox-rail-order.spec.ts for its full contract).
    await expect(aside.locator('ul[aria-label="Unboxed activity"]')).toBeAttached({
      timeout: PANEL_TIMEOUT,
    });

    // Switching to "Viewed" deep-links ?unboxview=viewed (the recents feed).
    await viewedPill.click();
    await expect(page).toHaveURL(/unboxview=viewed/, { timeout: PANEL_TIMEOUT });

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

    const aside = page.getByRole('complementary');
    await expect(aside).toBeVisible({ timeout: BOOT_TIMEOUT });

    await expect(page.locator('#__next-error-overlay, [data-nextjs-error]')).toHaveCount(0);
    await expect(page.getByText('Application error')).toHaveCount(0);

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

    // Testing mode lands on the workbench browse (no cold restore) — the
    // WorkbenchChromeHeader tabs Returns (default) · Pending · History
    // (testing-workspace-state.ts is the tab SoT).
    const workbench = page.locator('main');
    await expect(workbench.getByRole('button', { name: /^Returns\b/ }).first()).toBeVisible({
      timeout: PANEL_TIMEOUT,
    });
    await expect(workbench.getByRole('button', { name: /^History\b/ }).first()).toBeVisible({
      timeout: PANEL_TIMEOUT,
    });

    // Try to open the first item in the testing rail (real rail rows only —
    // the aside also hosts scan-arm / nav chrome buttons that must not count).
    const railRows = aside.locator('[data-rail-row]');
    const railCount = await railRows.count();

    if (railCount === 0) {
      console.log('[testing] No testing rail items found — skipping right-pane panel assertions.');
      return;
    }

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

    await expect(page.locator('#__next-error-overlay, [data-nextjs-error]')).toHaveCount(0);
    await expect(
      page.locator('main').getByRole('button', { name: /^Returns\b/ }).first(),
    ).toBeVisible({ timeout: PANEL_TIMEOUT });

    // Open the line via the same event the history list / rail use (deterministic;
    // avoids flaky clicks on virtualized rows).
    await page.evaluate((row) => {
      window.dispatchEvent(new CustomEvent('receiving-select-line', { detail: row }));
    }, line);

    // The testing toolbar only exists inside a mounted TestingPanel.
    await expect(
      page
        .getByRole('button', { name: 'Open SKU pairing' })
        .or(page.getByRole('button', { name: 'View audit log' }))
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

    await expect(aside.getByText(/^History\b/i)).toBeVisible({ timeout: PANEL_TIMEOUT });

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
