import { test, expect, type Page } from '@playwright/test';

/**
 * Dashboard bulk actions — lifecycle-scoped (execution plan Phase 5).
 *
 * House rule: **actions diverge by lifecycle stage; column layout does not.**
 * All four outbound tabs render one grid with one persisted column layout, so
 * the divergence has to live in the action set — "assign a tester" is
 * meaningless on Shipped, "print a shipping label" is meaningless on Pending.
 * `ContextualSelectionBar` drops actions whose constraints can't be met, so the
 * scoping shows up as absent buttons rather than disabled ones.
 */

test.describe('Dashboard bulk actions', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grid is a desktop layout');

  /** Select the first row on a lane and return the bar's action labels. */
  async function barActionsFor(page: Page, query: string): Promise<string[]> {
    await page.goto(`/dashboard?${query}`);
    const row = page.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole('checkbox').first().check();

    const labels = page.locator('[aria-label]');
    // Wait for an action that EVERY lane carries, not merely "some labelled
    // icon" — the old gate matched header chrome, so it was already satisfied
    // before the action set existed. That was harmless while the bottom capsule
    // rendered synchronously with the selection; the actions now live in the
    // right rail's footer, which appears only after the inspector opens and
    // finishes its entrance animation, so the loose gate started collecting an
    // empty array. Plan: docs/todo/order-rail-selection-plane-PLAN.md (D2).
    await expect(page.locator('[aria-label="Copy details"]').first()).toBeVisible({
      timeout: 20_000,
    });
    const all = await labels.evaluateAll((els) =>
      els.map((e) => e.getAttribute('aria-label') ?? '').filter(Boolean),
    );
    return [
      ...new Set(all.filter((l) => /^(Assign|Set ship-by|Print|Delete|Copy details|Export CSV)/i.test(l))),
    ];
  }

  test('pre-pack lanes offer prep actions; post-pack lanes offer the shipping document', async ({
    page,
  }) => {
    const pending = await barActionsFor(page, 'unshipped');
    expect(pending).toContain('Copy details');
    expect(pending).toContain('Assign tester / packer');
    expect(pending).toContain('Set ship-by date');
    expect(pending).toContain('Print product labels'); // SKU+serial prep label
    // Reads the selected rows only, so it holds on every lane.
    expect(pending).toContain('Export CSV');
    expect(pending).not.toContain('Print shipping labels');

    const packed = await barActionsFor(page, 'packed');
    expect(packed).toContain('Copy details');
    expect(packed).toContain('Print shipping labels');
    expect(packed).toContain('Export CSV');
    // Assigning a tester to an order that is already packed is not a thing.
    expect(packed).not.toContain('Assign tester / packer');
    expect(packed).not.toContain('Set ship-by date');
    expect(packed).not.toContain('Print product labels');
  });

  test('Export CSV downloads the selection as a warehouse-dated file', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const row = page.locator('[data-order-row-id]').first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole('checkbox').first().check();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByLabel('Export CSV').first().click(),
    ]);

    // Named for the lane + the WAREHOUSE civil day (not UTC, which is already
    // tomorrow for a late-afternoon PST export).
    expect(download.suggestedFilename()).toMatch(/^pending-orders-\d{4}-\d{2}-\d{2}\.csv$/);

    // Header + at least the one selected row — the file is built from the rows
    // in hand, never a second query that could disagree with the screen.
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const lines = Buffer.concat(chunks).toString('utf8').trim().split('\n');
    expect(lines[0]).toContain('order_id');
    expect(lines[0]).toContain('is_out_of_stock');
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  test('Assign opens the multi-row carousel, not a batch-edit form', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const rows = page.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    test.skip((await rows.count()) < 2, 'needs at least two pending rows');

    await rows.nth(0).getByRole('checkbox').first().check();
    await rows.nth(1).getByRole('checkbox').first().check();

    await page.getByLabel('Assign tester / packer').first().click();

    // The carousel walks the selection one record at a time (prev/next +
    // confirm→advance) rather than showing "mixed" values across the set.
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible({ timeout: 20_000 });
  });

  test('checkbox multi-select keeps both rows in the set', async ({ page }) => {
    // Regression for the 1→2 collapse: toggle adds B, then either a bubbled
    // row click or the adopt-effect race selectOnly-replaced the set with one
    // id. Assert the count on the rail band — independent of any action dialog.
    await page.goto('/dashboard?unshipped');
    const rows = page.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    test.skip((await rows.count()) < 2, 'needs at least two pending rows');

    await rows.nth(0).getByRole('checkbox').first().check();
    await rows.nth(1).getByRole('checkbox').first().check();

    await expect(page.getByText(/\b2 of \d+ selected\b/).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(rows.nth(0).getByRole('checkbox').first()).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(rows.nth(1).getByRole('checkbox').first()).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('Set ship-by opens a date picker scoped to the selection', async ({ page }) => {
    await page.goto('/dashboard?unshipped');
    const rows = page.locator('[data-order-row-id]');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    test.skip((await rows.count()) < 2, 'needs at least two pending rows');

    await rows.nth(0).getByRole('checkbox').first().check();
    await rows.nth(1).getByRole('checkbox').first().check();

    await expect(page.getByText(/\b2 of \d+ selected\b/).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.getByLabel('Set ship-by date').first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(dialog).toContainText('Applies to all 2 selected orders.');
    // Nothing is written until a date is chosen.
    await expect(dialog.getByRole('button', { name: 'Set date' })).toBeDisabled();
  });
});
