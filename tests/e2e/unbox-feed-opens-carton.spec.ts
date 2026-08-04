import { test, expect } from '@playwright/test';

/**
 * The Unbox workbench feed — Recent / Queue keep two action planes (row body
 * opens, select gutter owns bulk). History is click-select golden: no select
 * column; plain click toggles bulk; double-click opens; header paint-bucket
 * paints selected rows (Rose + siblings).
 *
 * Before 2026-08-01, `useReceivingLineBulkSelection({ active: true })` pinned
 * `selectMode` ON and `handleSelectRow` swallowed every click into the bulk
 * toggle. Measured on dogfood: Recent 117 rows, Queue 12, History 22 — every
 * one ticking a checkbox, zero `receiving-select-line` events.
 *
 * Run against the QA org (`.claude/rules/verify.md`):
 *   npx playwright test tests/e2e/unbox-feed-opens-carton.spec.ts --project=qa-desktop
 */

const GUTTER_TABS = [
  { name: 'Recent', url: '/unbox?unboxview=viewed', selectChrome: 'always' as const },
  { name: 'Queue', url: '/unbox?unboxview=queue', selectChrome: 'always' as const },
] as const;

test.describe('Unbox feed — click opens, gutter selects, neither stamps Recent', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'queue grids are a desktop layout');

  test('the tab strip reads Recent · Queue · History, left to right', async ({ page }) => {
    await page.goto('/unbox');
    const strip = page.getByRole('button', { name: /^(Recent|Queue|History)\b/ });
    await expect(strip.first()).toBeVisible({ timeout: 25_000 });
    const labels = (await strip.allInnerTexts()).map((t) => t.trim().split(/\s+/)[0]);
    expect(labels.slice(0, 3)).toEqual(['Recent', 'Queue', 'History']);
  });

  test('ONE hairline, on Recent’s right edge — and Recent carries a count', async ({ page }) => {
    await page.goto('/unbox');
    const recent = page.getByRole('button', { name: /^Recent\b/ }).first();
    await expect(recent).toBeVisible({ timeout: 25_000 });

    const hairlines = page.locator('span.w-px.bg-border-hairline');
    await expect(hairlines).toHaveCount(1);

    const [recentBox, ruleBox, queueBox] = await Promise.all([
      recent.boundingBox(),
      hairlines.first().boundingBox(),
      page.getByRole('button', { name: /^Queue\b/ }).first().boundingBox(),
    ]);
    expect(ruleBox!.x).toBeGreaterThanOrEqual(recentBox!.x + recentBox!.width - 1);
    expect(ruleBox!.x).toBeLessThanOrEqual(queueBox!.x + 1);

    const counted = await expect
      .poll(async () => (await recent.innerText()).trim(), { timeout: 10_000 })
      .toMatch(/^Recent\s*\d+$/)
      .then(() => true)
      .catch(() => false);
    if (!counted) test.skip(true, 'this staffer has no recents on this tenant');
  });

  for (const tab of GUTTER_TABS) {
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

      await expect(rows.first()).toHaveAttribute('role', 'button');
      const gutter = rows.first().getByRole('checkbox');
      await expect(gutter).toHaveCount(1);
      await expect(gutter.first()).toHaveAttribute('data-select-chrome', tab.selectChrome);

      await rows.first().click();
      await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });
      await expect(page).toHaveURL(/openReceivingId=\d+/);

      expect(viewWrites).toEqual([]);
    });
  }

  test('History: click selects (no gutter); double-click opens', async ({ page }) => {
    const viewWrites: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().includes('/api/receiving-lines/view')) {
        viewWrites.push(r.url());
      }
    });

    await page.goto('/unbox');
    const rows = page.locator('[data-line-row-id]');
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no Unbox rows on this tenant');

    const row = rows.first();
    // No select gutter control — the row itself is the checkbox.
    await expect(row.locator('[data-select-chrome]')).toHaveCount(0);
    await expect(row).toHaveAttribute('role', 'checkbox');
    await expect(row).toHaveAttribute('aria-checked', 'false');
    await expect(row).not.toHaveClass(/bg-blue-50/);

    await row.click();
    await expect(row).toHaveAttribute('aria-checked', 'true');
    await expect(row).toHaveClass(/bg-blue-50/);
    await expect(page.getByTestId('receiving-workspace')).toHaveCount(0);
    expect(viewWrites).toEqual([]);

    await row.dblclick();
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/openReceivingId=\d+/);
    expect(viewWrites).toEqual([]);
  });

  test('History: selecting two rows washes both; click again clears one', async ({ page }) => {
    await page.goto('/unbox');
    const rows = page.locator('[data-line-row-id]');
    const hasRows = await rows
      .nth(1)
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'need ≥2 Unbox History rows on this tenant');

    const a = rows.nth(0);
    const b = rows.nth(1);

    await a.click();
    await b.click();
    await expect(a).toHaveAttribute('aria-checked', 'true');
    await expect(b).toHaveAttribute('aria-checked', 'true');
    await expect(a).toHaveClass(/bg-blue-50/);
    await expect(b).toHaveClass(/bg-blue-50/);

    await a.click();
    await expect(a).toHaveAttribute('aria-checked', 'false');
    await expect(a).not.toHaveClass(/bg-blue-50/);
    await expect(b).toHaveAttribute('aria-checked', 'true');
    await expect(b).toHaveClass(/bg-blue-50/);
    await expect(page.getByTestId('receiving-workspace')).toHaveCount(0);
  });

  test('History: header select-all works; paint lives beside List|Drill', async ({ page }) => {
    await page.goto('/unbox');
    const rows = page.locator('[data-line-row-id]');
    const hasRows = await rows
      .first()
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasRows) test.skip(true, 'no Unbox rows on this tenant');

    const header = page.locator('[data-grid-col-header]');
    await expect(header).toBeVisible({ timeout: 15_000 });
    const selectAll = header.getByRole('checkbox', { name: /Select all/i }).first();
    await expect(selectAll).toBeVisible();
    // Paint is NOT in the grid header — it sits left of List|Drill.
    await expect(header.locator('[data-row-paint-trigger]')).toHaveCount(0);

    const paint = page.locator('[data-row-paint-trigger]');
    const drill = page.getByTestId('history-drill-chrome');
    await expect(paint).toBeVisible();
    await expect(drill).toBeVisible();
    const [paintBox, drillBox] = await Promise.all([paint.boundingBox(), drill.boundingBox()]);
    expect(paintBox!.x + paintBox!.width).toBeLessThanOrEqual(drillBox!.x + 2);

    await expect(paint).toBeDisabled();
    const row = rows.first();
    await row.click();
    await expect(row).toHaveAttribute('aria-checked', 'true');
    await expect(paint).toBeEnabled();

    await paint.click();
    const rose = page.getByRole('radio', { name: 'Rose' });
    await expect(rose).toBeVisible({ timeout: 5_000 });
    await rose.click();

    await row.click();
    await expect(row).toHaveAttribute('aria-checked', 'false');
    await expect(row).not.toHaveClass(/bg-blue-50/);
    await expect(row).toHaveCSS('background-color', 'rgb(255, 241, 242)');
  });

  test('Recent / Queue keep always-visible gutter chrome', async ({ page }) => {
    for (const tab of GUTTER_TABS) {
      await page.goto(tab.url);
      const rows = page.locator('[data-line-row-id]');
      const hasRows = await rows
        .first()
        .waitFor({ state: 'visible', timeout: 25_000 })
        .then(() => true)
        .catch(() => false);
      if (!hasRows) {
        continue;
      }
      const box = rows.first().getByRole('checkbox').first();
      await expect(box).toHaveAttribute('data-select-chrome', 'always');
      await expect(box).toHaveAttribute('aria-checked', 'false');
      await expect(box).toHaveClass(/border-border-default/);
    }
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
    await expect.poll(() => viewWrites.length).toBeGreaterThan(0);
  });
});
