import { test, expect, type Page } from '@playwright/test';

/**
 * Dashboard rail — cardinality decides the body (plan Phase 3 + §4 guard).
 *
 * `docs/todo/order-rail-selection-plane-PLAN.md`: on `/dashboard` the right
 * rail IS the selection plane, and **how many rows are checked decides what it
 * shows** — 1 inspects, 2 compare, 3+ stage a batch. These specs walk that
 * boundary in a browser, because the resolver's unit tests can prove the rule
 * but not that the two registrars hand the single rail slot back and forth
 * cleanly.
 *
 * QA org only (`qa-desktop`) — never the dogfood tenant, whose row mix changes
 * under the test between runs.
 */

const COMPARE_RAIL = { name: 'Comparing 2 orders' } as const;

/** Check the first `count` rows on the Pending lane. */
async function selectRows(page: Page, count: number) {
  await page.goto('/dashboard?unshipped');
  const rows = page.locator('[data-order-row-id]');
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  test.skip((await rows.count()) < count, `needs at least ${count} pending rows`);
  for (let i = 0; i < count; i += 1) {
    await rows.nth(i).getByRole('checkbox').first().check();
  }
  if (count >= 2) {
    await expect(page.getByText(new RegExp(`\\b${count} of \\d+ selected\\b`)).first()).toBeVisible({
      timeout: 20_000,
    });
  } else {
    // The 1-row body is the inspector, which mounts `RailActionRegion` but NOT
    // the selection band — so there is no "1 of N selected" to wait for. Gate
    // on the action set instead, same as `dashboard-bulk-actions.spec.ts`.
    await expect(page.locator('[aria-label="Copy details"]').first()).toBeVisible({
      timeout: 20_000,
    });
  }
  return rows;
}

test.describe('Dashboard rail compare (2 rows)', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  test('two checked rows open the compare pane, not the roster', async ({ page }) => {
    await selectRows(page, 2);

    const rail = page.getByRole('region', COMPARE_RAIL);
    await expect(rail).toBeVisible({ timeout: 20_000 });

    // Non-modal by contract: an inspector that scrimmed the grid would hide the
    // sibling rows the operator is comparing against. `role="region"` (which
    // the locator above already asserts) plus no `aria-modal` is the honest
    // markup for that — see source-of-truth.md → Right-rail modality.
    expect(await rail.getAttribute('aria-modal')).toBeNull();

    // Fact-per-row stack, both columns present.
    await expect(rail.getByText('Order', { exact: true })).toBeVisible();
    await expect(rail.getByText('Product', { exact: true })).toBeVisible();
  });

  test('two different orders always diverge on at least the order id', async ({ page }) => {
    await selectRows(page, 2);
    const rail = page.getByRole('region', COMPARE_RAIL);
    await expect(rail).toBeVisible({ timeout: 20_000 });

    // Two distinct rows can never agree on Order, so the headline must report a
    // divergence. If this ever reads "These two agree" the comparison collapsed
    // — which is exactly what a raw `!==` on a normalized field would do.
    await expect(rail.getByText(/\d+ of \d+ differ/)).toBeVisible({ timeout: 20_000 });
  });

  test('"Differences only" hides the agreeing facts', async ({ page }) => {
    await selectRows(page, 2);
    const rail = page.getByRole('region', COMPARE_RAIL);
    await expect(rail).toBeVisible({ timeout: 20_000 });

    const factRows = rail.locator('li');
    const allCount = await factRows.count();
    expect(allCount).toBeGreaterThan(0);

    await rail.getByRole('checkbox', { name: /differences only/i }).check();

    // The filter keeps only divergent facts, so the list can never grow — and
    // Order is divergent, so it can never empty either.
    await expect(async () => {
      expect(await factRows.count()).toBeLessThanOrEqual(allCount);
    }).toPass({ timeout: 10_000 });
    await expect(rail.getByText('Order', { exact: true })).toBeVisible();
  });

  test('the compare pane hands the slot to the roster at three rows', async ({ page }) => {
    const rows = await selectRows(page, 2);
    await expect(page.getByRole('region', COMPARE_RAIL)).toBeVisible({ timeout: 20_000 });

    await rows.nth(2).getByRole('checkbox').first().check();

    // One slot, one occupant: compare must LEAVE when the roster arrives.
    await expect(page.getByRole('region', COMPARE_RAIL)).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('region', { name: '3 orders selected' })).toBeVisible({
      timeout: 20_000,
    });

    // …and come back when the selection drops to two again.
    await rows.nth(2).getByRole('checkbox').first().uncheck();
    await expect(page.getByRole('region', COMPARE_RAIL)).toBeVisible({ timeout: 20_000 });
  });

  test('one row inspects — the compare pane stays out of the way', async ({ page }) => {
    await selectRows(page, 1);
    await expect(page.getByRole('region', COMPARE_RAIL)).toBeHidden({ timeout: 20_000 });
    // The 1-row body still carries the action set (Phase 2 contract).
    await expect(page.locator('[aria-label="Copy details"]').first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('closing the compare rail clears the selection (D4)', async ({ page }) => {
    const rows = await selectRows(page, 2);
    const rail = page.getByRole('region', COMPARE_RAIL);
    await expect(rail).toBeVisible({ timeout: 20_000 });

    await rail.getByRole('button', { name: 'Clear' }).click();

    await expect(rail).toBeHidden({ timeout: 20_000 });
    // Rows left checked with no visible plane is the state D4 exists to prevent.
    await expect(rows.nth(0).getByRole('checkbox').first()).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await expect(rows.nth(1).getByRole('checkbox').first()).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});
