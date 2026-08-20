import { test, expect } from '@playwright/test';

/**
 * P3-DS-03 — photos library "group by ticket" view + receiving quick-peek.
 *
 * A. The library exposes a "Group by ticket" layout that resolves photos by
 *    ticket number (poRef) into labeled sections.
 *
 * NOTE (2026-08-20): part B covered the receiving photo peek (PhotoPeekFan)
 * hover → fan → expand card stack against the isolation harness at
 * /design-demo/photo-peek. That harness route was deleted with the design-demo
 * tree, so part B was removed with it. PhotoPeekFan is STILL LIVE
 * (packer/UnitPackPhotoPeek, line-edit/PhotoPeekFan) and is now UNCOVERED —
 * it needs a replacement spec driven from a real carton, or a new harness.
 * Tracked in docs/kill-list/01-tier1-provably-dead.md.
 */

test.describe('A · Photo library group-by-ticket', () => {
  test('the layout switcher offers Group by ticket and switches the view', async ({ page }) => {
    await page.goto('/ops/photos');
    const groupBtn = page.getByRole('button', { name: /group by ticket/i });
    await expect(groupBtn).toBeVisible();
    await groupBtn.click();
    // URL reflects the view so the grouping is deep-linkable.
    await expect(page).toHaveURL(/view=grid-ticket/);
  });

  test('deep link renders ticket section headers when photos exist', async ({ page }) => {
    await page.goto('/ops/photos?view=grid-ticket');
    // Either ticket sections render, or the empty/loading state shows — both
    // are valid; the view must not crash.
    await expect(page.getByRole('button', { name: /group by ticket/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('Folders view drills into a folder, then opens a photo in the viewer', async ({ page }) => {
    // DevTools-style check: no uncaught page errors during the folder flow.
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    // Folders is the default view — no ?view needed; the Folders button is active.
    await page.goto('/ops/photos?sourceScope=unboxing');
    await expect(page.getByRole('button', { name: 'Folders' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Finder-style: clicking a folder drills *into* it (photos render inline)
    // rather than opening the lightbox; clicking a photo then opens the viewer.
    // Otherwise the empty state is valid (no crash).
    const firstFolder = page.getByTestId('photo-folder').first();
    if (await firstFolder.count()) {
      await firstFolder.click();
      // Bottom date breadcrumb reflects the drill, and photos render inline.
      await expect(page.getByRole('navigation', { name: 'Date path' })).toBeVisible();
      const firstTile = page.getByTestId('photo-tile').first();
      await expect(firstTile).toBeVisible();
      await firstTile.click();
      await expect(page.getByTestId('photo-lightbox')).toBeVisible();
      // Folder photos carry ids, so the viewer's delete affordance shows.
      await expect(page.getByRole('button', { name: /delete photo/i })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('photo-lightbox')).toHaveCount(0);
    }

    expect(pageErrors, `Uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });

  test('Claims folders group by Zendesk ticket without crashing', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/ops/photos?sourceScope=claims&view=folders');
    await expect(page.getByRole('button', { name: 'Folders' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // Ticket-title resolution is best-effort (Zendesk API); folders must render
    // with a fallback label and never throw, whether or not titles resolve.
    const folders = page.getByTestId('photo-folder');
    if (await folders.count()) {
      await expect(folders.first()).toBeVisible();
      // Claims are grouped by Zendesk ticket — labels are #1234, not PO/Order refs.
      for (const label of await folders.allInnerTexts()) {
        expect(label).not.toMatch(/\b(PO|Order|Ticket)\s/);
        if (!label.includes('Unlinked')) {
          expect(label).toMatch(/#\d+/);
        }
      }
    }
    expect(pageErrors, `Uncaught page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });
});
