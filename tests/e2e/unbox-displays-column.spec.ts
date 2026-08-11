import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Unbox Displays push column — the surface lane E created when it emptied the
 * tab strip out of the workbench body.
 *
 * What this pins, and why each one is the thing that would actually break:
 *
 *  1. **The centre stays empty of tabs.** The whole point of the lane. A
 *     regression here looks like the strip quietly coming back.
 *  2. **The bottom CTA never changes with a right-panel selection.** This is the
 *     coupling lane E cut (`UNBOX_TAB_TERMINAL`): selecting a display used to
 *     re-label the primary at the bottom of the screen, which is cross-region
 *     action-at-a-distance. Asserted byte-for-byte, not eyeballed.
 *  3. **One right-edge surface at a time.** Displays / Ticket / Claim / tool /
 *     `detail:receiving` are mutually exclusive (`source-of-truth.md` →
 *     Right-rail modality). Opening Claim must take the edge.
 *  4. **Displays are session-local.** Leaf selection is React state (Arrival
 *     parity) — a reload starts with the column closed; no `?display=` wire.
 *
 * Runs on the QA org (`qa-desktop`), never the dogfood tenant
 * (`.claude/rules/verify.md`) — and provisions the exact carton it asserts on
 * rather than hunting for one, so nothing depends on today's tenant data.
 */

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-DISPLAYS-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
  });
  expect(res.ok(), `receiving-entry ${res.status()}: ${await res.text()}`).toBeTruthy();
  const id = Number((await res.json())?.record?.id);
  expect(Number.isFinite(id) && id > 0).toBeTruthy();
  return id;
}

async function addLine(request: APIRequestContext, receivingId: number): Promise<number> {
  const res = await request.post('/api/receiving/add-unmatched-line', {
    data: {
      receiving_id: receivingId,
      sku: `E2E-DISP-${uniq()}`,
      item_name: 'Displays column fixture',
    },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

async function openUnbox(page: Page, receivingId: number, lineId: number, extra = '') {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}${extra}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
}

/** Layout facts the geometry tests read. Rounded — sub-pixel is noise here. */
async function geometry(page: Page) {
  return page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), x: Math.round(r.x) };
    };
    const workspace = document.querySelector('[data-testid="receiving-workspace"]');
    const displays = document.querySelector('[data-testid="receiving-displays-push"]');
    return {
      workspace: box(workspace),
      displays: box(displays),
      displaysPosition: displays ? getComputedStyle(displays).position : null,
      // The station content column — `STATION_WORKBENCH_COLUMN` (max-w-[720px]).
      column: box(workspace?.querySelector('.max-w-\\[720px\\]') ?? null),
    };
  });
}

/**
 * The page frame must never scroll sideways. This is the invariant a squeezed
 * centre would break first, and it holds regardless of which pixel widths the
 * rail / column / ceiling happen to be today.
 */
async function expectNoHorizontalScroll(page: Page) {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, 'the page body must never scroll horizontally').toBeLessThanOrEqual(clientW);
}

/** The dock's rendered text — the thing that must not move when a tab changes. */
async function dockLabel(page: Page): Promise<string> {
  return (await page.getByTestId('sliced-action-dock').first().allInnerTexts()).join('|');
}

/**
 * Switch display the way an operator does — from the strip, the ⋮ menu, or the
 * scan-progress ring on strip `rightSlot` (Checklist is ring-only).
 * Caller must already have Displays open (←|).
 */
async function selectDisplay(page: Page, label: string) {
  if (/^checklist$/i.test(label)) {
    await page.getByTestId('unbox-displays-expand-button').click();
    return;
  }
  const displays = page.getByTestId('receiving-displays-push');
  const onStrip = displays.getByRole('button', { name: new RegExp(`^${label}\\b`, 'i') });
  if ((await onStrip.count()) > 0) {
    await onStrip.first().click();
    return;
  }
  await displays.getByRole('button', { name: /more displays/i }).click();
  await page.getByRole('menuitem', { name: label }).click();
}

/** Open Displays via the closed-state ←| pane toggle. */
async function openDisplaysViaPaneToggle(page: Page) {
  await page.getByTestId('unbox-displays-pane-toggle').click();
  await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
}

/** Open carton, then open Displays and land on a named leaf via UI. */
async function openUnboxOnDisplay(
  page: Page,
  receivingId: number,
  lineId: number,
  label: string,
) {
  await openUnbox(page, receivingId, lineId);
  await openDisplaysViaPaneToggle(page);
  await selectDisplay(page, label);
}

test.describe('Unbox Displays column', () => {
  test('the centre has no tab strip, and checklist opens from the strip progress ring', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    // The workbench body must not host the slider — it lives in the column now.
    await expect(page.getByRole('group', { name: 'Unbox displays' })).toHaveCount(0);

    // No parked ticket/Displays expand strip on the right edge.
    await expect(page.getByTestId('unbox-push-expand-strip')).toHaveCount(0);

    // Closed: ring is not mounted — open via ←|, then use the strip ring.
    await expect(page.getByTestId('unbox-displays-expand-button')).toHaveCount(0);
    await openDisplaysViaPaneToggle(page);

    const displays = page.getByTestId('receiving-displays-push');
    await expect(displays).toHaveAttribute('role', 'region');
    await expect(displays.getByRole('group', { name: 'Unbox displays' })).toBeVisible();

    const ring = page.getByTestId('unbox-displays-expand-button');
    await expect(ring).toBeVisible();
    await ring.click();

    // Checklist is ring-only — no strip Lucide cell for it.
    await expect(
      displays.getByRole('button', { name: /^checklist\b/i }),
    ).toHaveCount(0);
    await expect(ring).toHaveAttribute('data-selected', 'true');
  });

  test('selecting a display never re-labels the bottom CTA', async ({ page, request }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxOnDisplay(page, receivingId, lineId, 'Classify');

    const displays = page.getByTestId('receiving-displays-push');
    await expect(displays).toBeVisible({ timeout: 15_000 });
    const before = await dockLabel(page);
    expect(before, 'the carton terminal must render something to compare').not.toBe('');

    // Switch to a display with a very different job.
    await selectDisplay(page, 'Checklist');
    expect(new URL(page.url()).searchParams.get('display')).toBeNull();

    expect(
      await dockLabel(page),
      'the dock is carton-terminal — a right-panel click must not change it',
    ).toBe(before);
  });

  test('the open display does not survive a reload', async ({ page, request }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxOnDisplay(page, receivingId, lineId, 'Tracking');

    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByTestId('receiving-displays-push'),
      'Displays are session-local — reload starts closed',
    ).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('display')).toBeNull();
  });

  /**
   * Ruling B (2026-08-02, amended the next day) — the pane cluster is
   * CARTON-scoped; the panel closes itself from its own top-left.
   *
   * The first version of this ruling gated `close · up · down` on `railOpen` as
   * one unit. That was right about `close` and wrong about the pair, because the
   * three were never one thing: `→|` closed the whole CARTON while wearing the
   * panel's glyph, sitting in the open panel's corner, and mounting only when
   * that panel was up. Every signal said "collapse this panel" except the
   * behavior, and an operator who reached for it lost their carton.
   *
   * So the dismiss moved into the column's own header band and closes the
   * column; `↑ ↓` step the carton (utility rail when closed, column header when
   * open); the procedure ring lives on the Displays strip `rightSlot`.
   *
   * The assertion that matters most is the LAST one: clicking the panel's
   * dismiss must leave the carton open. Everything above it is geometry, and
   * geometry is what a screenshot already covers.
   */
  test('the panel closes from its own top-left; the carton survives it', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    const paneOpen = page.getByTestId('unbox-displays-pane-toggle');
    const prev = page.getByTestId('unbox-carton-prev');
    const next = page.getByTestId('unbox-carton-next');
    const panelClose = page.getByTestId('unbox-push-close');

    // At rest: ←| + carton cursor. Ring mounts only while Displays is open.
    await expect(paneOpen).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('unbox-displays-expand-button')).toHaveCount(0);
    await expect(prev, 'the cursor steps the CARTON, not the column').toBeVisible();
    await expect(next).toBeVisible();
    await expect(
      panelClose,
      'no column is open, so there is no column to dismiss',
    ).toHaveCount(0);

    await paneOpen.click();
    const column = page.getByTestId('receiving-displays-push');
    await expect(column).toBeVisible({ timeout: 15_000 });

    const ring = page.getByTestId('unbox-displays-expand-button');
    await expect(ring).toBeVisible();

    // Open: the dismiss appears at the COLUMN's top-left — left of the column's
    // own midpoint, and left of the strip progress ring.
    await expect(panelClose).toBeVisible();
    // It names the REGION, not the occupant: one control closes all four push
    // surfaces, so "Hide displays" would be false on three of them. Tooltip and
    // accessible name read from the same constant.
    await expect(panelClose).toHaveAttribute('aria-label', 'Hide right panel');
    const closeBox = (await panelClose.boundingBox())!;
    const columnBox = (await column.boundingBox())!;
    const ringOpen = (await ring.boundingBox())!;
    expect(
      closeBox.x,
      'the dismiss belongs to the column’s LEFT edge, not the pane’s right corner',
    ).toBeLessThan(columnBox.x + columnBox.width / 2);
    expect(closeBox.x, 'it sits inside the column it closes').toBeGreaterThanOrEqual(
      columnBox.x - 1,
    );
    expect(closeBox.x, 'same row as the ring, opposite end').toBeLessThan(ringOpen.x);

    // THE RULING. Click the dismiss: the column goes, the carton stays. Before
    // this change the same click dropped the operator back to the browse table.
    await panelClose.click();
    await expect(column).toHaveCount(0);
    await expect(
      page.getByTestId('receiving-workspace'),
      'closing the panel must not close the carton — this is the whole ruling',
    ).toBeVisible();
    await expect(
      page.getByTestId('unbox-displays-expand-button'),
      'ring unmounts with Displays — re-open via ←|',
    ).toHaveCount(0);
    await expect(paneOpen, '←| must still be able to re-open the column').toBeVisible();
    await expect(prev, 'the carton cursor outlives the column').toBeVisible();
    await paneOpen.click();
    await expect(column).toBeVisible({ timeout: 15_000 });
  });

  /**
   * The push column's two header rows share the LEFT gutter; the strip's
   * right cluster ends with ⋮ then the procedure progress ring (`rightSlot`).
   *
   * Asserted on the `<svg>` boxes, not the buttons: the button boxes are
   * deliberately different sizes (28px shell control, 26px icon cell, 28px
   * ring). 1px is sub-pixel rounding only — the shell's `-ml-px` pays off the
   * 28-vs-26 difference on the leading edge.
   *
   * This lives in the real runner because it is a layout claim, and a layout
   * claim read off the source is a guess (`verify.md` → Measure in the real
   * runner). A static guard cannot see a negative margin cancel a parent's
   * padding.
   */
  test('both header rows share the left gutter; ring sits right of ⋮', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);
    await openDisplaysViaPaneToggle(page);

    const marks = await page.evaluate(() => {
      const glyph = (el: Element | null | undefined) => {
        const r = el?.querySelector('svg')?.getBoundingClientRect();
        return r ? { l: r.left, r: r.right } : null;
      };
      const col = document.querySelector('[data-testid="receiving-displays-push"]');
      const buttons = Array.from(col?.querySelectorAll('button') ?? []);
      return {
        close: glyph(document.querySelector('[data-testid="unbox-push-close"]')),
        ring: glyph(document.querySelector('[data-testid="unbox-displays-expand-button"]')),
        firstTab: glyph(col?.querySelector('[role="group"] button')),
        more: glyph(
          buttons.find((b) => /more displays/i.test(b.getAttribute('aria-label') ?? '')),
        ),
      };
    });

    expect(marks.close, 'the shell band must render its dismiss').not.toBeNull();
    expect(marks.ring, 'the ring mounts on the Displays strip rightSlot').not.toBeNull();
    expect(marks.firstTab, 'the strip must have at least one tab cell').not.toBeNull();
    expect(marks.more, 'this fixture must have enough tabs to overflow').not.toBeNull();

    expect(
      Math.abs(marks.close!.l - marks.firstTab!.l),
      'row 1 `→|` and row 2 first tab must start on ONE left column',
    ).toBeLessThanOrEqual(1);
    expect(
      marks.ring!.l,
      'procedure ring sits to the RIGHT of the ⋮ overflow peer',
    ).toBeGreaterThan(marks.more!.r - 1);
  });

  /**
   * The band's `→|` lands on the occupant's CONTENT gutter — measured as INK.
   *
   * This is the assertion the test above could not make, and the reason the
   * `→|` kept being reported as misaligned against a suite that passed. Two
   * blind spots, both closed here:
   *
   *  1. **It measured the wrong occupant.** Displays is the only one of the four
   *     push surfaces whose first row is *also* a glyph in a box, so it was
   *     indented by the same ~8px and the two agreed with each other while both
   *     missed the card border below them. Claim / the tool bodies open with a
   *     text heading, whose ink IS the gutter — there the `→|` sat a visible 8px
   *     to its right. The band lives in the shared shell, so tuning it to the
   *     one surface where the defect cancels is how it shipped wrong.
   *  2. **It measured boxes.** `getBoundingClientRect()` on an `<svg>` returns
   *     the 14px element box, not the drawn extent, so it reports "aligned" for
   *     a mark the operator can see is not. `getBBox()` is the ink, in viewBox
   *     units — scale it and subtract half the stroke.
   *
   * Tolerance is 2px, not 1: the gutter is shared by a stroked glyph, a text
   * baseline box and a 1px border, and sub-pixel disagreement between those is
   * not a defect. 8px is.
   */
  test('the shell band’s dismiss sits on the occupant’s own content gutter', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    // Claim via UI — Ticket nest, not a URL deep-link.
    await openUnbox(page, receivingId, lineId);
    await page.getByRole('button', { name: /File claim|claim/i }).first().click();
    await expect(page.getByTestId('receiving-claim-panel')).toBeVisible({ timeout: 15_000 });

    const measured = await page.evaluate(() => {
      const col =
        document.querySelector('[data-testid="receiving-displays-push"]') ??
        document.querySelector('[data-testid="receiving-claim-panel"]')!;
      const colLeft = col.getBoundingClientRect().left;

      const svg = document
        .querySelector('[data-testid="unbox-push-close"]')
        ?.querySelector('svg') as SVGGraphicsElement | null;
      if (!svg) return null;
      const svgRect = svg.getBoundingClientRect();
      const units = (svg as unknown as SVGSVGElement).viewBox?.baseVal?.width || 24;
      const scale = svgRect.width / units;
      const stroke = parseFloat(getComputedStyle(svg).strokeWidth || '2') || 2;
      // Ink, not box: geometry bbox less half the stroke, scaled to the render.
      const glyphInk = svgRect.left + (svg.getBBox().x - stroke / 2) * scale - colLeft;

      // The occupant's first line of real text, below the band.
      const band = document.querySelector('[data-testid="unbox-push-close"]')!.closest('div')!;
      const body = band.nextElementSibling!;
      const firstText = Array.from(body.querySelectorAll('*'))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          return Array.from(el.childNodes).some(
            (n) => n.nodeType === 3 && (n.textContent ?? '').trim().length > 0,
          );
        })
        .map((el) => ({
          text: (el.textContent ?? '').trim().slice(0, 24),
          left: el.getBoundingClientRect().left - colLeft,
          top: el.getBoundingClientRect().top,
        }))
        .sort((a, b) => a.top - b.top)[0];

      return { glyphInk, firstText };
    });

    expect(measured, 'the band must render its dismiss over the Claim occupant').not.toBeNull();
    expect(measured!.firstText, 'the Claim occupant must open with a heading').toBeTruthy();
    expect(
      Math.abs(measured!.glyphInk - measured!.firstText.left),
      `the →| ink (${measured!.glyphInk.toFixed(1)}) must sit on the gutter of "${
        measured!.firstText.text
      }" (${measured!.firstText.left.toFixed(1)}) — a box that lands on the gutter draws its mark ~8px inside it`,
    ).toBeLessThanOrEqual(2);
  });

  /**
   * Ruling A (2026-08-02) — Package Pairing is a DISPLAY, and the carton's empty
   * `# ----` chip is its deep link. The PO tab must already be selected on
   * arrival: `CartonMatchHub` subscribes to the open-PO event on MOUNT, so the
   * dispatch is deferred one frame. Remove the `requestAnimationFrame` and the
   * display still opens — on whichever tab it defaults to — which is exactly the
   * kind of regression a screenshot passes.
   */
  test('the carton # ---- chip opens the pairing display on its PO tab', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    // An unmatched carton has no Zoho PO, so the chip renders the quiet em dash
    // and activates edit on click (`IdentityLinkChip` → `emptyEditActivate`).
    await openUnbox(page, receivingId, lineId);

    await expect(page.getByTestId('receiving-displays-push')).toHaveCount(0);
    await page.getByRole('button', { name: /^link po$/i }).first().click();

    const displays = page.getByTestId('receiving-displays-push');
    await expect(displays, 'the chip opens the DISPLAY — pairing left the centre').toBeVisible({
      timeout: 15_000,
    });
    await expect(page).not.toHaveURL(/display=/);
    await expect(
      displays.getByRole('tab', { name: /^PO$/ }),
      'the deferred dispatch must land on a mounted hub, or the PO tab stays unselected',
    ).toHaveAttribute('aria-selected', 'true');

    // Exactly ONE pairing hub on the page. The column is a descendant of the
    // workspace, so "not in the centre" is asserted as cardinality: a second PO
    // tab means pairing is mounted twice — the centre copy is back.
    await expect(
      page.getByRole('tab', { name: /^PO$/ }),
      'a control on the right edge must not also open a surface in the centre',
    ).toHaveCount(1);
  });

  test('Claim takes the right edge — one secondary surface at a time', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnboxOnDisplay(page, receivingId, lineId, 'Classify');
    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /claim/i }).first().click();

    await expect(page.getByTestId('receiving-claim-panel')).toBeVisible({ timeout: 15_000 });
    // Claim nests under Ticket Displays — column stays; classify leaf yields to claim nest.
    expect(
      new URL(page.url()).searchParams.get('display'),
      'Displays leaf selection must not write ?display=',
    ).toBeNull();
  });

  /**
   * Geometry — asserted as INVARIANTS, not sampled pixels (`verify.md` → measure
   * in the real runner; assert the invariant, not a sample). Measured
   * 2026-08-01 at 1440×900 for the record, so nobody re-measures to find out
   * whether the column is survivable:
   *
   *   closed            centre column 720 (its max)
   *   open @420 default centre column 636
   *   open @560 ceiling centre column 496
   *   narrow 900        Displays overlays; workspace width unchanged at 524
   *
   * No configuration produced horizontal document scroll.
   */
  test('pushes on desktop: the workspace holds, the content column yields', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);

    await openUnbox(page, receivingId, lineId);
    const closed = await geometry(page);

    await openUnboxOnDisplay(page, receivingId, lineId, 'Classify');
    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
    const open = await geometry(page);

    // Push, not overlay: the column takes real in-flow width at desktop.
    expect(open.displaysPosition).toBe('relative');
    // The workbench host is unchanged — the column is squeezed from INSIDE it,
    // so the page frame never reflows when a display opens.
    expect(open.workspace?.w).toBe(closed.workspace?.w);
    // …and the squeeze lands on the content column, which is what may yield.
    expect(open.column!.w).toBeLessThan(closed.column!.w);
    expect(open.column!.w).toBeGreaterThan(0);

    await expectNoHorizontalScroll(page);
  });

  test('overlays below 1024 rather than crushing the carton', async ({ page, request }) => {
    // The narrow path was proven for Ticket / Claim but never exercised for
    // Displays — at 900 a 420px push column would leave ~104px of carton.
    await page.setViewportSize({ width: 900, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);

    await openUnbox(page, receivingId, lineId);
    const closed = await geometry(page);

    await openUnboxOnDisplay(page, receivingId, lineId, 'Classify');
    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
    const open = await geometry(page);

    expect(open.displaysPosition, 'narrow must overlay, never push').toBe('absolute');
    expect(
      open.workspace?.w,
      'an overlay is out of flow — the carton keeps its width',
    ).toBe(closed.workspace?.w);

    await expectNoHorizontalScroll(page);
  });

  test('dragged to its width ceiling, the page still does not scroll sideways', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    // Seed the persisted resize preference at the 560 ceiling — the tightest
    // centre an operator can produce without resizing the browser.
    await page.addInitScript(() => {
      window.localStorage.setItem('unbox-displays-push-width', '560');
    });

    await openUnboxOnDisplay(page, receivingId, lineId, 'Classify');
    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });

    const open = await geometry(page);
    expect(open.displays!.w).toBeGreaterThan(500);
    expect(open.column!.w).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page);
  });
});
