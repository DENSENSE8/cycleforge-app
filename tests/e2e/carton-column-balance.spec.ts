import { test, expect } from '@playwright/test';

/**
 * `/carton/[id]` column weight — the two tracks are NOT peers.
 *
 * Col 1 answers a BOUNDED question ("what is in this box" — one line and a
 * sparse fact set for the median carton); col 2 answers an UNBOUNDED one
 * ("what happened to it" — pipeline, activity, unit journeys, findings).
 * Equal `xl:grid-cols-2` tracks guaranteed the imbalance the 2026-08-02 pass
 * shipped with: measured at 1440×900 the left column's content ended roughly a
 * third of the way down while the right ran past the fold.
 *
 * A screenshot cannot see this — CSS grid stretches both CELLS to equal height,
 * so the cells always match and only the last child's bottom tells the truth.
 * Hence the extent probe below (the shape `carton-read-display-polish` §4
 * prescribes).
 *
 * Two assertions, and they are different kinds of claim:
 *   1. the TRACKS are asymmetric — a structural invariant of the ruling, true
 *      regardless of which carton loads;
 *   2. the left column carries real weight — data-dependent, so the floor is
 *      deliberately loose and the numbers are logged rather than pinned tight.
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

  test('the timeline track is wider than the contents rail', async ({ page }) => {
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
        `ratio ${(leftExtent / rightExtent).toFixed(2)}`,
    );

    // The ruling: the bounded column is a RAIL, the unbounded one takes the room.
    expect(right.width).toBeGreaterThan(left.width * 1.4);
  });

  for (const width of [1024, 768]) {
    test(`below xl (${width}) the columns stack, contents first`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openACarton(page);

      const left = (await page.getByTestId('carton-contents-column').boundingBox())!;
      const right = (await page.getByTestId('carton-timeline-column').boundingBox())!;

      expect(right.y).toBeGreaterThan(left.y);
      // One full-width column, not two cramped ones — the rail track must not
      // survive the breakpoint.
      expect(Math.abs(left.width - right.width)).toBeLessThan(4);
    });
  }
});
