import { test, expect, type Page } from '@playwright/test';

/**
 * ONE ground plane per page — regression coverage for
 * docs/todo/unbox-shared-host-rail-background-HANDOFF.md.
 *
 * The page ground used to be painted by three unrelated modules stacked on top
 * of each other: `appContentShellClass`'s `<main>`, `ContextPanelLayout`'s host
 * (which under receiving also carries the `.app-wash` gradient), and
 * `DashboardScrollShell` — twice, on both its outer column and its scroll body.
 * Because the inner fills were OPAQUE and flat, they covered the host's wash
 * gradient everywhere except the ~20px outset gutter, so the rail edge showed a
 * visible tone seam (flat canvas beside gradient-tinted canvas).
 *
 * The invariant now: `<main>` owns the single ground fill, the receiving host
 * layers the wash on top of it, and **nothing between that host and real
 * content repaints the ground color**. Cards (`bg-surface-card`) are a
 * different plane and are expected — the assertion targets ground-COLORED
 * full-bleed fills specifically, which is the redundant-wrapper signature.
 *
 * Measures live computed styles, never classnames: the source guards already
 * pin the class strings, so this proves the rendered pixels.
 */

test.skip(({ isMobile }) => !!isMobile, 'desktop-only');

const CONTEXT_PANEL = 'main [data-context-panel]';

async function gotoSurface(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 45_000 });
  // Client-only shell chunk (ssr:false) + wash CSS vars — settle before measuring.
  await page.waitForTimeout(4_000);
}

interface GroundReport {
  mainBg: string;
  mainPaints: boolean;
  mainHasWash: boolean;
  hostBg: string | null;
  /** The layout host must carry NO background of its own. */
  hostPaints: boolean;
  /** Ground-colored full-bleed fills nested inside the workspace (must be 0). */
  redundantGroundFills: Array<{ cls: string; bg: string; w: number; h: number }>;
  /** Does one element paint continuously from the gutter into the workspace? */
  continuousGround: boolean | null;
  samplePainters: string[];
}

async function readGround(page: Page): Promise<GroundReport> {
  return page.evaluate((panelSel) => {
    const isOpaque = (cs: CSSStyleDeclaration) =>
      !/rgba?\([^)]*,\s*0\)$/.test(cs.backgroundColor);
    const paints = (cs: CSSStyleDeclaration) => isOpaque(cs) || cs.backgroundImage !== 'none';

    const main = document.querySelector('main') as HTMLElement;
    const mainCs = getComputedStyle(main);

    const panel = document.querySelector(panelSel) as HTMLElement | null;
    const host = panel?.parentElement ?? null;
    const hostCs = host ? getComputedStyle(host) : null;
    const workspace = host?.lastElementChild as HTMLElement | null;

    // `<main>` (appContentShellClass) is the one background component.
    const groundColor = mainCs.backgroundColor;

    const redundantGroundFills: Array<{ cls: string; bg: string; w: number; h: number }> = [];
    let continuousGround: boolean | null = null;
    const samplePainters: string[] = [];

    if (workspace) {
      const wr = workspace.getBoundingClientRect();
      // `DashboardScrollShell` is the page-body shell every workbench composes,
      // and it used to paint the ground on BOTH its outer column and its scroll
      // body. It exposes a stable test id, so assert on the node directly —
      // no size/colour heuristics to drift.
      const scroll = document.querySelector('[data-testid="dashboard-scroll"]');
      for (const el of [scroll, scroll?.parentElement].filter(Boolean) as Element[]) {
        const cs = getComputedStyle(el);
        if (!isOpaque(cs) && cs.backgroundImage === 'none') continue;
        const r = el.getBoundingClientRect();
        redundantGroundFills.push({
          cls: (el.getAttribute('class') || '').slice(0, 110),
          bg: cs.backgroundColor,
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }

      // Walk up from a hit-test point to the first painting ancestor.
      const painterAt = (x: number, y: number): Element | null => {
        let node: Element | null = document.elementFromPoint(x, y);
        while (node && node !== document.documentElement) {
          if (paints(getComputedStyle(node))) return node;
          node = node.parentElement;
        }
        return null;
      };

      // Sample inside the workspace's reserved outset gutter (CONTEXT_PANEL_
      // WORKSPACE_OUTSET_GUTTER_CLASS = pl-5). Points nearer the rail land on
      // the outset resize handle — a panel CHILD — so they resolve to the
      // panel, not the ground; start past it and stay inside the padding.
      const y = Math.round(wr.top + wr.height / 2);
      const probes = [16, 18].map((dx) => painterAt(Math.round(wr.left + dx), y));
      probes.forEach((el, i) =>
        samplePainters.push(
          `x+${[16, 18][i]}=${(el?.getAttribute('class') || el?.tagName || 'none').slice(0, 60)}`,
        ),
      );
      // The ground under the workspace gutter must BE `<main>` itself — no
      // nested wrapper (not even the context host) re-paints it.
      continuousGround = probes.every((el) => el !== null && el === main);
    }

    return {
      mainBg: mainCs.backgroundColor,
      mainPaints: paints(mainCs),
      mainHasWash: mainCs.backgroundImage.includes('gradient'),
      hostBg: hostCs ? hostCs.backgroundColor : null,
      hostPaints: hostCs ? paints(hostCs) : false,
      redundantGroundFills,
      continuousGround,
      samplePainters,
    };
  }, CONTEXT_PANEL);
}

test.describe('one SoT ground plane — no stacked background wrappers', () => {
  test('/unbox: the receiving host is the single continuous ground behind rail + workspace', async ({
    page,
  }) => {
    await gotoSurface(page, '/unbox');
    const g = await readGround(page);

    // <main> owns the base ground so nothing below it has to invent one.
    expect(g.mainPaints, '<main> (appContentShellClass) paints the base ground').toBe(true);

    // The wash lives there too — not on a receiving-only host variant.
    expect(g.mainHasWash, '<main> carries the .app-wash gradient').toBe(true);

    // The context host is layout-only; it must not paint a second ground.
    expect(g.hostPaints, 'CONTEXT_PANEL_HOST carries no background of its own').toBe(false);

    // THE regression: no nested wrapper repaints the ground color full-bleed.
    expect(
      g.redundantGroundFills,
      `DashboardScrollShell must not paint a ground — <main> owns it (found: ${JSON.stringify(g.redundantGroundFills)})`,
    ).toEqual([]);

    // The ground under the workspace gutter IS the host — no nested repaint.
    expect(
      g.continuousGround,
      `the host itself paints the workspace gutter (${g.samplePainters.join(' | ')})`,
    ).toBe(true);
  });

  test('/unbox: the ground never equals card white (depth needs a real step)', async ({ page }) => {
    await gotoSurface(page, '/unbox');
    const probe = await page.evaluate((panelSel) => {
      const panel = document.querySelector(panelSel) as HTMLElement;
      const main = document.querySelector('main') as HTMLElement;
      return {
        ground: getComputedStyle(main).backgroundColor,
        card: getComputedStyle(panel).backgroundColor,
        washTo: getComputedStyle(document.documentElement)
          .getPropertyValue('--ds-wash-to')
          .trim(),
        canvasToken: getComputedStyle(document.documentElement)
          .getPropertyValue('--ds-color-background-canvas')
          .trim(),
      };
    }, CONTEXT_PANEL);

    // tokens/shadows.ts — "depth needs a ground plane": canvas must sit a real
    // step BELOW card white, or elevation has nothing to cast onto. The mint
    // wash used to terminate on --ds-color-background-surface (#ffffff).
    expect(probe.ground, 'page ground is not identical to the rail card fill').not.toBe(probe.card);
    expect(probe.washTo, 'wash terminates on canvas, never card white').toBe(probe.canvasToken);
  });

  test('/dashboard: a non-receiving route still has a ground (body white never shows through)', async ({
    page,
  }) => {
    await gotoSurface(page, '/dashboard');
    const g = await readGround(page);

    expect(g.mainPaints, '<main> paints the ground on non-wash routes too').toBe(true);
    expect(
      g.redundantGroundFills,
      `DashboardScrollShell must not paint a ground on /dashboard (found: ${JSON.stringify(g.redundantGroundFills)})`,
    ).toEqual([]);

    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(g.mainBg, '<main> ground is a real step below the white body chrome').not.toBe(bodyBg);
  });
});
