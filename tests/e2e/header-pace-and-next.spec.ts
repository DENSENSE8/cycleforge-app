import { test, expect, type Page } from '@playwright/test';
import path from 'path';

/**
 * Header pace-and-next — one button for today's goal ring and the next work
 * order, opening one flush-square panel.
 *
 * Closed-face honesty (Phase 6):
 *   - ring when a goal exists
 *   - clipboard glyph when there is no goal but a work order
 *   - nothing once both settle empty (never a 0% ring on a day with no goal)
 *
 * The work-order row leads the panel when present. Soft radius is debt —
 * `GOAL_PANEL_SHELL_CLASS` is `rounded-none`.
 *
 * Run: `PW_BASE_URL=http://localhost:3160 npx playwright test
 * header-pace-and-next --project=qa-desktop`
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

async function paceButton(page: Page) {
  // Aria labels vary by face: "Daily goal — …" or "Next — …" / "Your next work order".
  return page
    .getByRole('button', { name: /Daily goal|Your next work order|^Next —/ })
    .first();
}

test.describe('Header pace-and-next', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop header chrome');

  test('one button, three honest faces — never a phantom 0% ring', async ({ page }) => {
    const mine = await page.request.get('/api/work-orders/mine');
    expect(mine.ok()).toBeTruthy();
    const { top } = (await mine.json()) as { top: unknown };

    await page.goto('/');

    const btn = await paceButton(page);
    const visible = await btn.isVisible().catch(() => false);

    if (!visible) {
      // Settled empty: neither goal nor work order → no chrome. That is the
      // third face. A disabled ring would be a lie.
      expect(top).toBeFalsy();
      await expect(
        page.getByRole('button', { name: /Daily goal|0%/ }),
      ).toHaveCount(0);
      return;
    }

    await expect(btn).toBeVisible();
    // No "0%" accessible name when the control is only a work-order glyph.
    const label = (await btn.getAttribute('aria-label')) ?? '';
    if (/Your next work order|^Next —/.test(label)) {
      expect(label).not.toMatch(/0%/);
    }
  });

  test('the panel is square-cornered; work-order row leads when present', async ({ page }) => {
    await page.goto('/');
    const btn = await paceButton(page);
    test.skip(!(await btn.isVisible().catch(() => false)), 'no pace-and-next face today');

    await btn.click();

    const shell = page.locator('.rounded-none.border.border-border-soft').filter({
      has: page.getByText(/Today'|Your next work order/),
    }).first();
    await expect(shell).toBeVisible();

    const radius = await shell.evaluate((el) => getComputedStyle(el).borderRadius);
    // Flush ops chrome — every corner zero.
    expect(radius === '0px' || radius.split(' ').every((p) => p === '0px')).toBeTruthy();

    const mine = await page.request.get('/api/work-orders/mine');
    const { top } = (await mine.json()) as { top: { title?: string } | null };
    if (top?.title) {
      const wo = page.getByText('Your next work order');
      await expect(wo).toBeVisible();
      // Leading band: work-order eyebrow precedes the goal header when both exist.
      const goalHeader = page.getByText(/Today's .+ goal/);
      if (await goalHeader.isVisible().catch(() => false)) {
        const woBox = await wo.boundingBox();
        const goalBox = await goalHeader.boundingBox();
        expect(woBox && goalBox && woBox.y < goalBox.y).toBeTruthy();
      }
    }
  });
});
