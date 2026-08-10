import { test, expect, type Page } from '@playwright/test';
import { QA_FIXTURE_CUSTOM_FIELD } from '@/lib/tenancy/qa-org';

/**
 * Org custom columns are SORTABLE on the receiving family (Unbox History), end
 * to end.
 *
 * Before this shipped, a custom column rendered and could be hidden/shown, but
 * its header was inert: `isReceivingGridSortable` derives its key list from the
 * STATIC column model, and custom columns are merged in at runtime from
 * `custom_field_defs`, so a custom key could never appear in it. A column you
 * cannot order down its own track is barely a column.
 *
 * The header, the descriptor's `isSortable`, and `useUrlColumnSort`'s
 * `isColumn` guard all read that one predicate, which is why click-to-sort and
 * `?colsort=` durability are asserted together — a regression breaks both.
 *
 * **The fixture values are DECIMALS (2.25 / 2.5) on purpose.** That pair is the
 * only one that separates a real numeric compare from the string fallback:
 * `numeric: true` collation treats `.` as a separator and reads them as 5 vs
 * 25, inverting the order. Whole numbers pass either way — the unit suite
 * proved that by mutation, so the browser test uses the fixture that bites.
 *
 * Asserts on the CUSTOM CELL VALUES, never on product titles: the title track
 * renders the resolved CATALOG title, so both QA Bose fixtures read identically
 * and a title-based assertion cannot tell the 2.25 row from a blank one.
 *
 * Seed + run (never against the dogfood tenant — `.claude/rules/verify.md`):
 *   pnpm provision:qa-org
 *   npx playwright test tests/e2e/custom-column-sort.spec.ts --project=qa-desktop
 */

const COLUMN_KEY = QA_FIXTURE_CUSTOM_FIELD.columnKey;
const LOWER = String(QA_FIXTURE_CUSTOM_FIELD.lower.value); // '2.25'
const UPPER = String(QA_FIXTURE_CUSTOM_FIELD.upper.value); // '2.5'

/**
 * The custom column's header cell. The key's `:` needs no escaping — it sits
 * inside a QUOTED attribute value (`CSS.escape` is a browser global and is not
 * defined in the Playwright runner process).
 */
function header(page: Page) {
  return page.locator(`[role="columnheader"][data-col="${COLUMN_KEY}"]`);
}

/** Custom-cell text for every rendered row, in DOM order (`—` when blank). */
async function customCells(page: Page): Promise<string[]> {
  const cells = page.locator(`[data-line-row-id] [data-col="${COLUMN_KEY}"]`);
  await cells.first().waitFor({ state: 'visible', timeout: 25_000 });
  return (await cells.allInnerTexts()).map((t) => t.trim());
}

async function gotoHistory(page: Page) {
  await page.goto('/receiving/history');
  const rows = page.locator('[data-line-row-id]');
  const hasRows = await rows
    .first()
    .waitFor({ state: 'visible', timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
  if (!hasRows) test.skip(true, 'no History rows on this tenant — run pnpm provision:qa-org');
  // The grid swallows a click aimed at a header it has not finished hydrating,
  // so settle before driving it. Without this the first click is a no-op and
  // the sort appears one interaction late.
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect(header(page)).toBeVisible();
}

/**
 * Click the header until it reports `want`. Tolerates the hydration-swallowed
 * first click without hiding a genuinely inert header — an unresponsive header
 * exhausts the attempts and fails.
 */
async function sortTo(page: Page, want: 'ascending' | 'descending') {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await header(page).getAttribute('aria-sort')) === want) return;
    await header(page).click();
    await page
      .waitForFunction(
        ([key, target]) =>
          document
            .querySelector(`[role="columnheader"][data-col="${key}"]`)
            ?.getAttribute('aria-sort') === target,
        [COLUMN_KEY, want] as const,
        { timeout: 4_000 },
      )
      .catch(() => {});
  }
  await expect(header(page)).toHaveAttribute('aria-sort', want);
}

test.describe('org custom column — sortable on Unbox History', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grids are a desktop layout');

  test('the column renders from custom_field_defs + the staff opt-in', async ({ page }) => {
    await gotoHistory(page);

    // The whole read path: def → mergeCustomFieldColumns → `tier: 'optional'` →
    // the seeded `shown` delta → a real grid track carrying hydrated values.
    await expect(header(page)).toContainText(QA_FIXTURE_CUSTOM_FIELD.label);

    const cells = await customCells(page);
    expect(cells).toContain(LOWER);
    expect(cells).toContain(UPPER);
    // Honest absence, not a blank cell, for rows with no value.
    expect(cells).toContain('—');
  });

  test('its header is click-to-sort and orders DECIMALS by value', async ({ page }) => {
    await gotoHistory(page);
    await expect(header(page)).toHaveAttribute('aria-sort', 'none');

    await sortTo(page, 'ascending');
    await expect(page).toHaveURL(new RegExp(`colsort=${encodeURIComponent(COLUMN_KEY)}`));

    // 2.25 before 2.5. String collation would invert this exact pair.
    let valued = (await customCells(page)).filter((v) => v !== '—');
    expect(valued).toEqual([LOWER, UPPER]);

    await sortTo(page, 'descending');
    valued = (await customCells(page)).filter((v) => v !== '—');
    expect(valued).toEqual([UPPER, LOWER]);
  });

  test('blank rows sink below valued rows in BOTH directions', async ({ page }) => {
    await gotoHistory(page);

    // The deliberate divergence from `date`'s +Infinity behaviour: a custom
    // column is empty on most rows until someone backfills it, so a blank must
    // never take the top of the grid — under ascending OR descending.
    for (const dir of ['ascending', 'descending'] as const) {
      await sortTo(page, dir);
      const cells = await customCells(page);
      const lastValued = Math.max(cells.indexOf(LOWER), cells.indexOf(UPPER));
      const firstBlank = cells.indexOf('—');
      expect(firstBlank, `expected a blank row under ${dir}`).toBeGreaterThan(-1);
      expect(lastValued, `blanks must follow every valued row under ${dir}`).toBeLessThan(
        firstBlank,
      );
    }
  });

  test('the sort survives a reload (?colsort= durability)', async ({ page }) => {
    await gotoHistory(page);
    await sortTo(page, 'ascending');

    // `useUrlColumnSort` only persists a key its `isColumn` guard accepts — the
    // same predicate the header uses. A reload is the cheapest proof they agree.
    await page.reload();
    await expect(header(page)).toHaveAttribute('aria-sort', 'ascending', { timeout: 25_000 });

    const valued = (await customCells(page)).filter((v) => v !== '—');
    expect(valued).toEqual([LOWER, UPPER]);
  });
});
