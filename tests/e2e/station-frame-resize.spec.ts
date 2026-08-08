import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Station three-column frame resize — Context rail | locked-720 Primary | Displays.
 *
 * This is the browser proof for the yield-ladder rework. The pure invariants
 * (I1–I7, hysteresis) are unit-proved in `src/lib/right-rail/*.test.ts`; here we
 * measure the REAL rendered geometry against the things an operator would see go
 * wrong:
 *
 *  - **No gray detach band.** While Displays is an in-flow column, it abuts the
 *    720 centre with no leftover band — `displays.left === centre.right`. This is
 *    the failure the rework exists to kill.
 *  - **The middle never crushes.** The centre stays at its 720 lock across every
 *    drag and viewport.
 *  - **Widths adjust, and they adjust WITHOUT jitter.** A slow drag of either
 *    sash moves the two rails MONOTONICALLY (no oscillation), the pair trades
 *    inversely (Δdisplays ≈ −Δcontext), and the columns stay flush at every step.
 *  - **No sudden expand/collapse.** Sweeping the viewport across the ~1300px
 *    budget collapses Displays to an overlay exactly once (centre then fills, no
 *    band), and the hysteresis deadband holds it — it does not flap.
 *
 * Runs on the QA org (`qa-desktop`), never the dogfood tenant
 * (`.claude/rules/verify.md`), and provisions its own carton.
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-FRAME-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  const id = Number((await res.json())?.record?.id);
  expect(Number.isFinite(id) && id > 0).toBeTruthy();
  return id;
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: { receiving_id: receivingId, sku: `E2E-FRAME-${uniq()}`, item_name: 'Frame resize fixture' },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

/** Ensure the context rail is OPEN at its default and Displays fills by flex — a
 *  deterministic starting frame so coupling is live. */
async function forceCleanRailPrefs(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('context-panel-collapsed', 'false');
    window.localStorage.removeItem('context-panel-width');
    window.localStorage.removeItem('unbox-displays-push-width');
  });
}

async function openUnboxDisplay(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}&display=classify`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
}

interface FrameGeom {
  context: { x: number; w: number; right: number } | null;
  centre: { x: number; w: number; right: number } | null;
  displays: { x: number; w: number; right: number } | null;
  displaysPosition: string | null;
  scrollW: number;
  clientW: number;
}

/** Read the three columns' live rects. */
async function frame(page: Page): Promise<FrameGeom> {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, w: r.width, right: r.right };
    };
    const displays = document.querySelector('[data-testid="receiving-displays-push"]');
    return {
      context: box(document.querySelector('[data-context-panel]')),
      centre: box(document.querySelector('[data-testid="unbox-station-center"]')),
      displays: box(displays),
      displaysPosition: displays ? getComputedStyle(displays).position : null,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    };
  });
}

/** The invariants that must hold in EVERY in-flow (pushed) state. */
function assertInFlowInvariants(g: FrameGeom, note: string) {
  expect(g.context, `${note}: context rail present`).not.toBeNull();
  expect(g.centre, `${note}: centre present`).not.toBeNull();
  expect(g.displays, `${note}: displays present`).not.toBeNull();
  // In-flow push (not overlay).
  expect(g.displaysPosition, `${note}: displays is an in-flow column`).toBe('relative');
  // The lock is never crushed. Exact px is `720 × --cf-density`, so tolerate a
  // density zoom but catch a genuine crush (which would be far below this floor).
  expect(g.centre!.w, `${note}: centre held at its lock, not crushed`).toBeGreaterThanOrEqual(680);
  expect(g.centre!.w, `${note}: centre never grows past its lock while pushing`).toBeLessThanOrEqual(760);
  // NO GRAY BAND: displays abuts the centre's right edge.
  expect(
    Math.abs(g.displays!.x - g.centre!.right),
    `${note}: displays must abut the centre (no gray detach band): displays.x=${g.displays!.x.toFixed(1)} centre.right=${g.centre!.right.toFixed(1)}`,
  ).toBeLessThanOrEqual(1.5);
  // …and the centre abuts the context rail.
  expect(
    Math.abs(g.centre!.x - g.context!.right),
    `${note}: centre must abut the context rail`,
  ).toBeLessThanOrEqual(1.5);
  // The page never scrolls sideways.
  expect(g.scrollW, `${note}: no horizontal document scroll`).toBeLessThanOrEqual(g.clientW + 1);
}

test.describe('Station frame resize — no jitter, no gray band, widths adjust', () => {
  test.beforeEach(async ({ page }) => {
    await forceCleanRailPrefs(page);
  });

  test('resting 3-column geometry: middle locked, columns flush, no band', async ({ page, request }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxDisplay(page, receivingId, lineId);

    const g = await frame(page);
    assertInFlowInvariants(g, 'resting @1680');
    // The three columns fill the row they share (no emergent gutter): the sum of
    // widths equals the span from context.left to displays.right.
    const span = g.displays!.right - g.context!.x;
    const sum = g.context!.w + g.centre!.w + g.displays!.w;
    expect(Math.abs(sum - span), 'the three columns tile their row exactly').toBeLessThanOrEqual(2);
  });

  test('dragging the Displays sash: monotonic, inverse-coupled, always flush', async ({ page, request }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxDisplay(page, receivingId, lineId);

    const start = await frame(page);
    assertInFlowInvariants(start, 'pre-drag');

    const sash = page.getByTestId('unbox-displays-push-resize');
    const box = (await sash.boundingBox())!;
    const y = box.y + box.height / 2;
    const startX = box.x + box.width / 2;

    // Grab the sash and drag it LEFT in small steps (leading edge → grows Displays).
    await page.mouse.move(startX, y);
    await page.mouse.down();

    const STEPS = 10;
    const STEP_PX = 12; // 120px total — inside the ladder range at 1680
    const displaysWidths: number[] = [];
    const contextWidths: number[] = [];
    for (let i = 1; i <= STEPS; i += 1) {
      await page.mouse.move(startX - i * STEP_PX, y, { steps: 2 });
      await page.waitForTimeout(40); // let the coupled layout settle one frame
      const g = await frame(page);
      // Mid-drag the columns must STAY flush — a jittering/lagging column shows
      // up here as a transient gray band or a crushed middle.
      assertInFlowInvariants(g, `drag step ${i}`);
      displaysWidths.push(g.displays!.w);
      contextWidths.push(g.context!.w);
    }
    await page.mouse.up();

    // MONOTONIC (no jitter): each step grew Displays and shrank context, never
    // reversed. A 2px tolerance absorbs sub-pixel rounding; oscillation is larger.
    for (let i = 1; i < displaysWidths.length; i += 1) {
      expect(
        displaysWidths[i],
        `Displays width must not jitter backwards on a left drag (step ${i}: ${displaysWidths[i - 1].toFixed(1)} → ${displaysWidths[i].toFixed(1)})`,
      ).toBeGreaterThanOrEqual(displaysWidths[i - 1] - 2);
      expect(
        contextWidths[i],
        `context width must not jitter forwards while Displays grows (step ${i})`,
      ).toBeLessThanOrEqual(contextWidths[i - 1] + 2);
    }

    // INVERSE COUPLING: over the whole drag Displays grew ≈ how much context shrank.
    const dDisplays = displaysWidths.at(-1)! - start.displays!.w;
    const dContext = start.context!.w - contextWidths.at(-1)!;
    expect(dDisplays, 'the drag actually moved the Displays width').toBeGreaterThan(20);
    expect(
      Math.abs(dDisplays - dContext),
      `Displays grew by ${dDisplays.toFixed(1)} and context shrank by ${dContext.toFixed(1)} — the trade must be inverse (middle is locked)`,
    ).toBeLessThanOrEqual(6);

    // The middle is LOCKED — its width did not move across the whole drag.
    const end = await frame(page);
    expect(
      Math.abs(end.centre!.w - start.centre!.w),
      `the 720 lock must not move during the drag (${start.centre!.w.toFixed(1)} → ${end.centre!.w.toFixed(1)})`,
    ).toBeLessThanOrEqual(2);
  });

  test('dragging the context sash inverse-trades Displays (flex follows, no band)', async ({ page, request }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxDisplay(page, receivingId, lineId);

    const start = await frame(page);
    assertInFlowInvariants(start, 'pre-context-drag');

    const sash = page.getByTestId('context-panel-resize');
    const box = (await sash.boundingBox())!;
    const y = box.y + box.height / 2;
    const startX = box.x + box.width / 2;

    // Drag the context (trailing) sash RIGHT → grows context, shrinks Displays.
    await page.mouse.move(startX, y);
    await page.mouse.down();
    const displaysWidths: number[] = [];
    for (let i = 1; i <= 8; i += 1) {
      await page.mouse.move(startX + i * 12, y, { steps: 2 });
      await page.waitForTimeout(40);
      const g = await frame(page);
      assertInFlowInvariants(g, `context drag step ${i}`);
      displaysWidths.push(g.displays!.w);
    }
    await page.mouse.up();

    // Displays (flex-1 leftover) shrinks monotonically as context grows.
    for (let i = 1; i < displaysWidths.length; i += 1) {
      expect(
        displaysWidths[i],
        `Displays must shrink smoothly as context grows (step ${i})`,
      ).toBeLessThanOrEqual(displaysWidths[i - 1] + 2);
    }
    const end = await frame(page);
    expect(end.context!.w, 'context actually grew').toBeGreaterThan(start.context!.w + 20);
    assertInFlowInvariants(end, 'post-context-drag');
  });

  test('viewport sweep across the budget: one clean collapse, hysteresis holds', async ({ page, request }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxDisplay(page, receivingId, lineId);

    // Wide: in-flow push, all invariants hold.
    assertInFlowInvariants(await frame(page), 'sweep wide 1680');

    // Narrow well past the budget: Displays yields to an OVERLAY (float), and the
    // centre FILLS — never a locked 720 with an empty band beside it.
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.waitForTimeout(120);
    const collapsed = await frame(page);
    expect(collapsed.displaysPosition, 'narrow: Displays overlays instead of crushing').toBe('absolute');
    expect(
      collapsed.centre!.w,
      'the centre must FILL when Displays overlays (no gray band beside a locked 720)',
    ).toBeGreaterThan(722);
    expect(collapsed.scrollW, 'no horizontal scroll while collapsed').toBeLessThanOrEqual(collapsed.clientW + 1);

    // Hysteresis: nudge back up but stay INSIDE the deadband (just above the
    // close threshold) — it must NOT reopen yet (that flap is the bug).
    await page.setViewportSize({ width: 1315, height: 900 });
    await page.waitForTimeout(120);
    expect(
      (await frame(page)).displaysPosition,
      'inside the deadband Displays must not flap back open',
    ).toBe('absolute');

    // Clear the deadband → it reopens to an in-flow column, still flush.
    await page.setViewportSize({ width: 1680, height: 900 });
    await page.waitForTimeout(150);
    assertInFlowInvariants(await frame(page), 'sweep back wide');
  });
});
