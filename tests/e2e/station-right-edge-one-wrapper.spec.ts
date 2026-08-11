import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * One right edge, one occupant — the station Displays push column and a desk
 * `RightRailHost` occupant must never be on screen together.
 *
 * They are two different surfaces with two different jobs (`source-of-truth.md`
 * → Displays vs inspector): **Open displays** is the scan station's tool column
 * (`StationDisplaysPushColumn`, local Displays state), and the Band-1 **Check** panel is a
 * desk occupant of the single `RightRailHost` slot
 * (`detail:incoming-bulk-tracking`). Different hosts, different state — which is
 * exactly why nothing stopped them stacking: opening Check is React state on the
 * workbench header, and the header stays mounted (`visibility: hidden`) when a
 * carton covers the browse, so the panel survived the carton open while the
 * cockpit auto-opened Displays beside it. Two full right columns, reported from
 * the bench 2026-08-10.
 *
 * The law they violate is already written — Right-rail modality: exactly two
 * right-edge grammars exist, they are mutually exclusive, and opening one
 * REPLACES the other. `IncomingAddInboundOverlay` already honours it via
 * `yieldStationRightEdgeForAddInbound`; Check simply never claimed the edge.
 *
 * What is pinned here is the operator-visible contract — **at most one right
 * column is painted** — not the mechanism, so a future refactor of how the yield
 * is dispatched cannot make this test vacuous.
 *
 * Runs on the QA org (`qa-desktop`), never the dogfood tenant
 * (`.claude/rules/verify.md`), and provisions the carton it asserts on.
 */

const PANEL_TIMEOUT = 30_000;

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function createCarton(request: APIRequestContext): Promise<number> {
  const res = await request.post('/api/receiving-entry', {
    data: { trackingNumber: `E2E-RIGHTEDGE-${uniq()}`, skipZohoMatch: true, source: 'unmatched' },
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
      sku: `E2E-EDGE-${uniq()}`,
      item_name: 'Right-edge exclusion fixture',
    },
  });
  expect(res.ok(), `add-unmatched-line ${res.status()}: ${await res.text()}`).toBeTruthy();
  return Number((await res.json())?.line?.id);
}

/**
 * Count the right-edge columns actually PAINTED. Both hosts keep chrome in the
 * tree when parked, so visibility is measured as a real box, not presence.
 */
async function paintedRightColumns(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const painted = (el: Element | null): boolean => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    };
    const out: string[] = [];
    if (painted(document.querySelector('[data-testid="receiving-displays-push"]'))) {
      out.push('station-displays');
    }
    if (painted(document.querySelector('[data-right-rail-column]'))) {
      out.push('desk-right-rail');
    }
    return out;
  });
}

/**
 * Open a carton in-page. A `goto` would remount the workbench header and reset
 * the Check panel's own state, which is precisely the coexistence this spec is
 * about — so the carton has to open the way a row click opens it.
 */
async function openCartonInPage(page: Page, receivingId: number, lineId: number) {
  await page.evaluate(
    (row) => {
      window.dispatchEvent(new CustomEvent('receiving-select-line', { detail: row }));
    },
    { id: lineId, receiving_id: receivingId },
  );
  await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: PANEL_TIMEOUT });
}

test.describe('station right edge — one wrapper, one occupant', () => {
  test('opening a carton beside the Check panel leaves exactly one right column', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);

    await page.goto('/unbox');
    await expect(page.getByTestId('receiving-box-check')).toBeVisible({ timeout: PANEL_TIMEOUT });

    // Desk occupant takes the edge from the browse surface.
    await page.getByTestId('receiving-box-check').click();
    await expect(page.locator('[data-right-rail-column]')).toBeVisible({ timeout: PANEL_TIMEOUT });
    expect(await paintedRightColumns(page)).toEqual(['desk-right-rail']);

    // The station bench now claims the middle, and the cockpit wants the edge.
    await openCartonInPage(page, receivingId, lineId);
    await page.waitForTimeout(750); // let the cockpit settle its auto-open

    const columns = await paintedRightColumns(page);
    expect(
      columns.length,
      `both right-edge surfaces painted together: ${columns.join(' + ')}`,
    ).toBeLessThanOrEqual(1);
  });

  test('Check and Open displays are two different surfaces, and only one is ever up', async ({
    page,
    request,
  }, testInfo) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);

    await page.goto('/unbox');
    await expect(page.getByTestId('receiving-box-check')).toBeVisible({ timeout: PANEL_TIMEOUT });

    // ── The DESK surface: Band-1 Check on RightRailHost ──────────────────────
    await page.getByTestId('receiving-box-check').click();
    const deskColumn = page.locator('[data-right-rail-column]');
    await expect(deskColumn).toBeVisible({ timeout: PANEL_TIMEOUT });
    await expect(deskColumn).toContainText(/Checking unreceived orders/i);
    // It is NOT the station column — different host, different job.
    await expect(page.getByTestId('receiving-displays-push')).toHaveCount(0);
    await testInfo.attach('1-check-panel-only.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // ── The STATION surface: the carton bench claims the edge ────────────────
    await openCartonInPage(page, receivingId, lineId);
    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({
      timeout: PANEL_TIMEOUT,
    });
    expect(await paintedRightColumns(page)).toEqual(['station-displays']);
    await testInfo.attach('2-displays-replaced-check.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    // ── `←|` Open displays — the station's own control, after parking ────────
    await page.getByTestId('unbox-push-close').click();
    await expect(page.getByTestId('receiving-displays-push')).toBeHidden({
      timeout: PANEL_TIMEOUT,
    });
    const openDisplays = page.getByTestId('unbox-displays-pane-toggle');
    // Operator copy is station copy — never the desk inspector's.
    await expect(openDisplays).toHaveAttribute('aria-label', /Open displays/i);
    await openDisplays.click();
    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({
      timeout: PANEL_TIMEOUT,
    });

    // Re-opening Displays must not resurrect the desk occupant beneath it.
    expect(await paintedRightColumns(page)).toEqual(['station-displays']);
    await testInfo.attach('3-open-displays-still-alone.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });

  test('Displays REPLACES the Check panel — it does not merely cover it', async ({
    page,
    request,
  }) => {
    const receivingId = await createCarton(request);
    const lineId = await addLine(request, receivingId);

    await page.goto('/unbox');
    await expect(page.getByTestId('receiving-box-check')).toBeVisible({ timeout: PANEL_TIMEOUT });
    await page.getByTestId('receiving-box-check').click();
    await expect(page.locator('[data-right-rail-column]')).toBeVisible({ timeout: PANEL_TIMEOUT });

    await openCartonInPage(page, receivingId, lineId);
    await expect(page.getByTestId('receiving-displays-push')).toBeVisible({
      timeout: PANEL_TIMEOUT,
    });

    // Park the station column. If Check had merely been out-stacked rather than
    // dismissed, it would still be holding `RightRailHost` underneath and would
    // surface here — which is the difference between an occupant that yielded
    // and one that is waiting its turn.
    // `unbox-push-close` is the `→|` INSIDE the open column; the pane's `←|`
    // re-open control is `unbox-displays-pane-toggle`.
    await page.getByTestId('unbox-push-close').click();
    await expect(page.getByTestId('receiving-displays-push')).toBeHidden({
      timeout: PANEL_TIMEOUT,
    });
    await page.waitForTimeout(400);

    expect(await paintedRightColumns(page)).toEqual([]);
  });
});
