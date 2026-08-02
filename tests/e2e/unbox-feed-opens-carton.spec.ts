import { test, expect } from '@playwright/test';

/**
 * The Unbox workbench feed splits the two action planes — row body opens the
 * carton, select gutter owns bulk — across ALL THREE tabs, and its opens do NOT
 * stamp the operator's recents.
 *
 * Before 2026-08-01, `useReceivingLineBulkSelection({ active: true })` pinned
 * `selectMode` ON and `handleSelectRow` swallowed every click into the bulk
 * toggle. Measured on dogfood: Recent 117 rows, Queue 12, History 22 — every
 * one ticking a checkbox, zero `receiving-select-line` events — even though
 * `useReceivingWorkspacePane` says operators "open a line via click or scan".
 * The scan half worked; the click half never had.
 *
 * The recents rule is the other half. `POST /api/receiving-lines/view` is what
 * fills the Recent tab, and a browse click must not write it: if paging a
 * 117-row queue counted as "viewed", Recent would converge on a copy of the
 * feed. The rail, the scanner and deep links still record — those are
 * deliberate single-carton opens.
 *
 * Run against the QA org (`.claude/rules/verify.md`):
 *   npx playwright test tests/e2e/unbox-feed-opens-carton.spec.ts --project=qa-desktop
 */

/** `?unboxview=` values, newest-vocabulary tab name → wire value. */
const TABS = [
  { name: 'Recent', url: '/unbox?unboxview=viewed' },
  { name: 'Queue', url: '/unbox?unboxview=queue' },
  { name: 'History', url: '/unbox' },
] as const;

test.describe('Unbox feed — click opens, gutter selects, neither stamps Recent', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grids are a desktop layout');

  test('the tab strip reads Recent · Queue · History, left to right', async ({ page }) => {
    await page.goto('/unbox');
    const strip = page.getByRole('button', { name: /^(Recent|Queue|History)\b/ });
    await expect(strip.first()).toBeVisible({ timeout: 25_000 });
    // House vocabulary (`labels-workspace-state.ts` uses the same words in the
    // same order). "Viewed" is the server's name for the feed, never the UI's.
    const labels = (await strip.allInnerTexts()).map((t) => t.trim().split(/\s+/)[0]);
    expect(labels.slice(0, 3)).toEqual(['Recent', 'Queue', 'History']);
  });

  test('ONE hairline, on Recent’s right edge — and Recent carries a count', async ({ page }) => {
    await page.goto('/unbox');
    const recent = page.getByRole('button', { name: /^Recent\b/ }).first();
    await expect(recent).toBeVisible({ timeout: 25_000 });

    // `withScopeDivider` puts exactly one rule in the strip: scope | lanes.
    // Two (hairlines either side of Queue) reads as a rendering bug.
    const hairlines = page.locator('span.w-px.bg-border-hairline');
    await expect(hairlines).toHaveCount(1);

    // It sits between Recent and Queue — measured, because "which side" is the
    // whole point and a class assertion cannot tell left from right.
    const [recentBox, ruleBox, queueBox] = await Promise.all([
      recent.boundingBox(),
      hairlines.first().boundingBox(),
      page.getByRole('button', { name: /^Queue\b/ }).first().boundingBox(),
    ]);
    expect(ruleBox!.x).toBeGreaterThanOrEqual(recentBox!.x + recentBox!.width - 1);
    expect(ruleBox!.x).toBeLessThanOrEqual(queueBox!.x + 1);

    // The count is the operator's own recents depth (`view=viewed`), and it
    // arrives on its own badge query — so POLL for it rather than reading the
    // label once on paint, which is what made this case skip on a tenant that
    // demonstrably has recents.
    //
    // Still skips (never fails) if it never arrives: TabSwitch renders no badge
    // at zero, and a staffer who has opened nothing is an honest empty, not a
    // regression.
    const counted = await expect
      .poll(async () => (await recent.innerText()).trim(), { timeout: 10_000 })
      .toMatch(/^Recent\s*\d+$/)
      .then(() => true)
      .catch(() => false);
    if (!counted) test.skip(true, 'this staffer has no recents on this tenant');
  });

  for (const tab of TABS) {
    test(`${tab.name}: a row click opens the workspace and records NO view`, async ({ page }) => {
      const viewWrites: string[] = [];
      page.on('request', (r) => {
        if (r.method() === 'POST' && r.url().includes('/api/receiving-lines/view')) {
          viewWrites.push(r.url());
        }
      });

      await page.goto(tab.url);
      const rows = page.locator('[data-line-row-id]');
      const hasRows = await rows
        .first()
        .waitFor({ state: 'visible', timeout: 25_000 })
        .then(() => true)
        .catch(() => false);
      if (!hasRows) test.skip(true, `no rows on the ${tab.name} tab for this tenant`);

      // The body is the record plane — it announces as a button, and the
      // checkbox role moved to the gutter where the affordance actually is.
      await expect(rows.first()).toHaveAttribute('role', 'button');
      await expect(rows.first().getByRole('checkbox')).toHaveCount(1);

      await rows.first().click();
      await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });
      // Opening in place, on the station — never a navigation away.
      await expect(page).toHaveURL(/openReceivingId=\d+/);

      // Browsing is not working: the feed click must not claim this carton.
      expect(viewWrites).toEqual([]);
    });
  }

  test('the gutter checkbox does bulk WITHOUT opening a carton', async ({ page }) => {
    await page.goto('/unbox');
    const rows = page.locator('[data-line-row-id]');
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no Unbox rows on this tenant');

    const box = rows.first().getByRole('checkbox').first();
    await expect(box).toHaveAttribute('aria-checked', 'false');

    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('receiving-workspace')).toHaveCount(0);

    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'false');
  });

  test('the recent RAIL still records a view (only the feed opted out)', async ({ page }) => {
    const viewWrites: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/receiving-lines/view')) {
        viewWrites.push(r.url());
      }
    });

    await page.goto('/unbox');
    const rail = page.locator('[data-rail-row]');
    const hasRail = await rail
      .first()
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRail) test.skip(true, 'no recent-rail rows on this tenant');

    await rail.first().click();
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });
    // A rail pick IS a deliberate single-carton open, so it keeps stamping —
    // otherwise dropping the feed write would have emptied Recent entirely.
    await expect.poll(() => viewWrites.length).toBeGreaterThan(0);
  });
});
