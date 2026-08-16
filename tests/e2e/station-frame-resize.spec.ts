import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Station three-column frame resize — Context rail | elastic Primary | Displays.
 *
 * This is the browser proof for the elastic-center cascade (Option A + the
 * far-rail yield). The pure invariants (sash caps, collapse hysteresis, the
 * directional cap flip) are unit-proved in `src/lib/right-rail/frame.test.ts`;
 * here we measure the REAL rendered geometry against what an operator sees:
 *
 *  - **The middle is the single elastic absorber.** Dragging a sash a LITTLE
 *    resizes only that rail and the CENTER absorbs — the far rail stays put
 *    (Stage 1). This is the operator's original ask (the right handle must not
 *    move the far left rail).
 *  - **The far rail yields when the middle is exhausted.** Dragging a sash FAR —
 *    past the point where the center hits its 720 floor — keeps growing the pane
 *    by shrinking the OPPOSITE rail (Stage 2). This is the follow-up ask (right
 *    panel keeps growing by eating the recents rail).
 *  - **No gray band, ever.** Displays abuts the center's right edge in flow; the
 *    center abuts the context rail. The page never scrolls sideways.
 *  - **No sudden expand/collapse.** Sweeping the viewport across the budget
 *    collapses Displays to an overlay exactly once (center then fills), and the
 *    hysteresis deadband holds it.
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

/** Context rail OPEN at its default; Displays at its default — a deterministic
 *  starting frame so both drag stages have room. */
async function forceCleanRailPrefs(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('context-panel-collapsed', 'false');
    window.localStorage.removeItem('context-panel-width');
    window.localStorage.removeItem('unbox-displays-push-width');
  });
}

async function openUnboxDisplay(page: Page, receivingId: number, lineId: number) {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('unbox-displays-pane-toggle').click();
  await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
  // Land on a leaf so sticky Back / leaf chrome mount (index alone is not enough).
  const displays = page.getByTestId('receiving-displays-push');
  const classify = displays.getByRole('button', { name: /^Classify\b/i });
  if ((await classify.count()) > 0) {
    await classify.first().click();
  } else {
    await displays.getByRole('button', { name: /more displays/i }).click();
    await page.getByRole('menuitem', { name: /Classify/i }).click();
  }
}

interface FrameGeom {
  context: { x: number; w: number; right: number } | null;
  centre: { x: number; w: number; right: number } | null;
  displays: { x: number; w: number; right: number } | null;
  displaysPosition: string | null;
  contextCollapsed: boolean;
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
    const ctx = document.querySelector('[data-context-panel]');
    return {
      context: box(ctx),
      centre: box(document.querySelector('[data-testid="unbox-station-center"]')),
      displays: box(displays),
      displaysPosition: displays ? getComputedStyle(displays).position : null,
      contextCollapsed:
        ctx?.getAttribute('data-collapsed') === 'true' ||
        !!document.querySelector('[data-testid="context-panel-expand"]'),
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    };
  });
}

const CENTER_FLOOR = 720;

/** Invariants that must hold in EVERY in-flow (pushed) state. */
function assertInFlowInvariants(g: FrameGeom, note: string) {
  expect(g.context, `${note}: context rail present`).not.toBeNull();
  expect(g.centre, `${note}: centre present`).not.toBeNull();
  expect(g.displays, `${note}: displays present`).not.toBeNull();
  // In-flow push (not overlay).
  expect(g.displaysPosition, `${note}: displays is an in-flow column`).toBe('relative');
  // The center never drops below its floor (720 × --cf-density; tolerate a
  // density zoom). It IS elastic, so there is no tight upper bound — it can be
  // much wider than 720 when the rails are narrow.
  expect(g.centre!.w, `${note}: centre holds its 720 floor`).toBeGreaterThanOrEqual(680);
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

/** Drag a sash handle by `dx` px (negative = left) in small steps, sampling geometry. */
async function dragSash(
  page: Page,
  testId: string,
  dx: number,
  steps: number,
): Promise<FrameGeom[]> {
  const sash = page.getByTestId(testId);
  const box = (await sash.boundingBox())!;
  const y = box.y + box.height / 2;
  const startX = box.x + box.width / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  const samples: FrameGeom[] = [];
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(startX + (dx * i) / steps, y, { steps: 2 });
    await page.waitForTimeout(40); // let the reactive layout settle one frame
    samples.push(await frame(page));
  }
  await page.mouse.up();
  return samples;
}

test.describe('Station frame resize — elastic center, far rail yields on demand', () => {
  test.beforeEach(async ({ page }) => {
    await forceCleanRailPrefs(page);
  });

  test('resting 3-column geometry: center holds its floor, columns flush, no band', async ({ page, request }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxDisplay(page, receivingId, lineId);

    const g = await frame(page);
    assertInFlowInvariants(g, 'resting @1680');
    // The three columns tile the row they share (no emergent gutter).
    const span = g.displays!.right - g.context!.x;
    const sum = g.context!.w + g.centre!.w + g.displays!.w;
    expect(Math.abs(sum - span), 'the three columns tile their row exactly').toBeLessThanOrEqual(2);
  });

  test('Stage 1 — a small Displays drag moves the CENTER, leaves the context rail put', async ({ page, request }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxDisplay(page, receivingId, lineId);

    const start = await frame(page);
    assertInFlowInvariants(start, 'pre-drag');

    // Grow Displays ~120px (left drag on its leading edge) — well inside the
    // center's slack, so this is Stage 1 (center absorbs, context untouched).
    const s = await dragSash(page, 'unbox-displays-push-resize', -120, 10);
    for (let i = 0; i < s.length; i += 1) assertInFlowInvariants(s[i], `drag step ${i + 1}`);

    const end = s.at(-1)!;
    // The far CONTEXT rail did NOT move (the operator's original ask).
    expect(
      Math.abs(end.context!.w - start.context!.w),
      `context rail must stay put on a small Displays drag (${start.context!.w.toFixed(1)} → ${end.context!.w.toFixed(1)})`,
    ).toBeLessThanOrEqual(2);
    // Displays actually grew, and the CENTER absorbed it (Δcenter ≈ −Δdisplays).
    const dDisplays = end.displays!.w - start.displays!.w;
    const dCentre = start.centre!.w - end.centre!.w;
    expect(dDisplays, 'the drag grew Displays').toBeGreaterThan(20);
    expect(
      Math.abs(dDisplays - dCentre),
      `the center absorbed the change (Δdisplays ${dDisplays.toFixed(1)} ≈ Δcenter ${dCentre.toFixed(1)})`,
    ).toBeLessThanOrEqual(6);
    // Monotonic — Displays only grew, the center only shrank (no jitter).
    for (let i = 1; i < s.length; i += 1) {
      expect(s[i].displays!.w, `Displays monotonic (step ${i})`).toBeGreaterThanOrEqual(s[i - 1].displays!.w - 2);
      expect(s[i].centre!.w, `center monotonic (step ${i})`).toBeLessThanOrEqual(s[i - 1].centre!.w + 2);
    }
  });

  test('Stage 2 — a far Displays drag floors the center, then the context rail yields', async ({ page, request }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxDisplay(page, receivingId, lineId);

    const start = await frame(page);
    assertInFlowInvariants(start, 'pre-drag');

    // Grow Displays as far left as it will go (leading edge → the loose ladder
    // max). Past the center-floor point this must shrink the CONTEXT rail.
    const s = await dragSash(page, 'unbox-displays-push-resize', -320, 16);
    for (let i = 0; i < s.length; i += 1) assertInFlowInvariants(s[i], `far drag step ${i + 1}`);

    const end = s.at(-1)!;
    // The center bottomed out at its floor…
    expect(end.centre!.w, 'center floored at ~720').toBeLessThanOrEqual(760);
    expect(end.centre!.w, 'center never crushed below its floor').toBeGreaterThanOrEqual(680);
    // …and the context rail yielded (shrank) so Displays could keep growing.
    expect(
      end.context!.w,
      `context rail yielded once the center floored (${start.context!.w.toFixed(1)} → ${end.context!.w.toFixed(1)})`,
    ).toBeLessThan(start.context!.w - 10);
    // Context yields MONOTONICALLY — it only shrinks, never bounces back (no jitter).
    for (let i = 1; i < s.length; i += 1) {
      expect(
        s[i].context!.w,
        `context must not jitter back up while yielding (step ${i})`,
      ).toBeLessThanOrEqual(s[i - 1].context!.w + 2);
    }
  });

  test('Stage 3 — dragging the Displays sash far enough CLOSES (parks) the context rail', async ({ page, request }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxDisplay(page, receivingId, lineId);

    const start = await frame(page);
    assertInFlowInvariants(start, 'pre-drag');
    expect(start.contextCollapsed, 'context rail starts open').toBeFalsy();

    // Drag Displays as far left as the pointer goes — past the loose cap + slack,
    // which triggers the far-rail close.
    const sash = page.getByTestId('unbox-displays-push-resize');
    const box = (await sash.boundingBox())!;
    const y = box.y + box.height / 2;
    const startX = box.x + box.width / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let i = 1; i <= 16; i += 1) {
      await page.mouse.move(startX - i * 32, y, { steps: 2 });
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(120);

    const end = await frame(page);
    // The context rail closed to its strip, and Displays grew into the freed
    // space (well past its rail-open ladder max of frame − 300 − 720).
    expect(end.contextCollapsed, 'context rail parked to its strip on the far drag').toBeTruthy();
    expect(
      end.displays!.w,
      `Displays grew past the rail-open ladder max once the rail parked (${start.displays!.w.toFixed(1)} → ${end.displays!.w.toFixed(1)})`,
    ).toBeGreaterThan(start.displays!.w + 100);
    expect(end.centre!.w, 'center still holds its floor').toBeGreaterThanOrEqual(680);
    expect(end.scrollW, 'no horizontal scroll after the far-rail close').toBeLessThanOrEqual(end.clientW + 1);
  });

  test('Stage 1 — a small context drag moves the CENTER, leaves Displays put', async ({ page, request }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxDisplay(page, receivingId, lineId);

    const start = await frame(page);
    assertInFlowInvariants(start, 'pre-context-drag');

    // Grow the context rail ~120px (trailing edge → right drag). Inside the
    // center's slack → Stage 1: center absorbs, Displays untouched.
    const s = await dragSash(page, 'context-panel-resize', 120, 10);
    for (let i = 0; i < s.length; i += 1) assertInFlowInvariants(s[i], `context drag step ${i + 1}`);

    const end = s.at(-1)!;
    expect(end.context!.w, 'context actually grew').toBeGreaterThan(start.context!.w + 20);
    // Displays did NOT move; the center absorbed the rail's growth.
    expect(
      Math.abs(end.displays!.w - start.displays!.w),
      `Displays must stay put on a small context drag (${start.displays!.w.toFixed(1)} → ${end.displays!.w.toFixed(1)})`,
    ).toBeLessThanOrEqual(2);
    const dContext = end.context!.w - start.context!.w;
    const dCentre = start.centre!.w - end.centre!.w;
    expect(
      Math.abs(dContext - dCentre),
      `the center absorbed the change (Δcontext ${dContext.toFixed(1)} ≈ Δcenter ${dCentre.toFixed(1)})`,
    ).toBeLessThanOrEqual(6);
  });

  test('viewport sweep across the budget: one clean collapse, hysteresis holds', async ({ page, request }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxDisplay(page, receivingId, lineId);

    // Wide: in-flow push, all invariants hold.
    assertInFlowInvariants(await frame(page), 'sweep wide 1680');

    // Narrow well past the budget: Displays yields to an OVERLAY (float), and the
    // centre FILLS — never a floored center with an empty band beside it.
    await page.setViewportSize({ width: 1180, height: 900 });
    await page.waitForTimeout(120);
    const collapsed = await frame(page);
    expect(collapsed.displaysPosition, 'narrow: Displays overlays instead of crushing').toBe('absolute');
    expect(
      collapsed.centre!.w,
      'the centre must FILL when Displays overlays (no gray band beside the floored center)',
    ).toBeGreaterThan(722);
    expect(collapsed.scrollW, 'no horizontal scroll while collapsed').toBeLessThanOrEqual(collapsed.clientW + 1);

    // Hysteresis: nudge back up but stay INSIDE the deadband — it must NOT reopen.
    // Close threshold rides the rail's actual 360 cost (360+720+280 = 1360),
    // reopen = 1392; 1385 sits inside the deadband (and any spine/scrollbar delta
    // only narrows the content row further below the reopen point).
    await page.setViewportSize({ width: 1385, height: 900 });
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

  test('the Displays column parks to a strip on drag-past-min, and clicking the strip restores it (left-rail parity)', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxDisplay(page, receivingId, lineId);

    const before = await frame(page);
    assertInFlowInvariants(before, 'pre-park');
    expect(before.displays!.w, 'starts as a full column').toBeGreaterThan(200);

    // Drag the Displays sash to the RIGHT (leading edge → shrink) far past its
    // min — on release this parks the whole column, exactly like dragging the
    // left rail past its own min.
    const sash = page.getByTestId('unbox-displays-push-resize');
    const box = (await sash.boundingBox())!;
    const y = box.y + box.height / 2;
    const startX = box.x + box.width / 2;
    await page.mouse.move(startX, y);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      await page.mouse.move(startX + i * 40, y, { steps: 2 });
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(150);

    // Parked: the column is a slim strip with a restore control, and the elastic
    // center reclaimed the freed width.
    const parked = page.getByTestId('receiving-displays-push');
    await expect(parked, 'the column is now the parked strip').toHaveAttribute(
      'data-displays-parked',
      '',
    );
    const parkedBox = (await parked.boundingBox())!;
    expect(parkedBox.width, 'the parked strip is slim').toBeLessThanOrEqual(48);
    const expand = page.getByTestId('unbox-displays-parked-expand');
    await expect(expand, 'the strip shows a restore control').toBeVisible();
    // The restore control sits at the BOTTOM of the strip — same seat as the
    // `→|` close / `←|` open toggle, not floating at the top-right.
    const expandBox = (await expand.boundingBox())!;
    const stripBottom = parkedBox.y + parkedBox.height;
    const expandBottom = expandBox.y + expandBox.height;
    expect(
      stripBottom - expandBottom,
      `restore control hugs the strip bottom (strip.bottom=${stripBottom.toFixed(0)} expand.bottom=${expandBottom.toFixed(0)})`,
    ).toBeLessThanOrEqual(12);
    expect(
      expandBox.y - parkedBox.y,
      'restore control is not at the top of the strip',
    ).toBeGreaterThan(parkedBox.height / 2);
    const parkedFrame = await frame(page);
    expect(
      parkedFrame.centre!.w,
      'the center reclaimed the parked column’s width',
    ).toBeGreaterThan(before.centre!.w + 100);
    expect(parkedFrame.scrollW, 'no horizontal scroll while parked').toBeLessThanOrEqual(
      parkedFrame.clientW + 1,
    );

    // Click the strip → restore to a full column (mirror of the left rail's
    // whole-strip click-to-expand).
    await parked.click();
    await page.waitForTimeout(150);
    const restored = page.getByTestId('receiving-displays-push');
    await expect(restored, 'restored — no longer parked').not.toHaveAttribute(
      'data-displays-parked',
      '',
    );
    const after = await frame(page);
    assertInFlowInvariants(after, 'post-restore');
    expect(after.displays!.w, 'restored to a full column').toBeGreaterThan(200);
  });

  test('the resize hairline paints ABOVE the leaf ← → header, and the Back chevron still takes clicks', async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1680, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    // Opening Classify drills to a Displays LEAF, which mounts the sticky
    // ← → history band — the opaque `z-header` chrome that used to clip the
    // column's leading resize hairline at the top-left.
    await openUnboxDisplay(page, receivingId, lineId);

    const back = page.getByTestId('station-displays-history-back');
    await expect(back, 'the leaf ← → header (Back chevron) is mounted').toBeVisible({
      timeout: 15_000,
    });

    const probe = await page.evaluate(() => {
      const scope = document.querySelector('[data-testid="receiving-displays-push"]');
      const hairline = scope?.querySelector('[data-testid="edge-resize-hairline"]') ?? null;
      const leaf = document.querySelector('[data-testid="station-displays-leaf-nav"]');
      const backBtn = document.querySelector('[data-testid="station-displays-history-back"]');
      if (!hairline || !leaf || !backBtn) {
        return { present: { hairline: !!hairline, leaf: !!leaf, backBtn: !!backBtn } } as const;
      }
      const zOf = (el: Element) => {
        const z = getComputedStyle(el).zIndex;
        return z === 'auto' ? 0 : Number(z);
      };
      const hr = hairline.getBoundingClientRect();
      const lr = leaf.getBoundingClientRect();
      const br = backBtn.getBoundingClientRect();
      // A point 1px INTO the 4px hairline, vertically centered on the Back
      // chevron — the exact overlap the fix must keep clickable.
      const ox = Math.round(hr.left + 1);
      const oy = Math.round(br.top + br.height / 2);
      const atOverlap = document.elementFromPoint(ox, oy);
      return {
        present: { hairline: true, leaf: true, backBtn: true },
        hairlineZ: zOf(hairline),
        leafZ: zOf(leaf),
        hairlinePointerEvents: getComputedStyle(hairline).pointerEvents,
        // Full-height seam covering the whole leaf-header band (continuous line).
        spansLeaf: hr.top <= lr.top + 0.5 && hr.bottom >= lr.bottom - 0.5,
        // Co-located with the column's leading edge (beside the Back chevron).
        seamAtEdge: Math.abs(hr.left - br.left) <= 2,
        // Under the hairline, the Back chevron is still the pointer target
        // (hairline is pointer-transparent, so elementFromPoint skips it).
        backReceivesClickUnderHairline: !!atOverlap && backBtn.contains(atOverlap),
        overlapIsNotHairline: atOverlap !== hairline,
      } as const;
    });

    expect(probe.present, 'hairline + leaf header + back chevron all mounted').toEqual({
      hairline: true,
      leaf: true,
      backBtn: true,
    });
    // THE FIX: the resize hairline stacks above the opaque leaf header band, so
    // the seam reads continuously over the Back chevron instead of being clipped.
    expect(probe.hairlineZ, 'resize hairline paints above the leaf header band').toBeGreaterThan(
      probe.leafZ!,
    );
    expect(probe.spansLeaf, 'hairline spans the full leaf-header height (unbroken seam)').toBe(true);
    expect(probe.seamAtEdge, 'hairline sits on the column leading seam by the Back chevron').toBe(
      true,
    );
    // …but it is non-interactive, so the control underneath keeps its hit target.
    expect(probe.hairlinePointerEvents, 'hairline is pointer-transparent').toBe('none');
    expect(probe.overlapIsNotHairline, 'the point over the hairline is not the hairline itself').toBe(
      true,
    );
    expect(
      probe.backReceivesClickUnderHairline,
      'the Back chevron still receives pointer events directly beneath the hairline',
    ).toBe(true);

    // And it works as a control: Playwright's click runs an actionability +
    // pointer-intercept check — if the hairline sat ON TOP with pointer events,
    // this would throw "element intercepts pointer events". It resolves because
    // the hairline is pointer-transparent, so the click reaches the chevron.
    await back.click();
    // The column survives the click (no crash); the leaf navigation is app
    // behavior we don't pin here (the cockpit may auto-re-open the step leaf).
    await expect(
      page.getByTestId('receiving-displays-push'),
      'the Displays column is still mounted after the Back click',
    ).toBeVisible();
  });
});
