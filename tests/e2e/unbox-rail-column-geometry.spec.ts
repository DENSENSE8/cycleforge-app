import { test, expect, type Page } from '@playwright/test';

/**
 * Unbox scan-dock — dense left-column geometry.
 *
 * Regression coverage for docs/todo/unbox-rail-dot-title-gap-handoff.md. The
 * Unboxed rail used to place the status dot absolutely near the row's left edge
 * while the title carried the deep MasterNav-label inset (pl-[4.3125rem]). That
 * combination opened a ~50px horizontal CANYON between the green dot and the
 * title ("Bose…", "Unfound PO").
 *
 * The fix converts the dot into a compact FLOW leading track (pl-2 + w-4) so the
 * title tucks one tight gap-1.5 after it (~30px column), and moves the UNBOXED
 * eyebrow + the scan-bar icon/text onto that SAME dense column — one clean dock.
 * The MasterNav "Unbox" label deliberately stays deeper (its chevron + hairline
 * + mode glyph own the chrome column above the dock).
 *
 * Playwright measures live geometry via getBoundingClientRect (not screenshots).
 * Tolerances allow ±4px for subpixel / density. Stable DOM hooks added while
 * fixing: data-rail-status-dot, data-rail-row-title, data-rail-select-box,
 * data-rail-eyebrow, data-master-nav-label.
 */

// Desktop-only: on the phone project /unbox routes to /m/*, so the Unboxed
// sidebar rail under test never mounts. (Both projects are chromium, so skip on
// the mobile *device*, not browserName.)
test.skip(({ isMobile }) => !!isMobile, 'desktop-only');

const RAIL = 'ul[aria-label="Unboxed activity"]';

/** Wait until the first rail row's stagger slide has settled (translateX ≈ 0). */
async function waitForRailSettled(page: Page): Promise<void> {
  await page.locator(`${RAIL} li[role="option"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(
    (railSel) => {
      const li = document.querySelector(`${railSel} li[role="option"]`);
      if (!li) return false;
      const tf = getComputedStyle(li).transform;
      if (!tf || tf === 'none') return true;
      const m = tf.match(/matrix\(([^)]+)\)/);
      if (!m) return true;
      return Math.abs(+m[1].split(',').map(Number)[4]) < 0.5;
    },
    RAIL,
    { timeout: 30_000 },
  );
}

interface Box {
  left: number;
  right: number;
  width: number;
  top: number;
}

interface RailGeometry {
  sectionLeft: number;
  sectionRight: number;
  button: Box | null;
  dot: Box | null;
  title: Box | null;
  eyebrow: Box | null;
  masterLabel: Box | null;
  /** Left edge of the scan input's TEXT (rect.left + border-left + padding-left). */
  scanContentLeft: number | null;
  selectedButton: Box | null;
  pencil: Box | null;
}

/** Read every column-defining edge in one round-trip, at rest. */
async function measure(page: Page): Promise<RailGeometry> {
  return page.evaluate((railSel): RailGeometry => {
    const box = (el: Element | null | undefined): Box | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const round = (n: number) => Math.round(n * 100) / 100;
      return { left: round(r.left), right: round(r.right), width: round(r.width), top: round(r.top) };
    };

    const ul = document.querySelector(railSel);
    const section = ul?.closest('section') ?? null;
    const btn = ul?.querySelector('li[role="option"] button[data-rail-row]') ?? null;
    const selectedLi = ul?.querySelector('li[role="option"][aria-selected="true"]') ?? null;
    const selectedBtn = (selectedLi?.querySelector('button[data-rail-row]') ?? btn) ?? null;

    // Scan input: the Unbox scan-dock field (unarmed placeholder starts "Ticket").
    const scanInput =
      (document.querySelector('input[placeholder^="Ticket"]') as HTMLInputElement | null) ??
      (document.querySelector('input[placeholder*="Tracking"]') as HTMLInputElement | null) ??
      (document.querySelector('form.group input[type="text"]') as HTMLInputElement | null);
    let scanContentLeft: number | null = null;
    if (scanInput) {
      const cs = getComputedStyle(scanInput);
      scanContentLeft =
        Math.round(
          (scanInput.getBoundingClientRect().left +
            parseFloat(cs.borderLeftWidth || '0') +
            parseFloat(cs.paddingLeft || '0')) *
            100,
        ) / 100;
    }

    return {
      sectionLeft: section ? Math.round(section.getBoundingClientRect().left * 100) / 100 : 0,
      sectionRight: section ? Math.round(section.getBoundingClientRect().right * 100) / 100 : 0,
      button: box(btn),
      dot: box(btn?.querySelector('[data-rail-status-dot]')),
      title: box(btn?.querySelector('[data-rail-row-title]')),
      eyebrow: box(section?.querySelector('[data-rail-eyebrow]')),
      masterLabel: box(document.querySelector('[data-master-nav-label]')),
      scanContentLeft,
      selectedButton: box(selectedBtn),
      pencil: box(
        document.querySelector('button[aria-label="Select rows for bulk actions"]') ??
          document.querySelector('button[aria-label*="select mode" i]'),
      ),
    };
  }, RAIL);
}

test.describe('unbox scan-dock dense column geometry', () => {
  test('dot hugs the left, title tucks in, eyebrow + scan share the dense column', async ({ page }) => {
    await page.goto('/unbox');
    await waitForRailSettled(page);

    const g = await measure(page);
    expect(g.button, 'row button present').not.toBeNull();
    expect(g.dot, 'status dot present').not.toBeNull();
    expect(g.title, 'row title present').not.toBeNull();
    const { button, dot, title } = g as { button: Box; dot: Box; title: Box };

    // (1) Canyon closed — the dot sits immediately before the title (house
    // gap-1.5 language). Today's ~50px regression fails loudly at ≥ 24px.
    const dotToTitle = title.left - dot.right;
    expect(dotToTitle, 'dot→title gap is a tight gap-1.5, not a canyon').toBeLessThanOrEqual(12);
    expect(dotToTitle, 'dot→title gap did not regress to the ~50px canyon').toBeLessThan(24);
    expect(dotToTitle, 'title is right of the dot (not overlapping)').toBeGreaterThan(0);

    // (2) No dead strip left of the dot — it hugs the far-left flow track
    // (pl-2 + centered w-4), never the pl-[2.9375rem] host-inset regression.
    const buttonToDot = dot.left - button.left;
    expect(buttonToDot, 'dot hugs the row left edge').toBeLessThanOrEqual(16);
    expect(buttonToDot, 'no dead strip left of the dot').toBeLessThan(32);

    // (3) Eyebrow shares the title column.
    expect(g.eyebrow, 'UNBOXED eyebrow present').not.toBeNull();
    expect(
      Math.abs((g.eyebrow as Box).left - title.left),
      'UNBOXED eyebrow shares the row-title x',
    ).toBeLessThanOrEqual(4);

    // (4) Scan text shares the title column (the chosen "one clean column").
    expect(g.scanContentLeft, 'scan input located').not.toBeNull();
    expect(
      Math.abs((g.scanContentLeft as number) - title.left),
      'scan typed text shares the row-title x',
    ).toBeLessThanOrEqual(4);

    // (5) MasterNav "now" label deliberately stays DEEPER than the dense rail
    // column (its chevron + hairline + mode glyph own the chrome column). Only
    // assert when the MasterNav header is mounted on this surface.
    if (g.masterLabel) {
      expect(
        g.masterLabel.left - title.left,
        'MasterNav label sits deeper than the dense rail column (documented offset)',
      ).toBeGreaterThanOrEqual(8);
    }
  });

  test('selection wash is edge-to-edge; pencil shares the trailing age column', async ({ page }) => {
    await page.goto('/unbox');
    await waitForRailSettled(page);

    const g = await measure(page);
    expect(g.selectedButton, 'a selected/first row button present').not.toBeNull();
    const sel = g.selectedButton as Box;

    // Warehouse list selection: full-bleed wash / ring — flush to the rail
    // section (content column pad nests inside the button, not around the ring).
    const ringGapRight = g.sectionRight - sel.right;
    expect(ringGapRight, 'selection ring flush right').toBeGreaterThanOrEqual(0);
    expect(ringGapRight, 'selection ring not inset from the pane').toBeLessThanOrEqual(2);

    const ringGapLeft = sel.left - g.sectionLeft;
    expect(ringGapLeft, 'selection ring flush left').toBeGreaterThanOrEqual(0);
    expect(ringGapLeft, 'selection ring not inset from the pane').toBeLessThanOrEqual(2);

    // Eyebrow pencil sits in the same trailing w-8 track as row age.
    if (g.pencil) {
      expect(
        Math.abs(g.pencil.right - sel.right),
        'edit pencil shares the selected row ring right edge',
      ).toBeLessThanOrEqual(6);
    }
  });

  test('edit mode — checkbox rides the leading track, no canyon reintroduced', async ({ page }) => {
    await page.goto('/unbox');
    await waitForRailSettled(page);

    // Toggle the rail into select mode via the eyebrow pencil.
    const pencil = page.locator('button[aria-label="Select rows for bulk actions"]');
    if ((await pencil.count()) === 0) {
      test.skip(true, 'Unboxed rail has no edit pencil on this surface');
    }
    await pencil.first().click();
    await page.locator(`${RAIL} [data-rail-select-box]`).first().waitFor({ state: 'visible', timeout: 10_000 });

    const geom = await page.evaluate((railSel) => {
      const box = (el: Element | null | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left * 100) / 100, right: Math.round(r.right * 100) / 100 };
      };
      const ul = document.querySelector(railSel);
      const btn = ul?.querySelector('li[role="option"] button[data-rail-row]');
      return {
        checkbox: box(btn?.querySelector('[data-rail-select-box]')),
        title: box(btn?.querySelector('[data-rail-row-title]')),
        // In edit mode the dot is swapped OUT for the checkbox (same track width).
        dotStillThere: !!btn?.querySelector('[data-rail-status-dot]'),
      };
    }, RAIL);

    expect(geom.checkbox, 'select checkbox present in edit mode').not.toBeNull();
    expect(geom.title, 'title still present in edit mode').not.toBeNull();
    expect(geom.dotStillThere, 'dot swapped out for the checkbox (no double leading glyph)').toBe(false);
    const cb = geom.checkbox as { left: number; right: number };
    const ttl = geom.title as { left: number; right: number };
    expect(ttl.left - cb.right, 'checkbox→title stays a tight gap (no canyon)').toBeLessThanOrEqual(12);
    expect(ttl.left - cb.right, 'title is right of the checkbox').toBeGreaterThan(0);
  });

  test('a reconciling refetch keeps the canyon closed', async ({ page }) => {
    await page.goto('/unbox');
    await waitForRailSettled(page);

    // Fire the refresh events the rail listens for, let it settle, re-measure.
    await page.evaluate(() => {
      ['app-refresh-data', 'receiving-unbox-refresh'].forEach((ev) =>
        window.dispatchEvent(new CustomEvent(ev)),
      );
    });
    await page.waitForTimeout(1200);
    await waitForRailSettled(page);

    const g = await measure(page);
    const { dot, title } = g as { dot: Box; title: Box };
    expect(dot, 'dot present after refetch').not.toBeNull();
    expect(title, 'title present after refetch').not.toBeNull();
    expect(
      title.left - dot.right,
      'dot→title gap stays tight after a refetch (no flash back to the canyon)',
    ).toBeLessThanOrEqual(12);
  });
});
