import { test, expect, type Page } from '@playwright/test';

/**
 * Frame baseline — the measured "where the pixels are today" table for
 * `docs/todo/one-wrapper-dual-right-rail-PLAN.md` Phase 0.
 *
 * Every width claim in that plan is verified here with real
 * `getBoundingClientRect` values in the real runner, at stated viewports, on the
 * QA org — never by reading CSS (`.claude/rules/verify.md` → Measure in the real
 * runner). It changes no product code; it only records the starting point that
 * Phase 1's clamping will be judged against.
 *
 * Surface: To-ship orders (`/shipping/orders`) — the desk lane Phases 2–4 land
 * on, and a **rail-less** surface (Pattern E), so `context` reads null by design
 * rather than by failure.
 *
 * States: no panel · one panel (Band-3 "Show inspector" → the View-only shell).
 */

const VIEWPORTS = [1280, 1440, 1920] as const;

interface FrameGeom {
  frame: number | null;
  spine: number | null;
  context: number | null;
  center: number | null;
  inspector: number | null;
  scrollW: number;
  clientW: number;
}

/**
 * The content ROW is what `ResponsiveLayout` publishes to the frame store, and
 * it carries no attribute of its own — it is `main`'s only element child. Read
 * it positionally rather than adding a test hook, because Phase 0 changes no
 * product code.
 */
async function frame(page: Page): Promise<FrameGeom> {
  return page.evaluate(() => {
    const w = (el: Element | null | undefined) =>
      el ? Math.round(el.getBoundingClientRect().width) : null;
    const row = document.querySelector('main')?.firstElementChild ?? null;
    // The center is the content row's own work column — the rail's sibling.
    const railHost = document.querySelector('[data-context-panel]')?.parentElement ?? null;
    const center = railHost
      ? railHost.lastElementChild
      : (row?.firstElementChild ?? null);
    return {
      frame: w(row),
      spine: w(document.querySelector('[data-sidebar-nav-column]')),
      context: w(document.querySelector('[data-context-panel]:not([data-collapsed="true"])')),
      center: w(center),
      inspector: w(document.querySelector('[data-right-rail-column]')),
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    };
  });
}

async function openToShip(page: Page, search = '') {
  await page.goto(`/shipping/orders${search}`);
  // The Band-3 inspector toggle is the surface's own chrome — present on every
  // To-ship tab, so it is the honest "the desk has painted" signal.
  await expect(
    page.getByRole('button', { name: /Show inspector|Hide inspector/i }).first(),
  ).toBeVisible({ timeout: 30_000 });
  // Let the ResizeObserver-driven frame store settle before measuring.
  await page.waitForTimeout(600);
}

const rows: string[] = [];

function record(viewport: number, state: string, g: FrameGeom) {
  const cell = (n: number | null) => (n == null ? '—' : String(n));
  rows.push(
    `| ${viewport} | ${state} | ${cell(g.frame)} | ${cell(g.spine)} | ${cell(g.context)} | ` +
      `${cell(g.center)} | ${cell(g.inspector)} | ` +
      `${g.scrollW > g.clientW ? 'YES' : 'no'} |`,
  );
}

test.describe('frame baseline (Phase 0)', () => {
  for (const width of VIEWPORTS) {
    test(`measures the desk frame at ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });

      // ── State 1: no panel ────────────────────────────────────────────────
      await openToShip(page);
      const noPanel = await frame(page);
      record(width, 'no panel', noPanel);
      expect(noPanel.frame, 'content row must measure').toBeGreaterThan(0);

      // ── State 2: one panel (Band-3 Show inspector → View-only shell) ──────
      const toggle = page.getByRole('button', { name: /Show inspector/i }).first();
      if (await toggle.count()) {
        await toggle.click();
        await page.waitForTimeout(600);
      }
      const onePanel = await frame(page);
      record(width, 'one panel', onePanel);
    });
  }

  test.afterAll(() => {
    // eslint-disable-next-line no-console
    console.log(
      '\n| viewport | state | frame | spine | context | center | inspector | h-scroll |\n' +
        '|---|---|---|---|---|---|---|---|\n' +
        rows.join('\n') +
        '\n',
    );
  });
});
