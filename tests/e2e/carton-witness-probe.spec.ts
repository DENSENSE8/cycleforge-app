import { test, expect } from '@playwright/test';

/**
 * TEMPORARY dogfood-only PROBE — `carton-read-timeline-honesty-HANDOFF.md` §3.3.
 *
 * Runs on the DOGFOOD tenant (`--project=desktop`), not the QA org, and that is
 * deliberate per `verify.md`'s dogfood exception: the two open questions are
 * about a carton with a REAL history, and the QA fixtures do not have one (the
 * permanent guard `carton-column-balance.spec.ts` already measured 0.90 there,
 * i.e. no imbalance to see). Every number below is a measurement, not an
 * assertion — delete this file once the rulings land in `carton-read.md`.
 *
 * Witnesses, pre-picked and re-confirmed against the DB on 2026-08-02:
 *   6159 — 7 lines · 1 PO   (the 4+ line case the asymmetry was doubted on)
 *   5678 — 1 line  · 1 PO   (multi-serial — journey chip alignment)
 *   2402 — 12 lines · 8 POs (the inverting edge + the PO rollup)
 */

const WITNESSES = [6159, 5678, 2402];

/** Last child's bottom relative to the column top — the real content extent. */
const extent = (col: HTMLElement) => {
  const top = col.getBoundingClientRect().top;
  const last = col.children[col.children.length - 1] as HTMLElement | undefined;
  return last ? last.getBoundingClientRect().bottom - top : 0;
};

test.describe('carton read — witness geometry at 1440 (dogfood probe)', () => {
  for (const id of WITNESSES) {
    test(`carton ${id}`, async ({ page }) => {
      await page.goto(`/carton/${id}`);
      const contents = page.getByTestId('carton-contents-column');
      const timeline = page.getByTestId('carton-timeline-column');
      await expect(contents).toBeVisible({ timeout: 30_000 });
      await expect(timeline).toBeVisible();
      // Let the async sub-resources (serials, journeys, photos) settle.
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(2_500);

      const left = (await contents.boundingBox())!;
      const right = (await timeline.boundingBox())!;
      const leftExtent = await contents.evaluate(extent);
      const rightExtent = await timeline.evaluate(extent);

      const tall = Math.max(leftExtent, rightExtent);
      const deadLeft = left.width * (tall - leftExtent);
      const deadRight = right.width * (tall - rightExtent);

      // Section eyebrows actually rendered in each column.
      const eyebrows = async (root: typeof contents) =>
        (await root.locator('p.text-role-eyebrow').allTextContents()).map((s) => s.trim());

      // Journey identity chips — the second line's leading element.
      const chipLefts = await page.evaluate(() => {
        const col = document.querySelector('[data-testid="carton-timeline-column"]');
        if (!col) return [];
        return Array.from(col.querySelectorAll('[data-chip-face]')).map((el) =>
          Math.round(el.getBoundingClientRect().left),
        );
      });

      // eslint-disable-next-line no-console
      console.log(
        [
          ``,
          `── carton ${id} ─────────────────────────────`,
          `  tracks   ${Math.round(left.width)} / ${Math.round(right.width)} px`,
          `  extents  ${Math.round(leftExtent)} / ${Math.round(rightExtent)} px  (ratio ${(
            leftExtent / rightExtent
          ).toFixed(2)})`,
          `  dead     left ${Math.round(deadLeft / 1000)}k px²  ·  right ${Math.round(
            deadRight / 1000,
          )}k px²`,
          `  col1     ${(await eyebrows(contents)).join(' · ') || '(none)'}`,
          `  col2     ${(await eyebrows(timeline)).join(' · ') || '(none)'}`,
          `  chips    ${chipLefts.length} · distinct left x = ${JSON.stringify([
            ...new Set(chipLefts),
          ])}`,
        ].join('\n'),
      );

      expect(Math.abs(left.y - right.y)).toBeLessThan(4);
    });
  }
});
