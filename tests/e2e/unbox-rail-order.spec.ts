import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * Unbox "Unboxed" rail — mode-separation contracts (matrix A of
 * docs/todo/unbox-triage-mode-separation-handoff.md).
 *
 * The Unboxed rail has exactly ONE time axis: first Unbox-open
 * (`unbox_opened_at`, `view=unbox_opened`). Server SQL owns the sort
 * (`preserveServerOrder`), the row age label reads the same stamp, and triage
 * door-scan times must never drive order, age, or refresh.
 *
 *   U1/U3  rail renders and its order/count track the server first-open feed
 *   U2     visible ages derive from `unbox_opened_at` (single axis — ages are
 *          newest-first monotonic and match the API stamps)
 *   U4     re-scanning a carton already in the list opens the workspace but
 *          does NOT move the row or rewrite its first-open age
 *   U5     first open of a NEW carton prepends once; later opens stay put
 *   U6     a row with no `unbox_opened_at` shows no age (never `created_at`)
 *   U7/X3  triage refresh events neither refetch nor reshuffle this rail, and
 *          the Triage rail never mounts on /unbox
 *   X2     API contract: `view=unbox_opened` payload carries the stamp, in
 *          non-increasing first-open order
 *
 * Live-data tests skip with a fixture reason when the dogfood env has no
 * unbox-opened cartons. U4–U6 are fully mocked (deterministic, no live writes
 * beyond a mocked touch-scan).
 */

// The Unbox scan bench + sidebar rail is a desktop surface.
test.skip(({ browserName }) => browserName !== 'chromium', 'desktop-only');

// Scoped to the sidebar: the right-pane workbench can mount a second list with
// the same aria-label (kept display:none for cache continuity).
const RAIL = 'aside ul[aria-label="Unboxed activity"]';
const TRIAGE_RAIL = 'aside ul[aria-label="Triage activity"]';
const ROW = `${RAIL} li[role="option"]`;
const FEED_URL = 'view=unbox_opened';

type ApiRow = {
  id: number;
  receiving_id: number | null;
  unbox_opened_at?: string | null;
  [k: string]: unknown;
};

/** Mirror of buildUnboxReceivedFetcher's dedup: one row per carton, SQL order kept. */
function dedupeByCarton(rows: ApiRow[]): ApiRow[] {
  const best = new Map<number, ApiRow>();
  const order: number[] = [];
  for (const row of rows) {
    const rid = row.receiving_id;
    if (rid == null || !Number.isFinite(Number(rid))) continue;
    const existing = best.get(rid);
    if (!existing) {
      best.set(rid, row);
      order.push(rid);
      continue;
    }
    if (existing.id < 0 && row.id >= 0) best.set(rid, row);
  }
  return order.map((rid) => best.get(rid)!).slice(0, 50);
}

/** Parse the rail's compact age label ('<1m' | 'Nm' | 'Nh' | 'Nd') to minutes. */
function ageLabelToMinutes(label: string | null): number | null {
  if (!label) return null;
  const t = label.trim();
  if (t === '<1m') return 0;
  const m = t.match(/^(\d+)(m|h|d)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'm' ? n : m[2] === 'h' ? n * 60 : n * 1440;
}

function isoToAgeMinutes(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((nowMs - t) / 60_000));
}

/**
 * The compact label QUANTIZES ('1h' covers 60–119 min, '2d' covers 48–71 h), so
 * a stamp matches a label iff it falls inside the label's bucket (± slack for
 * test-time drift).
 */
function stampMatchesLabel(label: string | null, expectedMinutes: number | null): boolean {
  const SLACK = 5;
  if (label == null || expectedMinutes == null) return label == null && expectedMinutes == null;
  const t = label.trim();
  let min: number;
  let max: number;
  if (t === '<1m') {
    min = 0; max = 1;
  } else {
    const m = t.match(/^(\d+)(m|h|d)$/);
    if (!m) return false;
    const n = Number(m[1]);
    const unit = m[2] === 'm' ? 1 : m[2] === 'h' ? 60 : 1440;
    min = n * unit;
    max = (n + 1) * unit;
  }
  return expectedMinutes >= min - SLACK && expectedMinutes < max + SLACK;
}

/** Read each visible rail row's { text, age } top→bottom. */
async function readRailRows(page: Page): Promise<{ text: string; age: string | null }[]> {
  return page.$$eval(`${RAIL} li[role="option"]`, (lis) =>
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

test.describe('Unboxed rail — server first-open axis (live)', () => {
  test('U1/U2/U3 — rail order and ages track the API view=unbox_opened feed', async ({
    page,
    request,
  }) => {
    // Cold Turbopack compiles + live polling: never wait on networkidle here.
    test.setTimeout(120_000);
    const res = await request.get(`/api/receiving-lines?limit=50&offset=0&${FEED_URL}`);
    expect(res.status()).toBe(200);
    const raw = ((await res.json()).receiving_lines ?? []) as ApiRow[];
    const apiRows = dedupeByCarton(raw);
    test.skip(apiRows.length === 0, 'no unbox-opened cartons in this environment (fixture absent)');

    // Wait for the AUTHORITATIVE feed fetch (not just the snapshot seed paint).
    const feedSettled = page.waitForResponse(
      (r) => r.url().includes('/api/receiving-lines') && r.url().includes(FEED_URL),
      { timeout: 60_000 },
    );
    await page.goto('/unbox');
    await feedSettled;
    await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(750); // let react-query commit the reconciled rows

    const nowMs = Date.now();
    const domRows = await readRailRows(page);

    // U1: the rail renders rows.
    expect(domRows.length, 'Unboxed rail has rows').toBeGreaterThan(0);
    // Display exclusions (per-staff dismissals) may only REMOVE rows — never add.
    expect(domRows.length, 'DOM rows ≤ server feed rows').toBeLessThanOrEqual(apiRows.length);

    // U2a: single first-open axis ⇒ newest first ⇒ ages never decrease going
    // down the list (5-minute slack for label rounding at unit boundaries).
    const parsed = domRows.map((r) => ageLabelToMinutes(r.age));
    let prev: number | null = null;
    for (let i = 0; i < parsed.length; i++) {
      const cur = parsed[i];
      if (cur == null) continue; // missing stamp rows carry no age (U6)
      if (prev != null) {
        expect(
          cur,
          `row ${i} age (${domRows[i].age}) is not newer than the row above it — a second time axis reshuffled the rail`,
        ).toBeGreaterThanOrEqual(prev - 5);
      }
      prev = cur;
    }

    // U2b/U3: DOM ages correlate with the API's unbox_opened_at stamps in
    // server order. When counts line up, compare pairwise; otherwise anchor the
    // top of the list (exclusions can hide arbitrary rows below).
    const expectedAges = apiRows.map((r) => isoToAgeMinutes(r.unbox_opened_at ?? null, nowMs));
    if (domRows.length === apiRows.length) {
      for (let i = 0; i < domRows.length; i++) {
        const api = expectedAges[i];
        if (api == null) {
          expect(
            domRows[i].age,
            `row ${i}: API has no first-open stamp — row must show no age`,
          ).toBeNull();
          continue;
        }
        expect(
          stampMatchesLabel(domRows[i].age, api),
          `row ${i}: rendered age ${domRows[i].age} vs first-open stamp ${apiRows[i].unbox_opened_at} (${api}m ago)`,
        ).toBe(true);
      }
    } else if (expectedAges[0] != null) {
      expect(
        stampMatchesLabel(domRows[0].age, expectedAges[0]),
        `top row age ${domRows[0].age} does not match the newest first-open stamp ${apiRows[0].unbox_opened_at}`,
      ).toBe(true);
    }
  });

  test('X2 — API contract: view=unbox_opened rows carry the first-open stamp in server order', async ({
    request,
  }) => {
    const res = await request.get(`/api/receiving-lines?limit=50&offset=0&${FEED_URL}`);
    expect(res.status()).toBe(200);
    const rows = ((await res.json()).receiving_lines ?? []) as ApiRow[];
    test.skip(rows.length === 0, 'no unbox-opened cartons in this environment (fixture absent)');

    for (const row of rows) {
      expect(row.receiving_id, 'every unbox_opened row belongs to a carton').not.toBeNull();
      expect('unbox_opened_at' in row, 'payload exposes the unbox_opened_at axis field').toBe(true);
    }
    // At least some rows carry the stamp — an all-null payload means the axis
    // column silently dropped out of the view (the exact drift X2 guards).
    expect(
      rows.filter((r) => r.unbox_opened_at != null).length,
      'some rows carry a non-null unbox_opened_at',
    ).toBeGreaterThan(0);

    // The non-null stamps must be non-increasing in payload order (rows sorted
    // by COALESCE(first-open, ops-max): every stamped row's key IS its stamp).
    const stamped = rows
      .map((r) => (r.unbox_opened_at ? Date.parse(r.unbox_opened_at) : null))
      .filter((t): t is number => t != null && Number.isFinite(t));
    for (let i = 1; i < stamped.length; i++) {
      expect(
        stamped[i],
        `stamped row ${i} is newer than the row above it — SQL order is not first-open DESC`,
      ).toBeLessThanOrEqual(stamped[i - 1] + 1_000);
    }
  });

  test('U7/X3 — triage refresh events neither refetch nor reshuffle the Unboxed rail', async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const res = await request.get(`/api/receiving-lines?limit=50&offset=0&${FEED_URL}`);
    const apiRows = dedupeByCarton(((await res.json()).receiving_lines ?? []) as ApiRow[]);
    test.skip(apiRows.length === 0, 'no unbox-opened cartons in this environment (fixture absent)');

    const feedSettled = page.waitForResponse(
      (r) => r.url().includes('/api/receiving-lines') && r.url().includes(FEED_URL),
      { timeout: 60_000 },
    );
    await page.goto('/unbox');
    await feedSettled;
    await page.locator(ROW).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(750);

    // X3: the Triage rail is never mounted inside Unbox mode.
    await expect(page.locator(TRIAGE_RAIL)).toHaveCount(0);

    const before = await readRailRows(page);

    let unboxFeedRefetches = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/receiving-lines') && req.url().includes(FEED_URL)) {
        unboxFeedRefetches += 1;
      }
    });

    // Fire the TRIAGE mode's refresh vocabulary. The Unboxed rail only listens
    // for receiving-unbox-refresh / app-refresh-data — triage events must be
    // inert here (mode-gated scan/refresh paths).
    await page.evaluate(() => {
      ['receiving-triage-refresh', 'receiving-triage-completed'].forEach((ev) =>
        window.dispatchEvent(new CustomEvent(ev)),
      );
    });
    await page.waitForTimeout(2_000);

    expect(unboxFeedRefetches, 'triage refresh events must not refetch the Unboxed feed').toBe(0);
    const after = await readRailRows(page);
    expect(after, 'triage refresh events must not reshuffle the Unboxed rail').toEqual(before);
  });
});

// ── Deterministic (mocked) contracts — U4 / U5 / U6 ──────────────────────────

const T_NOW = Date.now();
const iso = (msAgo: number) => new Date(T_NOW - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Full-enough ReceivingLineRow for the rail + workspace hydration. */
function buildLine(over: Partial<ApiRow> & { id: number; receiving_id: number }): ApiRow {
  return {
    tracking_number: null,
    carrier: null,
    zoho_item_id: `ZI-${over.id}`,
    zoho_line_item_id: `ZLI-${over.id}`,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: `PO-${over.receiving_id}`,
    zoho_purchaseorder_number: `USAVE2E${over.receiving_id}`,
    item_name: `E2E Carton ${over.id}`,
    sku: `E2E-SKU-${over.id}`,
    quantity_received: 0,
    quantity_expected: 1,
    qa_status: 'PENDING',
    workflow_status: 'RECEIVED',
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

const ALPHA = buildLine({
  id: 8101, receiving_id: 9101, item_name: 'E2E Carton Alpha',
  tracking_number: '1Z999AA10100000001', unbox_opened_at: iso(10 * MIN),
});
const BRAVO = buildLine({
  id: 8102, receiving_id: 9102, item_name: 'E2E Carton Bravo',
  tracking_number: '1Z999AA10100000002', unbox_opened_at: iso(2 * HOUR),
});
// U6 fixture: no first-open stamp, old created_at — must render NO age.
const CHARLIE = buildLine({
  id: 8103, receiving_id: 9103, item_name: 'E2E Carton Charlie',
  tracking_number: '1Z999AA10100000003', unbox_opened_at: null, created_at: iso(3 * DAY),
});
const DELTA = buildLine({
  id: 8109, receiving_id: 9109, item_name: 'E2E Carton Delta',
  tracking_number: '1Z999AA10100000009', unbox_opened_at: null,
});

const CARTONS: Record<string, ApiRow> = {
  '9101': ALPHA, '9102': BRAVO, '9103': CHARLIE, '9109': DELTA,
};

function lookupPoPayload(row: ApiRow) {
  return {
    success: true,
    matched: true,
    po_matched: true,
    receiving_id: row.receiving_id,
    po_ids: [row.zoho_purchaseorder_id],
    lines: [
      {
        id: row.id,
        receiving_id: row.receiving_id,
        sku: row.sku,
        item_name: row.item_name,
        zoho_purchaseorder_id: row.zoho_purchaseorder_id,
        zoho_purchaseorder_number: row.zoho_purchaseorder_number,
        quantity_expected: 1,
        quantity_received: 0,
      },
    ],
    receiving_package: null,
  };
}

async function mockUnboxFeeds(page: Page): Promise<void> {
  // Kill the Upstash snapshot seed so the mocked feed is the only paint source.
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
  await page.route('**/api/receiving-lines**', (route: Route) => {
    const url = route.request().url();
    const cartonMatch = url.match(/receiving_id=(\d+)/);
    let lines: ApiRow[] = [];
    if (cartonMatch) {
      const row = CARTONS[cartonMatch[1]];
      lines = row ? [row] : [];
    } else if (url.includes(FEED_URL)) {
      lines = [ALPHA, BRAVO, CHARLIE];
    }
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ success: true, receiving_lines: lines, total: lines.length }),
    });
  });
  await page.route('**/api/receiving/lookup-po', (route: Route) => {
    const body = route.request().postData() ?? '';
    const row =
      Object.values(CARTONS).find(
        (r) =>
          (r.tracking_number && body.includes(r.tracking_number as string)) ||
          body.includes(r.zoho_purchaseorder_number as string),
      ) ?? DELTA;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(lookupPoPayload(row)),
    });
  });
}

async function scanTracking(page: Page, value: string): Promise<void> {
  const scanInput = page.getByPlaceholder(/Tracking|PO/i).first();
  await scanInput.click();
  await scanInput.fill(value);
  await scanInput.press('Enter');
}

test.describe('Unboxed rail — re-scan stability + first-open prepend (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await mockUnboxFeeds(page);
    await page.goto('/unbox', { waitUntil: 'networkidle' });
    await expect(page.locator(ROW)).toHaveCount(3, { timeout: 30_000 });
  });

  async function railTitles(page: Page): Promise<string[]> {
    const rows = await readRailRows(page);
    return rows.map((r) => {
      const m = r.text.match(/E2E Carton (Alpha|Bravo|Charlie|Delta)/);
      return m ? m[1] : r.text.slice(0, 30);
    });
  }

  test('U6 — a carton with no first-open stamp shows no age (never created_at)', async ({ page }) => {
    expect(await railTitles(page)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    const rows = await readRailRows(page);
    // Stamped rows read the first-open axis…
    expect(rows[0].age, 'Alpha ages from its 10m first-open stamp').toBe('10m');
    expect(rows[1].age, 'Bravo ages from its 2h first-open stamp').toBe('2h');
    // …and the stampless row shows NO age at all. Its created_at is 3 days old:
    // any `3d` here means the created_at fallback regressed back in.
    expect(rows[2].age, 'Charlie (no unbox_opened_at) must not render an age').toBeNull();
    expect(rows[2].text).not.toMatch(/\b\d+d\b/);
  });

  test('U4 — re-scanning a listed carton opens the workspace without moving the row or its age', async ({ page }) => {
    expect(await railTitles(page)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    // Scan BRAVO (already 2nd, first-open 2h ago).
    await scanTracking(page, BRAVO.tracking_number as string);
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });

    // The row must not bump to the front, and its age must still be the ORIGINAL
    // first-open (the optimistic re-scan stamps now — mergeRailRows must keep 2h).
    await page.waitForTimeout(500);
    expect(await railTitles(page), 're-scan must not reorder the Unboxed rail').toEqual([
      'Alpha', 'Bravo', 'Charlie',
    ]);
    const rows = await readRailRows(page);
    expect(rows[1].age, 're-scan must not rewrite the first-open age').toBe('2h');

    // Scan it AGAIN — still stable.
    await scanTracking(page, BRAVO.tracking_number as string);
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    expect(await railTitles(page), 'second re-scan is also inert for order').toEqual([
      'Alpha', 'Bravo', 'Charlie',
    ]);
  });

  test('U5 — first open of a NEW carton prepends once; a repeat open stays put', async ({ page }) => {
    expect(await railTitles(page)).toEqual(['Alpha', 'Bravo', 'Charlie']);

    // Scan DELTA — not in the list; lookup-po resolves it as a matched carton.
    await scanTracking(page, DELTA.tracking_number as string);
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(async () => railTitles(page), { timeout: 10_000 })
      .toEqual(['Delta', 'Alpha', 'Bravo', 'Charlie']);
    // Exactly one Delta row — the pending scan stub must reconcile, not double-list.
    expect((await railTitles(page)).filter((t) => t === 'Delta')).toHaveLength(1);

    // Open it again — stays at the top, still exactly one row.
    await scanTracking(page, DELTA.tracking_number as string);
    await expect(page.getByTestId('receiving-workspace')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(500);
    const titles = await railTitles(page);
    expect(titles, 'repeat open keeps the row in place').toEqual(['Delta', 'Alpha', 'Bravo', 'Charlie']);
  });
});
