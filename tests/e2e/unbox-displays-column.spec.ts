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
 *  4. **`?display=` is durable.** The column's tab survives a reload, which is
 *     the gap lane E2 closed.
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
 * scan-progress ring (Checklist is ring-only).
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

test.describe('Unbox Displays column', () => {
  test('the centre has no tab strip, and the column opens from the parked strip', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    // The workbench body must not host the slider — it lives in the column now.
    await expect(page.getByRole('group', { name: 'Unbox displays' })).toHaveCount(0);

    const strip = page.getByTestId('unbox-push-expand-strip');
    await expect(strip).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('unbox-displays-expand-button').click();

    const displays = page.getByTestId('receiving-displays-push');
    await expect(displays).toBeVisible({ timeout: 15_000 });
    await expect(displays).toHaveAttribute('role', 'region');
    await expect(displays.getByRole('group', { name: 'Unbox displays' })).toBeVisible();
    // Checklist is ring-only — no strip cell for it.
    await expect(
      displays.getByRole('button', { name: /^checklist\b/i }),
    ).toHaveCount(0);
    await expect(page.getByTestId('unbox-displays-expand-button')).toHaveAttribute(
      'data-selected',
      'true',
    );
    // The strip yields the edge while a column owns it.
    await expect(strip).toHaveCount(0);
  });

  test('selecting a display never re-labels the bottom CTA', async ({ page, request }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    // Deep-link straight onto a display — also proves `?display=` opens the column.
    await openUnbox(page, receivingId, lineId, '&display=classify');

    const displays = page.getByTestId('receiving-displays-push');
    await expect(displays).toBeVisible({ timeout: 15_000 });
    const before = await dockLabel(page);
    expect(before, 'the carton terminal must render something to compare').not.toBe('');

    // Switch to a display with a very different job.
    await selectDisplay(page, 'Checklist');
    await expect(page).toHaveURL(/display=checklist/);

    expect(
      await dockLabel(page),
      'the dock is carton-terminal — a right-panel click must not change it',
    ).toBe(before);
  });

  test('the open display survives a reload', async ({ page, request }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId, '&display=tracking');

    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByTestId('receiving-displays-push'),
      'a reload must land on the same display — that is what ?display= is for',
    ).toBeVisible({ timeout: 15_000 });
    expect(new URL(page.url()).searchParams.get('display')).toBe('tracking');
  });

  test('Claim takes the right edge — one secondary surface at a time', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId, '&display=classify');
    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /claim/i }).first().click();

    await expect(page.getByTestId('receiving-claim-push')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('receiving-displays-push')).toHaveCount(0);
    expect(
      new URL(page.url()).searchParams.get('display'),
      'opening Claim must drop ?display= too, or a reload reopens both',
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

    await openUnbox(page, receivingId, lineId, '&display=classify');
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

    await openUnbox(page, receivingId, lineId, '&display=classify');
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

    await openUnbox(page, receivingId, lineId, '&display=classify');
    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });

    const open = await geometry(page);
    expect(open.displays!.w).toBeGreaterThan(500);
    expect(open.column!.w).toBeGreaterThan(0);
    await expectNoHorizontalScroll(page);
  });
});
