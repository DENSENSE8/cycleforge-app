import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Triage / Arrival rail — mode-separation contracts (matrix B of
 * docs/todo/unbox-triage-mode-separation-handoff.md).
 *
 * Triage's combined rail has ONE door-scan recency axis (scanned/arrival
 * activity). Unbox first-open stamps (`unbox_opened_at`) must never drive
 * triage order, ages, or refresh — and vice versa.
 *
 *   T1  combined Triage rail chrome mounts; the Unbox-only rail + Receive bar
 *       are absent on /triage
 *   T2  row order + ages follow door-scan recency, NEVER unbox_opened_at
 *       (adversarial mocked stamps prove the axis)
 *   T3  a matched triage door scan surfaces the carton at the top of the rail
 *   T4  unbox refresh events neither refetch nor reshuffle the triage rail
 *   T5  the triage terminal action is "Save for unbox" (never the unbox
 *       Receive bar)
 *
 * T2/T3/T5 are fully mocked (deterministic). T1/T4 run against live dogfood
 * data and skip with a fixture reason when the triage queue is empty.
 */

// Triage scan bench + sidebar rail is a desktop surface.
test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only');

// Scoped to the sidebar: the right-pane workbench keeps a second (sometimes
// display:none-cached) Triage list mounted with the same aria-label.
const TRIAGE_RAIL = 'aside ul[aria-label="Triage activity"]';
const UNBOX_RAIL = 'aside ul[aria-label="Unboxed activity"]';
const ROW = `${TRIAGE_RAIL} li[role="option"]`;
const SCANNED_FEED = 'view=scanned';
const UNFOUND_FEED = '/api/receiving/unfound-queue';

async function readRailRows(page: Page): Promise<{ text: string; age: string | null }[]> {
  return page.$$eval(`${TRIAGE_RAIL} li[role="option"]`, (lis) =>
    lis.map((li) => {
      const btn = li.querySelector('button[data-rail-row]');
      const ageEl = btn?.querySelector(':scope > span.tabular-nums');
      return {
        text: (li.textContent || '').trim(),
        age: ageEl ? (ageEl.textContent || '').trim() : null,
      };
    }),
  );
}

// ── Live-data contracts ──────────────────────────────────────────────────────

test.describe('Triage rail — mode chrome + isolation (live)', () => {
  test('T1 — combined rail chrome mounts; Unbox rail and Receive bar are absent', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const feedSettled = page.waitForResponse(
      (r) => r.url().includes('/api/receiving-lines') && r.url().includes(SCANNED_FEED),
      { timeout: 60_000 },
    );
    await page.goto('/triage');
    await expect(page.getByRole('complementary')).toBeVisible({ timeout: 30_000 });

    const res = await feedSettled;
    expect(res.status()).toBe(200);
    await page.waitForTimeout(750);

    // Mode chrome is triage's own: never the Unbox "Unboxed" rail…
    await expect(page.locator(UNBOX_RAIL)).toHaveCount(0);
    // …and never the Unbox-only Receive terminal.
    await expect(page.getByRole('button', { name: /^Receive(\s+all)?$/ })).toHaveCount(0);

    // The combined rail lists rows when the queue has cartons.
    const body = await res.json().catch(() => ({}));
    const rows = (body.receiving_lines ?? []) as unknown[];
    if (rows.length > 0) {
      await expect(page.locator(ROW).first()).toBeVisible({ timeout: 15_000 });
    } else {
      console.log('[triage-rail] scanned queue empty — chrome asserted, rows skipped.');
    }
  });

  test('T4 — unbox refresh events neither refetch nor reshuffle the triage rail', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.goto('/triage');
    const hasRows = await page
      .locator(ROW)
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!hasRows, 'no triage cartons in this environment (fixture absent)');
    await page.waitForTimeout(1_500); // let the auto-selected panel's follow-up fetches settle

    const before = await readRailRows(page);

    let triageFeedRefetches = 0;
    page.on('request', (req) => {
      const url = req.url();
      if (
        (url.includes('/api/receiving-lines') && url.includes(SCANNED_FEED)) ||
        url.includes(UNFOUND_FEED)
      ) {
        triageFeedRefetches += 1;
      }
    });

    // Fire the UNBOX mode's refresh vocabulary — must be inert in triage.
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('receiving-unbox-refresh'));
    });
    await page.waitForTimeout(2_000);

    expect(triageFeedRefetches, 'unbox refresh events must not refetch triage feeds').toBe(0);
    const after = await readRailRows(page);
    expect(after, 'unbox refresh events must not reshuffle the triage rail').toEqual(before);
  });
});

// ── Deterministic (mocked) contracts — T2 / T3 / T5 ──────────────────────────

const T_NOW = Date.now();
const iso = (msAgo: number) => new Date(T_NOW - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type MockRow = Record<string, unknown> & { id: number; receiving_id: number };

function buildLine(over: Partial<MockRow> & { id: number; receiving_id: number }): MockRow {
  return {
    tracking_number: null,
    carrier: null,
    zoho_item_id: `ZI-${over.id}`,
    zoho_line_item_id: `ZLI-${over.id}`,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: `PO-${over.receiving_id}`,
    zoho_purchaseorder_number: `USAVE2E${over.receiving_id}`,
    item_name: `E2E Door ${over.id}`,
    sku: `E2E-SKU-${over.id}`,
    quantity_received: 0,
    quantity_expected: 1,
    qa_status: 'PENDING',
    workflow_status: 'ARRIVED',
    disposition_code: 'PENDING',
    condition_grade: 'A',
    disposition_audit: [],
    needs_test: false,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    receiving_type: null,
    notes: null,
    image_url: null,
    source_platform: null,
    created_at: iso(3 * DAY),
    receiving_source: 'zoho_po',
    serials: [],
    ...over,
  };
}

// Door-scan recency: MIKE (5m) > NOVEMBER (2h) > OSCAR (26h).
// unbox_opened_at is ADVERSARIAL — reversed vs door recency. If any triage
// layer sorts or labels by the Unbox first-open axis, this ordering flips and
// the top age reads "<1m"/"1m" instead of "5m".
const MIKE = buildLine({
  id: 8201, receiving_id: 9201, item_name: 'E2E Door Mike',
  tracking_number: '1Z999AA10200000001',
  scanned_at: iso(5 * MIN), last_activity_at: iso(5 * MIN), created_at: iso(6 * MIN),
  unbox_opened_at: iso(30 * DAY),
});
const NOVEMBER = buildLine({
  id: 8202, receiving_id: 9202, item_name: 'E2E Door November',
  tracking_number: '1Z999AA10200000002',
  scanned_at: iso(2 * HOUR), last_activity_at: iso(2 * HOUR), created_at: iso(2 * HOUR + 5 * MIN),
  unbox_opened_at: iso(1 * MIN),
});
const OSCAR = buildLine({
  id: 8203, receiving_id: 9203, item_name: 'E2E Door Oscar',
  tracking_number: '1Z999AA10200000003',
  scanned_at: iso(26 * HOUR), last_activity_at: iso(26 * HOUR), created_at: iso(27 * HOUR),
  unbox_opened_at: iso(2 * MIN),
});
// T3: the carton a fresh door scan resolves to (server includes it after scan).
const PAPA = buildLine({
  id: 8204, receiving_id: 9204, item_name: 'E2E Door Papa',
  tracking_number: '1Z999AA10200000009',
  scanned_at: iso(0), last_activity_at: iso(0), created_at: iso(0),
});

const CARTONS: Record<string, MockRow> = {
  '9201': MIKE, '9202': NOVEMBER, '9203': OSCAR, '9204': PAPA,
};

async function mockTriageFeeds(page: Page): Promise<{ state: { papaScanned: boolean } }> {
  const state = { papaScanned: false };

  await page.route('**/api/receiving/rail-snapshot**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(route.request().method() === 'GET' ? { rows: [] } : { ok: true }),
    }),
  );
  await page.route('**/api/receiving/touch-scan', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: true }),
    }),
  );
  await page.route(`${UNFOUND_FEED}**`, (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows: [] }),
    }),
  );
  await page.route('**/api/receiving/triage/done**', (route: Route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rows: [] }),
    }),
  );
  await page.route('**/api/receiving-lines**', (route: Route) => {
    const url = route.request().url();
    const cartonMatch = url.match(/receiving_id=(\d+)/);
    let lines: MockRow[] = [];
    if (cartonMatch) {
      const row = CARTONS[cartonMatch[1]];
      lines = row ? [row] : [];
    } else if (url.includes(SCANNED_FEED)) {
      // Deliberately JUMBLED response order — the door-scan recency axis, not
      // payload order and not unbox_opened_at, must produce the final order.
      lines = state.papaScanned ? [NOVEMBER, PAPA, OSCAR, MIKE] : [NOVEMBER, OSCAR, MIKE];
    }
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: true, receiving_lines: lines, total: lines.length }),
    });
  });
  await page.route('**/api/receiving/lookup-po', (route: Route) => {
    state.papaScanned = true;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        success: true,
        matched: true,
        po_matched: true,
        receiving_id: PAPA.receiving_id,
        po_ids: [PAPA.zoho_purchaseorder_id],
        lines: [
          {
            id: PAPA.id,
            receiving_id: PAPA.receiving_id,
            sku: PAPA.sku,
            item_name: PAPA.item_name,
            zoho_purchaseorder_id: PAPA.zoho_purchaseorder_id,
            zoho_purchaseorder_number: PAPA.zoho_purchaseorder_number,
            quantity_expected: 1,
            quantity_received: 0,
          },
        ],
        receiving_package: null,
      }),
    });
  });

  return { state };
}

test.describe('Triage rail — door-scan axis (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(120_000);
    await mockTriageFeeds(page);
    await page.goto('/triage');
    await expect(page.locator(ROW)).toHaveCount(3, { timeout: 45_000 });
  });

  async function railTitles(page: Page): Promise<string[]> {
    const rows = await readRailRows(page);
    return rows.map((r) => {
      const m = r.text.match(/E2E Door (Mike|November|Oscar|Papa)|1Z999AA10200000009/);
      return m ? (m[1] ?? 'Papa') : r.text.slice(0, 30);
    });
  }

  test('T2 — order + ages follow door-scan recency, never unbox_opened_at', async ({ page }) => {
    // Door recency order — NOT the payload order (November first) and NOT the
    // unbox first-open order (November/Oscar carry 1–2m-old unbox stamps).
    expect(await railTitles(page)).toEqual(['Mike', 'November', 'Oscar']);

    const rows = await readRailRows(page);
    // Ages read the triage recency axis. Mike's unbox_opened_at is 30 DAYS old —
    // a "30d" here (or "<1m" from November's unbox stamp) means the Unbox axis
    // leaked into triage.
    expect(rows[0].age, 'Mike ages from its 5m door scan, not its 30d unbox stamp').toBe('5m');
    expect(rows[1].age, 'November ages from its 2h door scan, not its 1m unbox stamp').toBe('2h');
    expect(rows[2].age, 'Oscar ages from its 26h door scan').toBe('26h');
  });

  test('T5 — triage terminal action is "Save for unbox"; the Receive bar never mounts', async ({
    page,
  }) => {
    // The combined rail auto-selects its top line, mounting the triage panel.
    await expect(page.getByRole('button', { name: /Save for unbox/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: /^Receive(\s+all)?$/ })).toHaveCount(0);
  });

  test('T3 — a matched door scan surfaces the carton at the top of the rail', async ({ page }) => {
    expect(await railTitles(page)).toEqual(['Mike', 'November', 'Oscar']);

    const scanInput = page.getByPlaceholder('Scan tracking #').first();
    await scanInput.click();
    await scanInput.fill(PAPA.tracking_number as string);
    await scanInput.press('Enter');

    // The scanned carton lands at the top (optimistic prepend, then the
    // refetched feed keeps it there by door recency). A pre-resolve pending
    // stub may paint for a beat; once settled there is EXACTLY ONE Papa row
    // and it is first — a lingering duplicate means the stub never reconciled.
    await expect
      .poll(
        async () => {
          const titles = await railTitles(page);
          return { top: titles[0], papas: titles.filter((t) => t === 'Papa').length };
        },
        { timeout: 15_000 },
      )
      .toEqual({ top: 'Papa', papas: 1 });
  });
});
