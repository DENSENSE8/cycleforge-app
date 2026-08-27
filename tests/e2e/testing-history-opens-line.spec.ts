import { test, expect } from '@playwright/test';

/**
 * The Testing workbench browse splits the two action planes — row body opens
 * the line in `TestingPanel`, select gutter owns bulk — on all three tabs.
 *
 * Same defect family as `/incoming`, `/receiving/history` and `/unbox`
 * (`docs/todo/collection-click-planes-HANDOFF.md` §1), and the last surface
 * carrying it: `useTechTestingSelection` pins `selectMode` ON for the whole
 * browse (`browseActive`), and `TestingHistoryList` kept a PRIVATE copy of the
 * pre-split `useReceivingRowSelection` whose `handleSelect` early-returned into
 * the bulk toggle whenever select mode was on. Always-on select therefore meant
 * never-open.
 *
 * Measured on dogfood before the fix (`/test?view=testing&testTab=history`,
 * 5 rows this week / 20 at `weekOffset=3`): every row announced
 * `role="checkbox"`, carried ZERO gutter checkboxes, and a click emitted zero
 * `receiving-select-line` events — so `TestingLineWorkspace`, whose only job is
 * to listen for that event, could not open a line by pointer at all. The scan
 * path worked; the click path never had.
 *
 * The recents rule is the other half. Testing shares the receiving selection
 * BUS but not its record surface — no `ReceivingLineWorkspace` mounts here — so
 * opening a tested line must never stamp `receiving_line_views`, which is the
 * Unbox operator's own Recent feed. QC recents stamp
 * `/api/testing/receiving-lines/open` instead.
 *
 * Run against the QA org (`.claude/rules/verify.md`):
 *   npx playwright test tests/e2e/testing-history-opens-line.spec.ts --project=qa-desktop
 */

/** `?testTab=` — absent is Returns. Pending is the QA-seeded needs-test feed. */
const TABS = [
  { name: 'Pending', url: '/test?view=testing&testTab=pending' },
  { name: 'Returns', url: '/test?view=testing' },
  { name: 'History', url: '/test?view=testing&testTab=history' },
] as const;

const ROWS = '[data-line-row-id]';

/** The browse pane is hidden + inert while `TestingPanel` covers it. */
async function panelIsOpen(page: import('@playwright/test').Page) {
  return !(await page.getByTestId('testing-grid-body').isVisible());
}

test.describe('Testing browse — click opens the line, the gutter selects', () => {
  test.skip(({ isMobile }) => !!isMobile, 'the Testing workbench is a desktop layout');

  for (const tab of TABS) {
    test(`${tab.name}: a row click opens the panel and stamps NO receiving view`, async ({
      page,
    }) => {
      const viewWrites: string[] = [];
      page.on('request', (r) => {
        if (r.method() === 'POST' && r.url().includes('/api/receiving-lines/view')) {
          viewWrites.push(r.url());
        }
      });

      await page.goto(tab.url, { waitUntil: 'domcontentloaded' });
      const rows = page.locator(ROWS);
      // Wait for the FIRST row, then decide — `count()` does not auto-wait, and
      // reading it straight after the fetch is what made sibling specs skip on
      // tenants that demonstrably had rows.
      const hasRows = await rows
        .first()
        .waitFor({ state: 'visible', timeout: 40_000 })
        .then(() => true)
        .catch(() => false);
      if (!hasRows) test.skip(true, `no ${tab.name} rows on this tenant`);

      // The body is the record plane — it announces as a button, and the
      // checkbox role lives in the gutter where the affordance actually is.
      await expect(rows.first()).toHaveAttribute('role', 'button');
      await expect(rows.first().getByRole('checkbox')).toHaveCount(1);

      await rows.first().click();
      await expect.poll(() => panelIsOpen(page), { timeout: 15_000 }).toBe(true);

      // Testing opens in place on its own station — never a navigation.
      expect(new URL(page.url()).pathname).toBe('/test');
      // Browsing a tested-unit ledger is not opening a carton for work.
      expect(viewWrites).toEqual([]);
    });
  }

  test('the gutter checkbox does bulk WITHOUT opening a line', async ({ page }) => {
    await page.goto('/test?view=testing&testTab=pending', { waitUntil: 'domcontentloaded' });
    const rows = page.locator(ROWS);
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 40_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no Testing rows on this tenant');

    const box = rows.first().getByRole('checkbox').first();
    await expect(box).toHaveAttribute('aria-checked', 'false');

    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'true');
    // The gutter never opens: the browse stays on screen.
    await expect(page.getByTestId('testing-grid-body')).toBeVisible();

    await box.click();
    await expect(box).toHaveAttribute('aria-checked', 'false');
  });
});
