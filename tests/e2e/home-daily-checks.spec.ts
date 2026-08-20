import { test, expect } from '@playwright/test';

/**
 * Home → Daily — the shift checklist, end to end.
 *
 * The roster report lives on Operations (`?mode=checks`). This spec owns the
 * list you run: add, tick, same-day remove. The REMOVE step is the regression
 * for the half-open window CHECK (2026-08-19c) — a database predicate no unit
 * test can reach. Do not drop it.
 *
 * Runs on `qa-desktop` (the QA org). Assertions are scoped to the item this
 * run created — the QA list is shared.
 *
 * Playwright: `.click()` + `toBeChecked()`, never `.check()` — the checkbox is
 * Radix and repaints after the query cache lands.
 */

const CHECKLIST = '[data-testid="daily-checklist"]';

test.describe('Home → Daily', () => {
  test('landing is the checklist; add → tick → same-day remove', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'Desktop Home surface');

    const title = `E2E check ${Date.now()}`;

    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Today' })).toBeVisible();
    await expect(page.locator(CHECKLIST)).toBeVisible();
    await expect(page.getByTestId('daily-report')).toHaveCount(0);

    await page.getByRole('button', { name: 'Add' }).click();
    const composer = page.getByPlaceholder('Add a daily check…');
    await expect(composer).toBeVisible();
    await composer.fill(title);
    await composer.press('Enter');

    const row = page.locator(CHECKLIST).getByText(title, { exact: true });
    await expect(row).toBeVisible();

    const box = page.getByRole('checkbox', { name: title });
    await expect(box).not.toBeChecked();
    await box.click();

    await page.getByRole('tab', { name: 'Completed' }).click();
    await expect(page.getByRole('checkbox', { name: title })).toBeChecked();

    await page.locator(CHECKLIST).getByText(title, { exact: true }).click();
    await expect(page.getByTestId('daily-check-inspector')).toBeVisible();
    await page.getByTestId('daily-check-inspector-more').click();
    await page.getByRole('menuitem', { name: 'Remove from list' }).click();
    await expect(page.locator(CHECKLIST).getByText(title, { exact: true })).toHaveCount(0);

    // Surface survived the retire write (a 500 used to leave it mounted but stale).
    await expect(page.locator(CHECKLIST)).toBeVisible();
  });

  test('row opens Unbox-shaped inspector; ticket links in the rail', async ({ page }) => {
    test.skip(test.info().project.name === 'mobile', 'Desktop Home surface');

    const title = `E2E inspect ${Date.now()}`;

    await page.goto('/');
    await page.getByRole('button', { name: 'Add' }).click();
    const composer = page.getByPlaceholder('Add a daily check…');
    await composer.fill(title);
    await composer.press('Enter');

    const row = page.locator(CHECKLIST).getByText(title, { exact: true });
    await expect(row).toBeVisible();
    await row.click();

    await expect(page.locator(CHECKLIST)).toBeVisible();
    await expect(page.getByTestId('daily-check-inspector')).toBeVisible();
    await expect(page.getByTestId('unbox-displays-filter-row')).toBeVisible();
    await expect(page.getByTestId('station-displays-index-ticket')).toBeVisible();

    await page.getByTestId('station-displays-index-ticket').click();
    await expect(page.getByTestId('unbox-displays-filter-row')).toHaveCount(0);
    const ticketField = page.getByPlaceholder('Ticket #…');
    await expect(ticketField).toBeVisible();
    await ticketField.fill('1');
    await page.getByRole('button', { name: 'Link' }).click();

    await expect(page.getByTestId('unbox-ticket-display')).toBeVisible();

    await page.getByRole('button', { name: 'Back to topics' }).click();
    await expect(page.getByTestId('unbox-displays-filter-row')).toBeVisible();
    await page.getByTestId('daily-check-inspector-more').click();
    await page.getByRole('menuitem', { name: 'Remove from list' }).click();
  });
});
