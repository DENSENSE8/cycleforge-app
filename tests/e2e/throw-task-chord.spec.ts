import { test, expect, type Page } from '@playwright/test';
import path from 'path';

/**
 * Throw a task — the `⌘⇧U` chord and the single panel it opens.
 *
 * Sibling of `clipboard-history-chord.spec.ts`. Chord + goal-chip discovery
 * row, never a sixth header icon. What is worth testing is the wiring that is
 * easy to get wrong and invisible in review:
 *
 *  1. **The chord works with the spine CLOSED** — binder lives on
 *     `ThrowTaskHost` (always mounted), not `StaffAccountFooter` (lazy).
 *  2. **The chord yields inside a text field** — autofocus would yank the
 *     caret out of a note mid-word.
 *  3. **A wedge cannot fire it** — bare digits + Enter never open the panel.
 *  4. **One panel** — the goal-chip Throw row is a trigger, not a second mount.
 *
 * Run against the tasks lane: `PW_BASE_URL=http://localhost:3160`.
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

const CHORD = 'ControlOrMeta+Shift+KeyU';

const panel = (page: Page) => page.getByRole('dialog', { name: 'Throw a task' });

test.describe('Throw-task chord', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop spine chrome');

  test('⌘⇧U opens the panel with the spine closed, and toggles it shut', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-staff-account-footer]')).toHaveCount(0);

    await page.keyboard.press(CHORD);
    await expect(panel(page)).toBeVisible();

    await page.keyboard.press(CHORD);
    await expect(panel(page)).toHaveCount(0);
  });

  test('Escape closes it', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press(CHORD);
    await expect(panel(page)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
  });

  test('the chord stands down inside a text field', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'throw-chord-yield-probe';
      document.body.appendChild(input);
      input.focus();
    });

    await page.keyboard.press(CHORD);
    await expect(panel(page)).toHaveCount(0);
  });

  test('a wedge burst does not open the panel', async ({ page }) => {
    // Wedges emit bare characters + Enter, never Meta/Ctrl. The chord is
    // modifier-gated for exactly this reason.
    await page.goto('/');
    await page.keyboard.type('9400112345678901234567');
    await page.keyboard.press('Enter');
    await expect(panel(page)).toHaveCount(0);
  });

  test('the goal-chip Throw row opens the SAME panel and advertises the chord', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-header-goal-chip]').getByRole('button').click();

    const row = page.getByRole('button', { name: /Throw a task/ }).filter({ hasText: '⌘⇧U' });
    await expect(row).toBeVisible();

    await row.click();
    await expect(panel(page)).toHaveCount(1);
    await expect(panel(page)).toBeVisible();
  });
});
