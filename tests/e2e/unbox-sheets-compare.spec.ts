import { test, expect } from '@playwright/test';

/**
 * Unbox Sheets compare chrome — layout toggle + host mount (QA org).
 *
 * **The chrome moved off Band 3 on 2026-08-08.** Compare panes + spreadsheet
 * zoom now live on the inspector's View topic cluster, which the Band 3
 * `Show inspector` toggle opens as a View-only shell when no carton is picked.
 * So every assertion here first opens the inspector, and every compare locator
 * is scoped to `history-triage-view-topics` — an unscoped locator would let a
 * Band-3 regression satisfy the spec from the wrong host, which is exactly the
 * drift the move exists to prevent.
 *
 * Route-mocked enough to assert chrome exists without depending on live rows.
 * Full paint/right-click prefs are covered by unit tests on the display SoT.
 */

const EMPTY_LINES = {
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({ items: [], total: 0 }),
};

test.describe('Unbox Sheets compare chrome', () => {
  test('split layout mounts the compare host', async ({ page }) => {
    await page.route('**/api/receiving-lines**', (route) => route.fulfill(EMPTY_LINES));

    await page.goto('/unbox?clayout=split&c0=queue&c1=history');
    await expect(page.getByTestId('unbox-compare-host')).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId('receiving-compare-pane-a')).toBeVisible();
    await expect(page.getByTestId('receiving-compare-pane-b')).toBeVisible();

    // Band 3 is the LEAN row — the compare chrome is NOT on it.
    await expect(page.getByTestId('unbox-compare-chrome')).toHaveCount(0);

    // …it is one click away, on the inspector View cluster.
    await page.getByTestId('unbox-history-inspector-toggle').click();
    const viewTopics = page.getByTestId('history-triage-view-topics');
    await expect(viewTopics).toBeVisible({ timeout: 15_000 });
    await expect(viewTopics.getByTestId('unbox-compare-chrome')).toBeVisible();
  });

  test('layout toggle can switch to quad from the inspector View cluster', async ({ page }) => {
    await page.route('**/api/receiving-lines**', (route) => route.fulfill(EMPTY_LINES));

    // Default tab (Queue) — the toggle is live on every sheet tab, not just History.
    await page.goto('/unbox');
    await page.getByTestId('unbox-history-inspector-toggle').click({ timeout: 30_000 });

    const viewTopics = page.getByTestId('history-triage-view-topics');
    await expect(viewTopics).toBeVisible({ timeout: 15_000 });
    await viewTopics
      .getByTestId('unbox-compare-layout-menu')
      .getByRole('button')
      .click();
    await page.getByRole('option', { name: '4 panes' }).click();
    await expect(page).toHaveURL(/clayout=quad/);
    await expect(page.getByTestId('unbox-compare-host')).toBeVisible();
  });
});
