import { test, expect, type Page } from '@playwright/test';

/**
 * Clipboard history — the `⌘⇧V` chord and the single panel it opens.
 *
 * D5 was re-decided on 2026-08-02 as option **A + D**: the button stays in the
 * spine ⋯ account overflow (where every comparable product puts clipboard
 * history — Windows `Win+V`, Paste, Maccy, Raycast, Alfred, Ditto all live in
 * the menu bar / tray, never on a toolbar), and the missing half was the chord.
 * Reasoning: `ClipboardHistoryHost`'s docblock + `source-of-truth.md` →
 * Clipboard history placement.
 *
 * What is worth testing here is the wiring that is easy to get wrong and
 * invisible in review:
 *
 *  1. **The chord works with the spine CLOSED.** This is the whole reason the
 *     binder is not in `StaffAccountFooter` — that footer mounts lazily on
 *     first spine open, so a chord bound there would be dead on a fresh load.
 *     A test that opened the spine first would pass against the broken wiring.
 *  2. **The chord yields inside a text field.** `⌘⇧V` is
 *     paste-without-formatting natively, so it must NOT steal the keystroke
 *     from an operator pasting into an input.
 *  3. **One panel, not two.** The footer is a trigger; it must not mount its
 *     own copy beside the host's.
 *
 * The store is device-local (`localStorage`), so the panel's empty state is the
 * honest default on a fresh context — assertions are on the panel and its
 * teaching copy, never on seeded entries.
 */

const CHORD = 'ControlOrMeta+Shift+KeyV';

const panel = (page: Page) => page.getByRole('dialog', { name: 'Clipboard history' });

test.describe('Clipboard history chord', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop spine chrome');

  test('⌘⇧V opens the panel with the spine closed, and toggles it shut', async ({ page }) => {
    await page.goto('/');
    // The spine starts collapsed (`navOpen` is unpersisted `useState(false)`),
    // so the ⋯ button does not exist yet. That is the case under test.
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
    // Paste-without-formatting belongs to the field the operator is typing in.
    await page.goto('/');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.id = 'chord-yield-probe';
      document.body.appendChild(input);
      input.focus();
    });

    await page.keyboard.press(CHORD);
    await expect(panel(page)).toHaveCount(0);
  });

  test('the spine ⋯ row opens the SAME panel and advertises the chord', async ({ page }) => {
    await page.goto('/');
    // Open the spine, then the account overflow. The spine starts collapsed,
    // so the toggle reads "Show navigation" (flips to "Hide navigation" once open).
    await page.getByRole('button', { name: 'Show navigation' }).click();
    await page.getByRole('button', { name: 'Account details' }).click();

    const row = page.getByRole('button', { name: /Clipboard history/ });
    await expect(row).toBeVisible();
    // The label and the binding ship together — a hint for a chord nobody binds
    // is worse than no hint at all.
    await expect(row).toContainText('⌘⇧V');

    await row.click();
    // Exactly one panel — the footer is a trigger, not a second mount.
    await expect(panel(page)).toHaveCount(1);
    await expect(panel(page)).toBeVisible();
  });
});
