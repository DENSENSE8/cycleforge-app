import { test, expect } from '@playwright/test';

/**
 * Home ("/" → My Day) shares Unbox's tab-strip grammar: the leading **scope**
 * tab is separated from the lanes that filter within it by exactly one
 * hairline (`withScopeDivider` in `workbench-shell.tsx`).
 *
 * Home's scope is `Everything`; Unbox's is `Recent`. Different words, same
 * shape — which is the point of putting the placement in one helper instead of
 * a `dividerBefore: id === '…'` per surface. The Unbox half is pinned in
 * `unbox-feed-opens-carton.spec.ts`.
 */
test.describe('Home — scope tab divider', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'desktop workbench chrome');

  test('one hairline, on the right of the leading scope tab', async ({ page }) => {
    await page.goto('/');

    const everything = page.getByRole('button', { name: /^Everything\b/ }).first();
    await expect(everything).toBeVisible({ timeout: 25_000 });

    const hairlines = page.locator('span.w-px.bg-border-hairline');
    await expect(hairlines).toHaveCount(1);

    // Measured, not inferred: "on the right side" is the requirement, and a
    // class assertion cannot tell one edge from the other.
    const [scopeBox, ruleBox, nextBox] = await Promise.all([
      everything.boundingBox(),
      hairlines.first().boundingBox(),
      page.getByRole('button', { name: /^Do next\b/ }).first().boundingBox(),
    ]);
    expect(ruleBox!.x).toBeGreaterThanOrEqual(scopeBox!.x + scopeBox!.width - 1);
    expect(ruleBox!.x).toBeLessThanOrEqual(nextBox!.x + 1);
  });

  test('the lane tabs still read left to right after the scope', async ({ page }) => {
    await page.goto('/');
    const strip = page.getByRole('button', {
      name: /^(Everything|Do next|Assigned|Needs attention)\b/,
    });
    await expect(strip.first()).toBeVisible({ timeout: 25_000 });
    const labels = (await strip.allInnerTexts()).map((t) =>
      t.trim().replace(/\s*\d+$/, ''),
    );
    // "Assigned", not "Assigned to me" — on My Day the qualifier is redundant,
    // and the strip now has to seat the due-horizon chips the KPI band held.
    expect(labels.slice(0, 4)).toEqual([
      'Everything',
      'Do next',
      'Assigned',
      'Needs attention',
    ]);
  });
});
