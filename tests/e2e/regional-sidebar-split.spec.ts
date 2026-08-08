import { test, expect } from '@playwright/test';

/**
 * Regional sidebar split — floor simulation.
 *
 * Directive: `docs/todo/regional-sidebar-split-HANDOFF.md`. The two receiving
 * operator jobs must stay physically separate:
 *   - `/incoming` (Workbench ops-queue) — the left rail hosts the durable
 *     **Saved Views** list (`SavedViewsList` → `<section aria-label="Saved views">`).
 *   - `/unbox` scan station (act-and-clear) — the periphery is MRU / scan bar,
 *     with **no** saved-views rail.
 *
 * Shape-based + data-independent: `SavedViewsList` renders its section (with a
 * teaching empty state) whether or not any views are saved, so this asserts the
 * regional contract, not a seeded count. Runs on the QA org (`qa-desktop`), never
 * the dogfood tenant — `.claude/rules/verify.md`.
 */
const SAVED_VIEWS = 'section[aria-label="Saved views"]';

test.describe('Regional sidebar split (scan periphery ≠ saved-views rail)', () => {
  test('/incoming — the Workbench rail hosts the Saved Views list', async ({ page }) => {
    await page.goto('/incoming');
    // Surface loaded (the incoming feed fires on mount).
    await page
      .waitForRequest(
        (r) => /\/api\/receiving-lines(\?|$)/.test(r.url()) && r.method() === 'GET',
        { timeout: 20_000 },
      )
      .catch(() => {});

    await expect(page.locator(SAVED_VIEWS)).toBeVisible({ timeout: 20_000 });
  });

  test('/unbox — the scan station periphery hosts NO saved-views rail', async ({ page }) => {
    await page.goto('/unbox');
    // Let the scan periphery + recents rail settle before the negative assertion.
    await page.waitForTimeout(1500);
    await expect(page.locator(SAVED_VIEWS)).toHaveCount(0);
  });
});
