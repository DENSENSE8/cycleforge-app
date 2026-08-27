import { test, expect, type Page } from '@playwright/test';

/**
 * Add inbound right-rail lifecycle — expanded push column, clean close, reopen.
 *
 * Predictive UX contract:
 *   - Opens as a full push inspector (not the collapsed expand strip)
 *   - Host ✕ closes with no Column display resurfacing underneath
 *   - Add can be opened again immediately (no dismissed latch / Resume toast)
 *
 * QA org only (global-setup handles auth).
 */
test.describe('Add inbound rail lifecycle', () => {
  const OVERLAY = 'aside[role="region"][aria-label="Add inbound purchase or return"]';

  async function paintedRightColumns(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const painted = (el: Element | null): boolean => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
      };
      const out: string[] = [];
      if (painted(document.querySelector('[data-detail-inspector-collapsed]'))) {
        out.push('collapsed-strip');
      }
      if (painted(document.querySelector('[data-right-rail-column]'))) {
        out.push('desk-right-rail');
      }
      return out;
    });
  }

  test('opens expanded, ✕ leaves a clean edge, reopen lands on the index', async ({ page }) => {
    await page.goto('/incoming');
    await page.getByRole('button', { name: 'Add inbound purchase or return' }).click();

    const overlay = page.locator(OVERLAY);
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await expect(overlay.getByTestId('station-displays-index')).toBeVisible();

    const columns = await paintedRightColumns(page);
    expect(columns).toContain('desk-right-rail');
    expect(columns).not.toContain('collapsed-strip');

    await page.getByTestId('right-rail-host-close').click();
    await expect(overlay).toBeHidden({ timeout: 15_000 });
    expect(await paintedRightColumns(page)).toEqual([]);
    await expect(page.getByText('Column display')).toHaveCount(0);

    // Reopen — must not require Resume / draft toast recovery.
    await page.getByRole('button', { name: 'Add inbound purchase or return' }).click();
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await expect(overlay.getByTestId('station-displays-index-add-po')).toBeVisible();
    expect(await paintedRightColumns(page)).toContain('desk-right-rail');
  });

  test('✕ after Column display was open does not leave Column display up', async ({ page }) => {
    await page.goto('/incoming');

    await page.getByTestId('incoming-inspector-toggle').click();
    await expect(page.getByText('Column display')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Add inbound purchase or return' }).click();
    const overlay = page.locator(OVERLAY);
    await expect(overlay).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Column display')).toHaveCount(0);

    await page.getByTestId('right-rail-host-close').click();
    await expect(overlay).toBeHidden({ timeout: 15_000 });
    expect(await paintedRightColumns(page)).toEqual([]);
    await expect(page.getByText('Column display')).toHaveCount(0);
  });

  test('✕ after Check then Add closes the whole rail (not just the top tool)', async ({
    page,
  }) => {
    await page.goto('/incoming');

    const checkRail = page.getByRole('region', { name: 'Checking unreceived orders' });
    await page.getByTestId('incoming-check').click();
    await expect(checkRail).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Add inbound purchase or return' }).click();
    await expect(page.getByTestId('station-displays-index-add-po')).toBeVisible();
    await expect(checkRail).toBeHidden();

    await page.getByTestId('right-rail-host-close').click();
    expect(await paintedRightColumns(page)).toEqual([]);
    await expect(page.getByText('Draft saved')).toHaveCount(0);

    await page.getByTestId('incoming-check').click();
    await expect(checkRail).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('right-rail-host-close').click();
    expect(await paintedRightColumns(page)).toEqual([]);
  });
});
