import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import path from 'path';

/**
 * Unbox flush display — Phase 5 geometry + AI ↔ station-push mutual yield.
 *
 * Pins the handoff in `docs/todo/unbox-flush-display-REMAINING-HANDOFF.md`:
 *  1. Context rail + sunken center are flush (no outer margin islands).
 *  2. Station push is flush beside the center (no my-2 / pr-2 gutters).
 *  3. Center floor stays usable with push open.
 *  4. Opening AI yields every Unbox station push (Claim used as the push —
 *     Ticket needs a linked provider ticket).
 *  5. Opening a station push closes AI.
 *
 * QA org only (`qa-desktop` / storage state). Geometry via getBoundingClientRect,
 * not screenshots.
 */

const QA_STORAGE = path.join(__dirname, '..', '.auth', 'qa-admin.json');
test.use({ storageState: QA_STORAGE });

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

import { STATION_WORKBENCH_LOCK_PX } from '@/lib/station/workbench-layout';

/** Station center floor — the elastic center holds at/above this (never below). */
const STATION_CENTER_LOCK_PX = STATION_WORKBENCH_LOCK_PX;

async function hasQaSession(request: APIRequestContext): Promise<boolean> {
  const probe = await request.get('/api/receiving-lines?view=recent&limit=1');
  return probe.ok();
}

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-FLUSH-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
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
      sku: `E2E-FLUSH-${uniq()}`,
      item_name: 'Flush display fixture',
    },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

async function openUnbox(page: Page, receivingId: number, lineId: number, extra = '') {
  await page.goto(`/unbox?openReceivingId=${receivingId}&lineId=${lineId}${extra}`);
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('unbox-station-center')).toBeVisible({ timeout: 15_000 });
}

async function openDisplaysLeaf(page: Page, label: string) {
  await page.getByTestId('unbox-displays-pane-toggle').click();
  await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
  const displays = page.getByTestId('receiving-displays-push');
  const onStrip = displays.getByRole('button', { name: new RegExp(`^${label}\\b`, 'i') });
  if ((await onStrip.count()) > 0) {
    await onStrip.first().click();
  } else {
    await displays.getByRole('button', { name: /more displays/i }).click();
    await page.getByRole('menuitem', { name: new RegExp(label, 'i') }).click();
  }
}

interface FlushGeometry {
  context: { left: number; right: number; top: number; bottom: number; width: number } | null;
  workspace: { left: number; right: number; top: number; bottom: number; width: number } | null;
  push: { left: number; right: number; top: number; bottom: number; width: number } | null;
  /** Computed margin on the context panel column (should be 0 on flush planes). */
  contextMargin: string | null;
  pushMargin: string | null;
  pushPosition: string | null;
  workspaceBg: string | null;
}

async function measureFlush(page: Page, pushTestId?: string): Promise<FlushGeometry> {
  return page.evaluate((pushId) => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const round = (n: number) => Math.round(n * 100) / 100;
      return {
        left: round(r.left),
        right: round(r.right),
        top: round(r.top),
        bottom: round(r.bottom),
        width: round(r.width),
      };
    };
    const context =
      document.querySelector('[data-context-panel][data-collapsed="false"]') ??
      document.querySelector('[data-context-panel]:not([data-collapsed="true"])');
    // Center column only — `receiving-workspace` wraps center + push, so using
    // it for the seam falsely equals ~push width (~420).
    const workspace =
      document.querySelector('[data-testid="unbox-station-center"]') ??
      document.querySelector('[data-testid="receiving-workspace"]');
    // Outer host carries the testid; flush surface classes sit on the inner card
    // (outset resize grip can extend left of the card — measure the surface).
    const pushHost = pushId ? document.querySelector(`[data-testid="${pushId}"]`) : null;
    const pushSurface =
      (pushHost?.querySelector(':scope > div.border-l, :scope > div.border') as Element | null) ??
      pushHost;
    // Recessed band well is the Items body, not StationPanelRoot (flat card).
    const well =
      workspace?.querySelector('[data-testid="unbox-band-items"] > div') ??
      workspace?.querySelector('.bg-surface-station-well');
    const cs = (el: Element | null) => (el ? getComputedStyle(el) : null);
    const ccs = cs(context);
    const pcs = cs(pushSurface);
    const wcs = cs(well ?? workspace);
    return {
      context: box(context),
      workspace: box(workspace),
      push: box(pushSurface),
      contextMargin: ccs
        ? `${ccs.marginTop} ${ccs.marginRight} ${ccs.marginBottom} ${ccs.marginLeft}`
        : null,
      pushMargin: pcs
        ? `${pcs.marginTop} ${pcs.marginRight} ${pcs.marginBottom} ${pcs.marginLeft}`
        : null,
      // Position lives on the host (relative vs absolute overlay).
      pushPosition: pushHost ? getComputedStyle(pushHost).position : null,
      workspaceBg: wcs?.backgroundColor ?? null,
    };
  }, pushTestId ?? null);
}

async function openAssistant(page: Page) {
  const btn = page.getByRole('button', { name: /Open assistant/i });
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.click();
  await expect(page.getByRole('region', { name: 'Operations assistant' })).toBeVisible({
    timeout: 10_000,
  });
}

async function expectAssistantClosed(page: Page) {
  await expect(page.getByRole('region', { name: 'Operations assistant' })).toHaveCount(0);
}

test.describe('Unbox flush display — geometry + AI yield', () => {
  test.skip(({ browserName }) => browserName === 'webkit', 'Unbox workbench is desktop layout');
  test.skip(({ isMobile }) => !!isMobile, 'Unbox workbench is desktop-only');

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ] as const) {
    test(`@${viewport.width}: context + sunken center flush (no outer islands)`, async ({
      page,
      request,
    }) => {
      test.skip(!(await hasQaSession(request)), 'no QA session — run pnpm provision:qa-org');

      await page.setViewportSize(viewport);
      const receivingId = await createCarton(request);
      const lineId = await addLine(request, receivingId);
      await openUnbox(page, receivingId, lineId);

      const g = await measureFlush(page);
      expect(g.context, 'context rail must mount').toBeTruthy();
      expect(g.workspace, 'workspace must mount').toBeTruthy();

      // No decorative outer margin islands on the context column.
      expect(g.contextMargin).toMatch(/^0px 0px 0px 0px$/);

      // Flush abutment: context right edge meets workspace left (≤1px hairline).
      const gap = Math.abs((g.workspace!.left ?? 0) - (g.context!.right ?? 0));
      expect(gap, `context|center gap at ${viewport.width}`).toBeLessThanOrEqual(2);

      // Center is the sunken plane (not canvas white). Accept any non-transparent
      // computed rgb — we only forbid the old floating island layout above.
      expect(g.workspaceBg).toBeTruthy();
      expect(g.workspaceBg).not.toBe('rgba(0, 0, 0, 0)');
    });

    test(`@${viewport.width}: Displays push is flush; left stays; center hugs station lock`, async ({
      page,
      request,
    }) => {
      test.skip(!(await hasQaSession(request)), 'no QA session — run pnpm provision:qa-org');

      await page.setViewportSize(viewport);
      const receivingId = await createCarton(request);
      const lineId = await addLine(request, receivingId);
      await openUnbox(page, receivingId, lineId);
      await openDisplaysLeaf(page, 'Units');

      const push = page.getByTestId('receiving-displays-push');
      await expect(push).toBeVisible({ timeout: 15_000 });

      const g = await measureFlush(page, 'receiving-displays-push');
      expect(g.push).toBeTruthy();
      expect(g.workspace).toBeTruthy();
      expect(g.context, 'context rail must stay open beside Displays').toBeTruthy();
      expect(g.context!.width, 'context rail must not auto-park').toBeGreaterThan(200);

      // Wide viewport: in-flow flush (not absolute overlay).
      if (viewport.width >= 1024) {
        expect(g.pushPosition).toBe('relative');
        expect(g.pushMargin).toMatch(/^0px 0px 0px 0px$/);

        // Workspace right meets push left (≤2px for hairline / subpixel).
        const seam = Math.abs((g.push!.left ?? 0) - (g.workspace!.right ?? 0));
        expect(seam, `workspace|push seam at ${viewport.width}`).toBeLessThanOrEqual(2);
      }

      // The elastic center never drops below its 720 floor; both side rails stay
      // open (Option A — the center absorbs the slack, so it is ≥ 720, often more).
      expect(
        g.workspace!.width,
        `center holds ≥ ${STATION_CENTER_LOCK_PX} floor at ${viewport.width}`,
      ).toBeGreaterThanOrEqual(STATION_CENTER_LOCK_PX - 8);
    });
  }

  test('AI open yields station Claim push (one right details column)', async ({
    page,
    request,
  }) => {
    test.skip(!(await hasQaSession(request)), 'no QA session — run pnpm provision:qa-org');

    await page.setViewportSize({ width: 1440, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);
    await page.getByRole('button', { name: /File claim|claim/i }).first().click();

    await expect(page.getByTestId('receiving-claim-panel')).toBeVisible({ timeout: 15_000 });

    // Ensure assistant starts closed (persist can leave it open across tests).
    await page.evaluate(() => {
      try {
        window.localStorage.setItem('assistant:dock-open', '0');
      } catch {
        /* ignore */
      }
    });

    await openAssistant(page);

    await expect(page.getByTestId('receiving-claim-panel')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId('receiving-displays-push')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole('region', { name: 'Operations assistant' })).toBeVisible();
  });

  test('station Claim open closes AI dock (button path)', async ({
    page,
    request,
  }) => {
    test.skip(!(await hasQaSession(request)), 'no QA session — run pnpm provision:qa-org');

    await page.setViewportSize({ width: 1440, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);
    await openUnbox(page, receivingId, lineId);

    await openAssistant(page);
    await expect(page.getByRole('region', { name: 'Operations assistant' })).toBeVisible();

    // Operator path: identity Claim pill → Ticket Displays claim nest.
    await page.getByRole('button', { name: /File claim/i }).click();
    await expect(page.getByTestId('receiving-claim-panel')).toBeVisible({ timeout: 15_000 });
    await expectAssistantClosed(page);
  });

  test('Displays open closes AI dock', async ({ page, request }) => {
    test.skip(!(await hasQaSession(request)), 'no QA session — run pnpm provision:qa-org');

    await page.setViewportSize({ width: 1440, height: 900 });
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);

    await openUnbox(page, receivingId, lineId);
    await openAssistant(page);
    await expect(page.getByRole('region', { name: 'Operations assistant' })).toBeVisible();

    await openDisplaysLeaf(page, 'Units');
    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({ timeout: 15_000 });
    await expectAssistantClosed(page);
  });
});
