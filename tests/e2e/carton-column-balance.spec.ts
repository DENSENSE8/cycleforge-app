import { test, expect } from '@playwright/test';

/**
 * `/carton/[id]` column weight — contents : timeline = 2fr : 1fr.
 *
 * Col 1 (CONTENTS · RECORD) needs the wider track so long line titles wrap
 * honestly; col 2 (PROGRESS · ACTIVITY · HISTORY) stays readable at one-third
 * of the row. Ruled 2026-08-03; supersedes the 22rem | 1fr rail.
 *
 * A screenshot can see track width directly. Content extents are still logged
 * for debugging (CSS grid stretches both CELLS to equal height, so only the
 * last child's bottom tells how tall the content actually is).
 *
 * Run against the QA org (`.claude/rules/verify.md`):
 *   pnpm provision:qa-org && npx playwright test tests/e2e/carton-column-balance.spec.ts --project=qa-desktop
 */

/** Last child's bottom relative to the column top — the real content extent. */
const extent = (col: SVGElement | HTMLElement) => {
  const top = col.getBoundingClientRect().top;
  const last = col.children[col.children.length - 1] as HTMLElement | undefined;
  return last ? last.getBoundingClientRect().bottom - top : 0;
};

async function openACarton(page: import('@playwright/test').Page) {
  await page.goto('/receiving/history');
  const rows = page.locator('[data-line-row-id]');
  const hasRows = await rows
    .first()
    .waitFor({ state: 'visible', timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
  if (!hasRows) test.skip(true, 'no History rows on this tenant');
  await rows.first().click();
  await expect(page).toHaveURL(/\/carton\/\d+/, { timeout: 15_000 });
  await expect(page.getByTestId('carton-contents-column')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('carton-timeline-column')).toBeVisible();
}

test.describe('carton read — column weight at 1440', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'the two-column read is a desktop layout');

  test('the contents track is ~2× the timeline track', async ({ page }) => {
    await openACarton(page);

    const contents = page.getByTestId('carton-contents-column');
    const timeline = page.getByTestId('carton-timeline-column');

    const left = (await contents.boundingBox())!;
    const right = (await timeline.boundingBox())!;

    // Same row — this is the two-column layout, not the stacked one.
    expect(Math.abs(left.y - right.y)).toBeLessThan(4);

    const leftExtent = await contents.evaluate(extent);
    const rightExtent = await timeline.evaluate(extent);
    // eslint-disable-next-line no-console
    console.log(
      `[carton columns] track ${Math.round(left.width)} / ${Math.round(right.width)} px · ` +
        `extent ${Math.round(leftExtent)} / ${Math.round(rightExtent)} px · ` +
        `width ratio ${(left.width / right.width).toFixed(2)}`,
    );

    // 2fr | 1fr → contents ≈ 2× timeline (loose floor absorbs gap/padding).
    expect(left.width).toBeGreaterThan(right.width * 1.5);
    expect(left.width).toBeLessThan(right.width * 2.5);
  });

  for (const width of [1024, 768]) {
    test(`below xl (${width}) the columns stack, contents first`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openACarton(page);

      const left = (await page.getByTestId('carton-contents-column').boundingBox())!;
      const right = (await page.getByTestId('carton-timeline-column').boundingBox())!;

      expect(right.y).toBeGreaterThan(left.y);
      // One full-width column, not two cramped ones — the 2fr track must not
      // survive the breakpoint.
      expect(Math.abs(left.width - right.width)).toBeLessThan(4);
    });
  }
});
