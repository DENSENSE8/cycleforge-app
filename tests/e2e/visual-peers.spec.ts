import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  DESIGN_LAB_VIEWPOINTS,
  type DesignLabViewpoint,
} from '@/lib/design-lab/catalog';
import { VISUAL_SIBLING_PAIRS } from '@/lib/design-lab/visual-sibling-pairs';
import { installDeskFixtures } from './visual-peer-fixtures';

/**
 * Visual regression — every registered surface, one screenshot each.
 *
 * Plan: `docs/todo/self-hosted-ci-and-fork-teardown-PLAN.md` §7.
 *
 * ## Why this exists
 *
 * Every UI regression found on 2026-09-04 — `$0.00` painted on unpriced rows, a
 * bound subtitle slot that never rendered, a packed order sitting on the
 * Shortage desk, the select-all hidden behind a `thumb` probe — was caught by a
 * RENDERED screenshot and by nothing else. The unit suites were green each time.
 * A grid is a picture; the test has to look at the picture.
 *
 * ## Why the walk is `DESIGN_LAB_VIEWPOINTS` and not a list here
 *
 * The lab catalog is derived from `SCAN_STATION_OVERLAY_COHORT` + `PRODUCT_TABLES`
 * and its own tripwire proves nothing was dropped (`DESK_TABLES_WITHOUT_ROUTE`
 * names every table with no route). Declaring the peers a second time in this
 * spec would be one more list that drifts — the exact failure this repo's
 * cohorts exist to refuse. Register a table, and it is screenshotted.
 *
 * ## The fan-out is the point
 *
 * Twenty-odd desks mount ONE engine. A change to `CompoundCells.tsx` shows up
 * here as twenty diffs at once — the property that makes a per-page screenshot
 * suite uneconomic elsewhere is exactly what makes it decisive on a
 * one-engine product.
 *
 * ## Baselines are the operator's verdict
 *
 * A diff is a change a human approves, not a score. `--update-snapshots` is run
 * by the OPERATOR after looking at the before/after in the receipt; an agent
 * never runs it. The first run seeds; every later run compares.
 *
 * ## Determinism, and what is masked
 *
 * These run against route-mocked desk feeds (`visual-peer-fixtures.ts`) so a
 * sibling session emptying the live DB cannot seed an empty-grid baseline.
 * Stations and composers stay live-data with masks. When the queue changes
 * under a station shot, the operator sees a real diff and re-approves.
 */

/**
 * Clock-derived faces — legitimate daily drift, never a regression. ROW cells
 * only: the header is chrome and must stay in the picture.
 */
const MASKS = ['[role="row"] [data-col="dates"]'] as const;

/**
 * Dev-only chrome that is not the product: the Next.js issue badge
 * (`nextjs-portal`) floats over every page under `next dev` and changes with
 * whatever the last HMR pass complained about. Hidden, not masked — a mask
 * paints a magenta box, and a magenta box over the bottom-left of every
 * baseline is its own kind of noise.
 */
const HIDE_DEV_CHROME = [
  'nextjs-portal { display: none !important; }',
  // Scrollbars are LAYOUT: a body that crosses the overflow threshold between
  // two runs shifts every column by the gutter width, and every glyph on the
  // page then "changes". Chromium's overlay scrollbars are hidden for the
  // capture so the content box is the same width whether or not the rows
  // overflow — the same reason Storybook/Chromatic capture with them off.
  '::-webkit-scrollbar { display: none !important; }',
  '* { scrollbar-width: none !important; }',
].join('\n');

/**
 * A surface that is showing an ERROR is not a baseline. These are the faces
 * this product paints when a fetch failed or a page threw; a screenshot that
 * contains one records the failure as the expected picture, and every later
 * run then passes by matching it. Fail instead — loudly, with the text.
 */
const ERROR_FACES = [
  'Internal server error',
  'Something went wrong',
  'Application error',
  'Failed to fetch',
] as const;

/** Desktop peers: desks, stations and composers. Mobile rides its own project. */
const DESKTOP_SECTIONS = new Set<DesignLabViewpoint['section']>([
  'desks',
  'stations',
  'composers',
]);

function snapshotName(viewpoint: DesignLabViewpoint): string {
  // `desk:orders` → `desk-orders.png`; stable across renames of the label.
  return `${viewpoint.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
}

/**
 * Let the surface finish painting — for real, not "the network went quiet".
 *
 * The first comparison pass (2026-09-04) failed 7 of 25 desks against
 * baselines taken minutes earlier, with two signatures:
 *
 * - every glyph on the page differed, layout identical — the WEB FONT had not
 *   loaded in one of the two runs, so one capture is the fallback face;
 * - the grid body was skeleton bars in one run and rows in the other — the
 *   desk paints an RSC stand-in, then the skeleton, then the live rows, and a
 *   fixed 1.5 s after "networkidle" lands on whichever of the three the box
 *   happened to be on.
 *
 * So the settle waits on the STATES, each with its own DOM marker, and only
 * then takes a short quiet period: `document.fonts.ready`; no
 * `[aria-busy="true"]` (`LedgerGridSkeleton`); no `[data-paint-surface]`
 * (`OrdersQueueFirstPaint` stand-in) still on screen; no visible
 * `.animate-spin`. Each wait is capped — a surface that never stops loading is
 * a finding, not a hang — and the screenshot is taken regardless, so the
 * failure shows the picture.
 */
const LOADING_MARKERS = [
  '[aria-busy="true"]',
  '[data-paint-surface]',
  '.animate-spin',
] as const;

/**
 * Is anything still loading ON SCREEN? Bounding boxes, not Playwright
 * visibility: the orders desks keep an `sr-only` copy of the first-paint
 * stand-in in the DOM permanently (1×1 px, for the RSC seed), and
 * `waitFor({ state: 'hidden' })` counts a 1 px box as visible — so the wait
 * hit its 20 s cap on every one of those desks and the walk took twelve
 * minutes. A marker counts only when it has a real box.
 */
async function stillLoading(page: Page): Promise<string | null> {
  return page.evaluate((markers) => {
    for (const marker of markers) {
      for (const el of document.querySelectorAll(marker)) {
        const r = el.getBoundingClientRect();
        if (r.width > 4 && r.height > 4) return marker;
      }
    }
    return null;
  }, LOADING_MARKERS as unknown as string[]);
}

const SETTLE_CAP_MS = 15_000;

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  const deadline = Date.now() + SETTLE_CAP_MS;
  while (Date.now() < deadline) {
    if (!(await stillLoading(page).catch(() => null))) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(750);
}

test.describe('visual — registered surfaces', () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  for (const viewpoint of DESIGN_LAB_VIEWPOINTS) {
    const isMobile = viewpoint.section === 'mobile';

    test(`${viewpoint.id} — ${viewpoint.label}`, async ({ page }, testInfo) => {
      // One viewport family per project: mobile viewpoints under the iPhone
      // project, everything else under desktop. Skipping (not filtering) keeps
      // the walk enumerable — a viewpoint that vanished would fail, not hide.
      const mobileProject = testInfo.project.name === 'mobile';
      test.skip(isMobile !== mobileProject, `${viewpoint.section} runs on the other project`);
      test.skip(!isMobile && !DESKTOP_SECTIONS.has(viewpoint.section), 'no project for this section');

      await installDeskFixtures(page, viewpoint);
      await page.goto(viewpoint.route, { waitUntil: 'domcontentloaded' });
      await page.addStyleTag({ content: HIDE_DEV_CHROME });
      await settle(page);

      const body = (await page.locator('body').innerText().catch(() => '')) ?? '';
      const errorFace = ERROR_FACES.find((face) => body.includes(face));
      expect(errorFace, `${viewpoint.route} is painting an error face: "${errorFace}"`).toBeUndefined();

      await expect(page).toHaveScreenshot(snapshotName(viewpoint), {
        fullPage: false,
        animations: 'disabled',
        caret: 'hide',
        // Applied AT CAPTURE, not once after navigation: under `next dev` a
        // route can recompile and hot-reload between `goto` and the shot,
        // which replaces the document and discards any `addStyleTag` — the
        // third pass caught the "Compiling…" pill in a baseline exactly that
        // way. `style` is re-injected by Playwright for the capture itself.
        style: HIDE_DEV_CHROME,
        mask: MASKS.map((selector) => page.locator(selector)),
        // 1 % of a 1600×900 frame is ~14 400 px. The first passes showed that
        // text-heavy desks legitimately vary by ~0.7 % run to run in glyph
        // anti-aliasing alone (identical layout, every glyph a few pixels off);
        // 0.5 % failed those while 1 % holds them, and a shifted column or a
        // missing row is still an order of magnitude above it.
        maxDiffPixelRatio: 0.01,
      });

      const axe = await new AxeBuilder({ page }).analyze();
      const ids = [...new Set(axe.violations.map((v) => v.id))].sort();
      const ratchetPath = path.join(__dirname, 'visual-peers.axe.json');
      const ratchet = existsSync(ratchetPath)
        ? (JSON.parse(readFileSync(ratchetPath, 'utf8')) as Record<string, string[]>)
        : {};
      const prev = ratchet[viewpoint.id];
      if (Array.isArray(prev)) {
        const extra = ids.filter((id) => !prev.includes(id));
        expect(extra, `${viewpoint.id} new axe violations: ${extra.join(', ')}`).toEqual([]);
      } else {
        test.info().annotations.push({
          type: 'axe-seed',
          description: ids.join(',') || '(none)',
        });
      }
    });
  }
});

/**
 * Sibling-diff — plan §7.4 step 5. Pairs are data (`VISUAL_SIBLING_PAIRS`).
 * Without operator-approved baselines this is skip, not a seed.
 */
test.describe('visual — sibling forks', () => {
  test.use({ viewport: { width: 1600, height: 900 } });

  for (const pair of VISUAL_SIBLING_PAIRS) {
    test(`${pair.a} vs ${pair.b}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'desktop only');
      test.skip(
        !existsSync(path.join(__dirname, 'visual-peers.spec.ts-snapshots')),
        'no operator-approved baselines — sibling-diff is compare, not seed',
      );
      const a = DESIGN_LAB_VIEWPOINTS.find((v) => v.id === pair.a);
      const b = DESIGN_LAB_VIEWPOINTS.find((v) => v.id === pair.b);
      expect(a, pair.a).toBeTruthy();
      expect(b, pair.b).toBeTruthy();

      await installDeskFixtures(page, a!);
      await page.goto(a!.route, { waitUntil: 'domcontentloaded' });
      await settle(page);
      await expect(page).toHaveScreenshot(snapshotName(b!), {
        fullPage: false,
        animations: 'disabled',
        caret: 'hide',
        style: HIDE_DEV_CHROME,
        mask: MASKS.map((selector) => page.locator(selector)),
        // Loose on purpose: these peers share an engine/shell, not a pixel.
        // A missing table or an empty-vs-dense fork still clears 45 %.
        maxDiffPixelRatio: 0.45,
      });
    });
  }
});
