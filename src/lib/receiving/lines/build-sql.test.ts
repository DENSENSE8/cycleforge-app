/** DB-free regression tests for the receiving-lines SQL builders (roi-execution/03 #8 decomposition). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  UNBOX_OPENED_PREDICATE_SQL,
  unboxOpenedPredicateSql,
} from '@/lib/receiving/unbox-scan-opened-sql';
import { parseReceivingLinesQuery } from './query';
import { CHECK_ZOHO_RECEIVED_MAX_INPUTS } from '@/lib/receiving/tracking-paste';
import {
  buildReceivingLinesListSql,
  buildUnmatchedPlaceholdersSql,
  buildUnboxOpenedPlaceholdersSql,
  shouldIncludeUnmatchedPlaceholders,
  shouldIncludeUnboxOpenedPlaceholders,
} from './build-sql';
import {
  legacyBuildLineByIdSql,
  legacyBuildLinesByReceivingIdSql,
  legacyBuildListSql,
  legacyBuildUnmatchedPlaceholdersSql,
  legacyBuildUnboxOpenedPlaceholdersSql,
  type LegacySqlOpts,
} from './legacy-route-sql.fixture';
import {
  buildReceivingLineByIdSql,
  buildReceivingLinesByReceivingIdSql,
} from './build-sql';

const ORG = '00000000-0000-0000-0000-000000000001';

const DEFAULT_OPTS: LegacySqlOpts = {
  orgId: ORG,
  // Route computes `Number(ctx?.staffId)` — an anonymous/absent staffId is NaN.
  viewerStaffId: NaN,
  universalIncoming: false,
  applyScannedZohoExclusion: true,
};

interface Combo {
  name: string;
  qs: string;
  opts?: Partial<LegacySqlOpts>;
}

/** Representative filter matrix — every WHERE branch, sort axis, and view. */
const LIST_COMBOS: Combo[] = [
  { name: 'defaults (no params)', qs: '' },
  { name: 'plain search (field=all)', qs: 'search=soundbar' },
  { name: 'R-<id> carton QR search (receiving_id equality arm)', qs: 'search=R-482' },
  { name: 'search_field=po', qs: 'search=PO-1189&search_field=po' },
  { name: 'search_field=tracking', qs: 'search=1Z999AA1&search_field=tracking' },
  { name: 'search_field=sku', qs: 'search=00143&search_field=sku' },
  { name: 'search_field=product', qs: 'search=Bose&search_field=product' },
  { name: 'search_field=serial', qs: 'search=SN12345&search_field=serial' },
  { name: 'search_scope=zoho_po', qs: 'search=abc&search_scope=zoho_po' },
  { name: 'search_scope=unfound alias → unmatched', qs: 'search_scope=unfound' },
  { name: 'valid qa/disposition/workflow filters', qs: 'qa_status=passed&disposition=rtv&workflow_status=unboxed' },
  { name: 'invalid qa/disposition/workflow silently ignored', qs: 'qa_status=BOGUS&disposition=NOPE&workflow_status=NOT_A_STATUS' },
  { name: 'staff filter', qs: 'staff=7' },
  { name: 'staff filter junk value ignored', qs: 'staff=abc' },
  { name: 'staff filter on unbox_opened (actor clause)', qs: 'view=unbox_opened&staff=7' },
  // view=recent was deleted (Wave-2 dead-arm removal) — it now parses to null
  // and falls back to the default org-wide scoping, pinned here.
  { name: 'removed view=recent falls back to default scoping', qs: 'view=recent' },
  { name: 'view=received', qs: 'view=received' },
  { name: 'view=all + search + include=serials (fetch-limit bump)', qs: 'view=all&search=R-12&include=serials' },
  { name: 'view=all sort=unboxed_newest', qs: 'view=all&sort=unboxed_newest' },
  { name: 'view=all sort=received_newest', qs: 'view=all&sort=received_newest' },
  { name: 'view=all sort=scanned_oldest', qs: 'view=all&sort=scanned_oldest' },
  { name: 'view=unbox_opened', qs: 'view=unbox_opened' },
  // Plain view=scanned intentionally diverges from the legacy fixture: the
  // Deliveries › Docked ledger orders from the complete Arrival scan spine
  // (receiving_scans fallback), not only receiving_triage.door_received_at.
  { name: 'view=scanned sort=priority', qs: 'view=scanned&sort=priority', opts: { applyScannedZohoExclusion: true } },
  { name: 'view=testing (all staff)', qs: 'view=testing' },
  { name: 'view=testing scoped to tester', qs: 'view=testing&tester=12' },
  { name: 'view=needs-test', qs: 'view=needs-test' },
  { name: 'view=needs-test scoped to tester', qs: 'view=needs-test&tester=12' },
  { name: 'view=viewed with viewer staff', qs: 'view=viewed', opts: { viewerStaffId: 42 } },
  { name: 'view=viewed without viewer (FALSE feed)', qs: 'view=viewed', opts: { viewerStaffId: NaN } },
  { name: 'view=incoming (legacy zoho-only, default sort)', qs: 'view=incoming' },
  { name: 'view=incoming sort=zoho_oldest + po date range', qs: 'view=incoming&sort=zoho_oldest&po_from=2026-01-01&po_to=2026-02-01' },
  { name: 'view=incoming sort=expected_soonest', qs: 'view=incoming&sort=expected_soonest' },
  { name: 'view=incoming sort=recently_added', qs: 'view=incoming&sort=recently_added' },
  { name: 'view=incoming malformed po range silently no-ops', qs: 'view=incoming&po_from=junk&po_to=2026-13-99x' },
  { name: 'view=incoming delivery_state=DELIVERED_UNOPENED', qs: 'view=incoming&delivery_state=delivered_unopened' },
  { name: 'view=incoming delivery_state=DELIVERED_NOT_UNBOXED', qs: 'view=incoming&delivery_state=delivered_not_unboxed' },
  { name: 'view=incoming delivery_state=ARRIVING_TODAY', qs: 'view=incoming&delivery_state=ARRIVING_TODAY' },
  { name: 'view=incoming delivery_state=STALLED', qs: 'view=incoming&delivery_state=STALLED' },
  { name: 'view=incoming delivery_state=IN_TRANSIT', qs: 'view=incoming&delivery_state=IN_TRANSIT' },
  { name: 'view=incoming delivery_state=AWAITING_TRACKING', qs: 'view=incoming&delivery_state=AWAITING_TRACKING' },
  { name: 'view=incoming delivery_state=PENDING_CARRIER', qs: 'view=incoming&delivery_state=PENDING_CARRIER' },
  { name: 'view=incoming delivery_state=CARRIER_MISMATCH', qs: 'view=incoming&delivery_state=CARRIER_MISMATCH' },
  { name: 'view=incoming unknown delivery_state ignored', qs: 'view=incoming&delivery_state=NOT_A_BUCKET' },
  { name: 'view=incoming universal + inbound=ebay + link=zoho_pending', qs: 'view=incoming&inbound=ebay&link=zoho_pending', opts: { universalIncoming: true } },
  { name: 'view=incoming universal + inbound=zoho', qs: 'view=incoming&inbound=zoho', opts: { universalIncoming: true } },
  // The no-view ?week_start/?week_end fallback was deleted (Wave-2 dead-arm
  // removal) — week params are now ignored entirely, pinned here.
  { name: 'week params ignored (fallback arm removed)', qs: 'week_start=2026-06-01&week_end=2026-06-07' },
  { name: 'malformed week params also ignored', qs: 'week_start=junk&week_end=2026-06-07' },
  { name: 'limit clamp + offset', qs: 'limit=900&offset=40' },
  { name: 'junk limit degrades to NaN exactly like the old code', qs: 'limit=abc' },
  { name: 'unknown view falls back to default scoping', qs: 'view=bogus&search=x' },
];

for (const combo of LIST_COMBOS) {
  test(`list SQL matches legacy — ${combo.name}`, () => {
    const sp = new URLSearchParams(combo.qs);
    const opts: LegacySqlOpts = { ...DEFAULT_OPTS, ...combo.opts };
    const legacy = legacyBuildListSql(sp, opts);
    const next = buildReceivingLinesListSql({
      query: parseReceivingLinesQuery(sp),
      orgId: opts.orgId,
      viewerStaffId: opts.viewerStaffId,
      universalIncoming: opts.universalIncoming,
      applyScannedZohoExclusion: opts.applyScannedZohoExclusion,
    });
    assert.equal(next.list.sql, legacy.list.sql, 'list SQL text drifted from legacy');
    assert.deepEqual(next.list.params, legacy.list.params, 'list params drifted from legacy');
    assert.equal(next.count.sql, legacy.count.sql, 'count SQL text drifted from legacy');
    assert.deepEqual(next.count.params, legacy.count.params, 'count params drifted from legacy');
  });
}

test('needs-test return_scope partitions return and standard cartons', () => {
  const build = (scope: 'returns' | 'standard') =>
    buildReceivingLinesListSql({
      query: parseReceivingLinesQuery(
        new URLSearchParams(`view=needs-test&return_scope=${scope}`),
      ),
      orgId: ORG,
      viewerStaffId: NaN,
      universalIncoming: false,
      applyScannedZohoExclusion: true,
    });

  assert.match(build('returns').list.sql, /COALESCE\(r\.is_return, false\) = true/);
  assert.match(build('standard').list.sql, /COALESCE\(r\.is_return, false\) = false/);
});

test('needs-test priority_only filters explicit priority cartons', () => {
  const built = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(
      new URLSearchParams('view=needs-test&return_scope=all&priority_only=1'),
    ),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
  });
  assert.match(
    built.list.sql,
    /COALESCE\(r\.is_priority, false\) = true OR r\.priority_tier IS NOT NULL/,
  );
});

test('needs-test with tester scopes to assigned_tech_id; without tester is the full pool', () => {
  const scoped = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(
      new URLSearchParams('view=needs-test&tester=12'),
    ),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
  });
  assert.match(scoped.list.sql, /rlt\.assigned_tech_id = \$/);
  assert.ok(scoped.list.params.includes(12));

  const pool = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(new URLSearchParams('view=needs-test')),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
  });
  assert.doesNotMatch(pool.list.sql, /rlt\.assigned_tech_id = \$/);
});

test('scanned priority_only filters Unbox Urgent queue', () => {
  const built = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(
      new URLSearchParams('view=scanned&priority_only=1'),
    ),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
  });
  assert.match(
    built.list.sql,
    /COALESCE\(r\.is_priority, false\) = true OR r\.priority_tier IS NOT NULL/,
  );
});

test('testing history scopes membership and verdict rollup to the requested week', () => {
  const built = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(
      new URLSearchParams(
        'view=testing&tester=12&weekStart=2026-06-01&weekEnd=2026-06-07',
      ),
    ),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
  });

  assert.match(built.list.sql, /tr\.tested_by = \$2/);
  assert.match(
    built.list.sql,
    /tr\.created_at >= \(\$3::date AT TIME ZONE 'America\/Los_Angeles'\)/,
  );
  assert.match(
    built.list.sql,
    /tr\.created_at < \(\(\$4::date \+ 1\) AT TIME ZONE 'America\/Los_Angeles'\)/,
  );
  assert.match(built.list.sql, /GROUP BY tr\.receiving_line_id/);
  assert.doesNotMatch(built.list.sql, /EXISTS \(SELECT 1 FROM testing_results/);
  assert.deepEqual(built.list.params, [ORG, 12, '2026-06-01', '2026-06-07', 200, 0]);
  assert.deepEqual(built.count.params, [ORG, 12, '2026-06-01', '2026-06-07']);
});

// Layer 1 (rail read-after-write):
test('unbox_opened membership: flag OFF uses the column ∪ ops_events OR-arm', () => {
  const built = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(new URLSearchParams('view=unbox_opened')),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
    // unboxRailColumnRead omitted → defaults false
  });
  assert.ok(
    built.list.sql.includes(UNBOX_OPENED_PREDICATE_SQL),
    'flag-off must use the OR-arm membership predicate',
  );
});

test('unbox_opened membership: flag ON reads the committed column only', () => {
  const built = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(new URLSearchParams('view=unbox_opened')),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
    unboxRailColumnRead: true,
  });
  assert.ok(
    built.list.sql.includes(unboxOpenedPredicateSql(true)),
    'flag-on reads the committed receiving_unbox.opened_at column only',
  );
  assert.ok(
    !built.list.sql.includes(UNBOX_OPENED_PREDICATE_SQL),
    'flag-on must drop the OR-arm membership predicate',
  );
});

test('unbox_opened sort prefers first-open column over ops MAX / triage door times', () => {
  const built = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(new URLSearchParams('view=unbox_opened')),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
  });
  assert.match(
    built.list.sql,
    /ORDER BY COALESCE\(ru\.opened_at::text, unbox_open\.unbox_opened_at::text\) DESC NULLS LAST/,
    'ORDER BY must lead with first-open ru.opened_at (re-scan must not reorder)',
  );
  assert.match(
    built.list.sql,
    /COALESCE\(ru\.opened_at, unbox_open\.unbox_opened_at\)::text AS unbox_opened_at/,
    'select must expose first-open as unbox_opened_at for the rail age label',
  );
  // The ORDER BY clause must not fall through to triage door-scan times.
  const orderByIdx = built.list.sql.indexOf('ORDER BY COALESCE(ru.opened_at');
  assert.ok(orderByIdx >= 0);
  const orderByChunk = built.list.sql.slice(orderByIdx, orderByIdx + 200);
  assert.doesNotMatch(orderByChunk, /scan_first\.scanned_at/);
  assert.doesNotMatch(orderByChunk, /rt\.door_received_at/);
});

test('view=testing_opened membership and age use receiving_line_testing_opens', () => {
  const built = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(new URLSearchParams('view=testing_opened')),
    orgId: ORG,
    viewerStaffId: 42,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
  });
  assert.match(
    built.list.sql,
    /FROM receiving_line_testing_opens o/,
    'membership must read QC opens, not testing_results or receiving_line_views',
  );
  assert.doesNotMatch(
    built.list.sql,
    /FROM receiving_line_views/,
    'QC recents must not share Unbox receiving_line_views',
  );
  assert.match(
    built.list.sql,
    /AS testing_opened_at/,
    'select must expose testing_opened_at for the rail age label',
  );
  assert.match(
    built.list.sql,
    /ORDER BY \(SELECT o\.opened_at FROM receiving_line_testing_opens o/,
    'ORDER BY must be last QC-open',
  );
  assert.equal(built.list.params.includes(42), true);
});

test('view=testing_opened without viewer is an empty feed', () => {
  const built = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(new URLSearchParams('view=testing_opened')),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
  });
  assert.match(built.list.sql, /\bFALSE\b/);
});

test('History unboxed_newest matches Unboxed sidebar first-open axis', () => {
  const built = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(
      new URLSearchParams('view=activity&sort=unboxed_newest'),
    ),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
  });
  assert.match(
    built.list.sql,
    /ORDER BY COALESCE\(ru\.opened_at::text, unbox_open\.unbox_opened_at::text, ru\.unboxed_at::text\) DESC NULLS LAST/,
    'History Unboxed sort must prefer first-open before unbox-complete',
  );
  assert.match(
    built.list.sql,
    /COALESCE\(ru\.opened_at, unbox_open\.unbox_opened_at\)::text AS unbox_opened_at/,
    'activity feed must expose unbox_opened_at for stage/date cells',
  );
});

// ── Single-row and by-receiving-id branches ───────────────────────────────────

test('single-row (?id=) SQL matches legacy', () => {
  const legacy = legacyBuildLineByIdSql(4821, ORG);
  const next = buildReceivingLineByIdSql(4821, ORG);
  assert.equal(next.sql, legacy.sql);
  assert.deepEqual(next.params, legacy.params);
});

test('?receiving_id= lines + package SQL matches legacy', () => {
  const legacy = legacyBuildLinesByReceivingIdSql(917, ORG);
  const next = buildReceivingLinesByReceivingIdSql(917, ORG);
  assert.equal(next.lines.sql, legacy.lines.sql);
  assert.deepEqual(next.lines.params, legacy.lines.params);
  assert.equal(next.pkg.sql, legacy.pkg.sql);
  assert.deepEqual(next.pkg.params, legacy.pkg.params);
});

// ── Placeholder feeds (unmatched / unbox-opened lineless cartons) ─────────────

const UNMATCHED_COMBOS: Combo[] = [
  { name: 'search field=all', qs: 'view=all&search=1Z9' },
  { name: 'search field=po', qs: 'view=activity&search=PO-7&search_field=po' },
  { name: 'search field=tracking', qs: 'view=activity&search=9400&search_field=tracking' },
];

for (const combo of UNMATCHED_COMBOS) {
  test(`unmatched-placeholder SQL matches legacy — ${combo.name}`, () => {
    const sp = new URLSearchParams(combo.qs);
    const legacy = legacyBuildUnmatchedPlaceholdersSql(sp, { orgId: ORG });
    const next = buildUnmatchedPlaceholdersSql(parseReceivingLinesQuery(sp), ORG);
    assert.equal(next.list.sql, legacy.list.sql);
    assert.deepEqual(next.list.params, legacy.list.params);
    assert.equal(next.count.sql, legacy.count.sql);
    assert.deepEqual(next.count.params, legacy.count.params);
  });
}

const UNBOX_COMBOS: Combo[] = [
  { name: 'no search', qs: 'view=unbox_opened' },
  { name: 'search field=all', qs: 'view=unbox_opened&search=1Z9' },
  { name: 'search field=po', qs: 'view=unbox_opened&search=PO-7&search_field=po' },
  { name: 'search field=tracking', qs: 'view=unbox_opened&search=9400&search_field=tracking' },
];

for (const combo of UNBOX_COMBOS) {
  test(`unbox-opened-placeholder SQL matches legacy — ${combo.name}`, () => {
    const sp = new URLSearchParams(combo.qs);
    const legacy = legacyBuildUnboxOpenedPlaceholdersSql(sp, { orgId: ORG });
    const next = buildUnboxOpenedPlaceholdersSql(parseReceivingLinesQuery(sp), ORG);
    assert.equal(next.list.sql, legacy.list.sql);
    assert.deepEqual(next.list.params, legacy.list.params);
    assert.equal(next.count.sql, legacy.count.sql);
    assert.deepEqual(next.count.params, legacy.count.params);
  });
}

// ── Placeholder inclusion gates (mirrors the old inline booleans) ─────────────

test('unmatched placeholders include Docked arrival cartons and exclude line-only fields', () => {
  const q = (qs: string) => parseReceivingLinesQuery(new URLSearchParams(qs));
  assert.equal(shouldIncludeUnmatchedPlaceholders(q('view=all')), true);
  assert.equal(shouldIncludeUnmatchedPlaceholders(q('view=activity')), true);
  assert.equal(shouldIncludeUnmatchedPlaceholders(q('view=recent')), false);
  assert.equal(shouldIncludeUnmatchedPlaceholders(q('view=scanned')), true);
  assert.equal(shouldIncludeUnmatchedPlaceholders(q('')), false);
  // `?search_scope=zoho_po` normalizes to 'all' (PO-only scope removed from the
  // History UI; legacy bookmarks read as All) — so the zoho_po gate can never
  // fire from a parsed query today. Preserved behavior, pinned here.
  assert.equal(shouldIncludeUnmatchedPlaceholders(q('view=all&search_scope=zoho_po')), true);
  // Line-only search fields (sku/product/serial) skip lineless placeholders.
  assert.equal(shouldIncludeUnmatchedPlaceholders(q('view=all&search_field=sku')), false);
  assert.equal(shouldIncludeUnmatchedPlaceholders(q('view=all&search_field=product')), false);
  assert.equal(shouldIncludeUnmatchedPlaceholders(q('view=all&search_field=serial')), false);
  assert.equal(shouldIncludeUnmatchedPlaceholders(q('view=all&search_field=po')), true);
  assert.equal(shouldIncludeUnmatchedPlaceholders(q('view=all&search_field=tracking')), true);
});

test('Docked lines require a physical arrival and explicitly exclude every Unbox signal', () => {
  const built = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(new URLSearchParams('view=scanned&sort=scanned_newest')),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
  });
  assert.match(built.list.sql, /rt\.door_received_at IS NOT NULL/);
  assert.match(built.list.sql, /FROM receiving_scans rs_scanned/);
  assert.match(built.list.sql, /ru\.unboxed_at IS NULL/);
  assert.match(built.list.sql, /oe_unbox\.event_type = 'UNBOX_CONFIRMED'/);
  assert.match(built.list.sql, /COALESCE\(rl\.quantity_received, 0\) = 0/);
  assert.match(
    built.list.sql,
    /AND NOT \(\s*EXISTS \(\s*SELECT 1 FROM receiving_unbox ru_uo[\s\S]+oe_uo\.event_type = 'UNBOX_SCAN_OPENED'/,
  );
  assert.match(
    built.list.sql,
    /ORDER BY COALESCE\(scan_first\.scanned_at::text, rt\.door_received_at::text, rl\.created_at::text\) DESC/,
    'Docked must render newest arrival scans first',
  );
});

test('unmatched placeholders: Docked requires a physical touch; all stays ungated', () => {
  const DOCK_TOUCH = /SELECT 1 FROM receiving_triage rt_docked[\s\S]+SELECT 1 FROM receiving_scans rs_docked[\s\S]+oe_docked\.event_type = 'TRACKING_SCANNED'[\s\S]+FROM receiving_unbox ru_docked[\s\S]+oe_unbox\.event_type = 'UNBOX_SCAN_OPENED'/;
  const UNBOX_TOUCH = /ru\.unboxed_at IS NOT NULL[\s\S]+ru\.opened_at IS NOT NULL[\s\S]+unbox_open\.unbox_opened_at IS NOT NULL/;
  const BROWSE_SOURCES = /r\.source IN \('unmatched', 'local_pickup'\)/;
  const SEARCH_SOURCES = /r\.source IN \('unmatched', 'local_pickup', 'zoho_po'\)/;

  const docked = buildUnmatchedPlaceholdersSql(
    parseReceivingLinesQuery(new URLSearchParams('view=scanned')),
    ORG,
  );
  assert.match(docked.list.sql, DOCK_TOUCH, 'Docked list must gate on Arrival and reject Unbox');
  assert.match(docked.count.sql, DOCK_TOUCH, 'Docked count must use the same Arrival/Unbox gate');
  assert.match(docked.list.sql, BROWSE_SOURCES, 'browse Docked must not flood with lineless zoho_po');
  assert.doesNotMatch(docked.list.sql, SEARCH_SOURCES, 'browse Docked excludes zoho_po from placeholders');

  const unboxed = buildUnmatchedPlaceholdersSql(
    parseReceivingLinesQuery(new URLSearchParams('view=activity')),
    ORG,
  );
  assert.match(unboxed.list.sql, UNBOX_TOUCH, 'Unboxed must require an Unbox touch');
  assert.doesNotMatch(unboxed.list.sql, DOCK_TOUCH, 'Unboxed must not inherit Docked membership');

  const all = buildUnmatchedPlaceholdersSql(
    parseReceivingLinesQuery(new URLSearchParams('view=all')),
    ORG,
  );
  assert.doesNotMatch(all.list.sql, DOCK_TOUCH, 'view=all list must stay inclusive');
  assert.doesNotMatch(all.count.sql, DOCK_TOUCH, 'view=all count must stay inclusive');
});

test('unmatched placeholders: armed Unboxed search resolves lineless zoho_po without claiming it Docked', () => {
  const DOCK_TOUCH = /SELECT 1 FROM receiving_triage rt_docked[\s\S]+SELECT 1 FROM receiving_scans rs_docked/;
  const SEARCH_SOURCES = /r\.source IN \('unmatched', 'local_pickup', 'zoho_po'\)/;
  const searched = buildUnmatchedPlaceholdersSql(
    parseReceivingLinesQuery(
      new URLSearchParams('view=activity&search=9434608106244428194843&search_field=tracking'),
    ),
    ORG,
  );
  assert.match(searched.list.sql, SEARCH_SOURCES, 'armed search must resolve lineless zoho_po cartons');
  assert.match(searched.count.sql, SEARCH_SOURCES, 'armed search count must include zoho_po');
  assert.doesNotMatch(searched.list.sql, DOCK_TOUCH, 'armed search must resolve an exact carton before it is docked');
  assert.doesNotMatch(searched.count.sql, DOCK_TOUCH, 'armed search count must not use the browse gate');
});

test('unbox-opened placeholders included only for view=unbox_opened with the same gates', () => {
  const q = (qs: string) => parseReceivingLinesQuery(new URLSearchParams(qs));
  assert.equal(shouldIncludeUnboxOpenedPlaceholders(q('view=unbox_opened')), true);
  assert.equal(shouldIncludeUnboxOpenedPlaceholders(q('view=all')), false);
  // Same normalizer fold as above: zoho_po scope reads as All post-parse.
  assert.equal(shouldIncludeUnboxOpenedPlaceholders(q('view=unbox_opened&search_scope=zoho_po')), true);
  assert.equal(shouldIncludeUnboxOpenedPlaceholders(q('view=unbox_opened&search_field=serial')), false);
  assert.equal(shouldIncludeUnboxOpenedPlaceholders(q('view=unbox_opened&search_field=tracking')), true);
});

// ── serial_projection surfaced as `serials` (Tier B2 immediate-serial display) ─

test('serials column: rlt.serial_projection surfaced as `serials` in all list builders', () => {
  const list = buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(new URLSearchParams('view=activity')),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
  });
  const byId = buildReceivingLineByIdSql(4821, ORG);
  const byReceiving = buildReceivingLinesByReceivingIdSql(917, ORG);

  const COL = `COALESCE(rlt.serial_projection, '[]'::jsonb)   AS serials,`;
  assert.ok(list.list.sql.includes(COL), 'list builder must surface serials from rlt.serial_projection');
  assert.ok(byId.sql.includes(COL), 'by-id builder must surface serials from rlt.serial_projection');
  assert.ok(byReceiving.lines.sql.includes(COL), 'by-receiving builder must surface serials from rlt.serial_projection');
  // Byte-stable against the legacy fixture is already asserted by the equality
  // suites above; this just pins the projection read as intentional, not incidental.
});

test('?id= and ?receiving_id= surface zoho_status from zoho_po_mirror', () => {
  // Inventory Refresh re-fetches via ?id= then dispatchLine. Dropping these
  // columns nulls client zoho_status → coarse paint stays UNBOXED while the
  // Information leaf (dossier/mirror) shows RECEIVED.
  const byId = buildReceivingLineByIdSql(4821, ORG);
  const byReceiving = buildReceivingLinesByReceivingIdSql(917, ORG);
  for (const [label, sql] of [
    ['by-id', byId.sql],
    ['by-receiving', byReceiving.lines.sql],
  ] as const) {
    assert.match(sql, /mirror\.status\s+AS zoho_status/, `${label} must SELECT zoho_status`);
    assert.match(
      sql,
      /mirror\.last_synced_at::text\s+AS zoho_status_synced_at/,
      `${label} must SELECT zoho_status_synced_at`,
    );
    assert.match(
      sql,
      /LEFT JOIN zoho_po_mirror mirror/,
      `${label} must join zoho_po_mirror`,
    );
  }
});

test('?id= and ?receiving_id= surface the same who-and-when stamps', () => {
  // The Unbox workspace refreshes the open carton via ?receiving_id= and merges
  // over the ?id= row. When this branch lacked the staff columns, the merge
  // nulled them and "Received by" read "Not scanned in yet" on a scanned carton.
  const byId = buildReceivingLineByIdSql(4821, ORG).sql;
  const byReceiving = buildReceivingLinesByReceivingIdSql(917, ORG).lines.sql;
  for (const column of [
    'receiving_received_by',
    'receiving_unboxed_by',
    'receiving_unbox_opened_by',
    'received_by_name',
    'unboxed_by_name',
    'unbox_opened_by_name',
    'first_scanned_at',
    'first_scanned_by',
    'scanned_by_name',
  ]) {
    const alias = new RegExp(`AS ${column},`);
    assert.match(byId, alias, `by-id must SELECT ${column}`);
    assert.match(byReceiving, alias, `by-receiving must SELECT ${column}`);
  }
});

// ── ?tracking_in= — the bulk paste filter, and the lane relaxation it earns ───

const listFor = (qs: string, opts: Partial<LegacySqlOpts> = {}) =>
  buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(new URLSearchParams(qs)),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming: false,
    applyScannedZohoExclusion: true,
    ...opts,
  });

const NOT_ZOHO_RECEIVED =
  `COALESCE(mirror.status, '') NOT IN ('billed','closed','cancelled','received','rejected')`;

test('tracking_in filters on the INDEXED normalized column, with no last-8 OR arm', () => {
  const built = listFor('view=incoming&tracking_in=1Z999AA10123456784,9400111899223344556677');

  assert.ok(
    built.list.sql.includes('stn.tracking_number_normalized = ANY($2::text[])'),
    'must be an indexed equality against the unique btree',
  );
  // A `right(...) = last8` arm here would defeat the index — measured at ~357k cost for a single key on the sibling lookup.
  const last8s = (sql: string) =>
    sql.split('right(stn.tracking_number_normalized, 8)').length - 1;
  assert.equal(
    last8s(built.list.sql),
    last8s(listFor('view=incoming').list.sql),
    'the paste filter must not add a last-8 fallback arm',
  );
  assert.deepEqual(built.list.params[1], ['1Z999AA10123456784', '9400111899223344556677']);
  // The count query shares the same WHERE and therefore the same params.
  assert.deepEqual(built.count.params[1], built.list.params[1]);
});

test('tracking_in canonicalizes, dedupes and caps — a bookmark can never over-ask', () => {
  const built = listFor('view=incoming&tracking_in=1z999-aa1 01,1Z999AA101,,%20');
  assert.deepEqual(built.list.params[1], ['1Z999AA101']);

  const many = Array.from({ length: CHECK_ZOHO_RECEIVED_MAX_INPUTS + 37 }, (_, i) => `TRACK${String(i).padStart(6, '0')}`);
  const capped = listFor(`view=incoming&tracking_in=${many.join(',')}`);
  assert.equal((capped.list.params[1] as string[]).length, CHECK_ZOHO_RECEIVED_MAX_INPUTS);
});

test('ref_in narrows Unboxed to the pasted numbers and keeps its own population', () => {
  const plain = listFor('view=activity');
  const pasted = listFor('view=activity&ref_in=po-7,1z999-aa1 01');
  assert.deepEqual(pasted.list.params[1], ['PO7', '1Z999AA101'], 'the pasted keys ride right after the org');
  assert.ok(pasted.list.sql.includes('tracking_number_normalized = ANY($2::text[])'), 'the paste matches by key');
  // Everything the plain lane filters on still applies — the paste only narrows it.
  assert.ok(pasted.list.sql.length > plain.list.sql.length);
  assert.equal(listFor('view=all&ref_in=PO-7').list.params.some((p) => Array.isArray(p) && p.includes('PO7')), false, 'no other history view reads it');
});

test('tracking_in RELAXES the Incoming lane — a vendor-received row must come back', () => {
  // The whole point: paste 40, see 40. Without this the six the vendor already
  // marked received vanish with no explanation, which is the invisibility the
  // param exists to end.
  const plain = listFor('view=incoming');
  const pasted = listFor('view=incoming&tracking_in=1Z999AA10123456784');
  assert.ok(plain.list.sql.includes(NOT_ZOHO_RECEIVED), 'the default lane keeps its predicate');
  assert.ok(!pasted.list.sql.includes(NOT_ZOHO_RECEIVED), 'a named tracking outranks the lane predicate');

  // Universal Incoming keeps the guard INSIDE each source arm, so the relaxation
  // has to reach both without dropping the source-membership test with it.
  const universal = listFor('view=incoming&tracking_in=1Z999AA10123456784', { universalIncoming: true });
  assert.ok(!universal.list.sql.includes(NOT_ZOHO_RECEIVED));
  assert.ok(
    universal.list.sql.includes(`rz.zoho_purchaseorder_id IS NOT NULL`)
      && universal.list.sql.includes(`rl.inbound_source_type IN ('ebay', 'amazon', 'manual')`),
    'both source arms survive the relaxation',
  );
});

test('tracking_in suppresses the delivery-state facet — a stale chip must not eat pasted rows', () => {
  // `stn.has_exception = true` also appears in the delivery_state CASE that
  // every Incoming row is labelled with, so presence proves nothing — the facet
  // is the SECOND occurrence, in the WHERE.
  const stalledArms = (sql: string) => sql.split('stn.has_exception = true').length - 1;

  const plain = listFor('view=incoming');
  const faceted = listFor('view=incoming&delivery_state=STALLED');
  assert.equal(stalledArms(faceted.list.sql), stalledArms(plain.list.sql) + 1,
    'the facet narrows the WHERE on its own');

  const pasted = listFor('view=incoming&delivery_state=STALLED&tracking_in=1Z999AA10123456784');
  assert.equal(stalledArms(pasted.list.sql), stalledArms(plain.list.sql),
    'naming a tracking outranks a facet the operator armed earlier');
});

test('ref_in on Incoming keeps the awaiting-tracking list predicate', () => {
  const plain = listFor('view=incoming&delivery_state=AWAITING_TRACKING');
  const pasted = listFor('view=incoming&delivery_state=AWAITING_TRACKING&ref_in=27-15205-38270');
  assert.ok(pasted.list.sql.includes('stn.id IS NULL'), 'the facet stays — unlike tracking_in');
  assert.ok(pasted.list.sql.includes(NOT_ZOHO_RECEIVED), 'the open-PO guard stays');
  assert.ok(pasted.list.sql.includes('NOT ('), 'the dock-scan guard stays');
  assert.ok(pasted.list.sql.includes('tracking_number_normalized = ANY('), 'the paste cuts the same list');
  assert.ok(pasted.list.sql.length > plain.list.sql.length);
});

test('the relaxation is SCOPED — no other view or predicate loosens', () => {
  const scanned = listFor('view=scanned&tracking_in=1Z999AA10123456784');
  assert.ok(
    scanned.list.sql.includes(NOT_ZOHO_RECEIVED),
    'view=scanned keeps its own zoho exclusion; the bypass belongs to Incoming',
  );
  const pasted = listFor('view=incoming&tracking_in=1Z999AA10123456784');
  assert.ok(
    pasted.list.sql.includes(`rl.workflow_status = 'EXPECTED'`),
    'lane membership other than the vendor-receipt guard is untouched',
  );
});

// ── view=incoming_removed — "where did it go", derived, never stored ──────────

test('incoming_removed derives every exit and stores none of them', () => {
  const built = listFor('view=incoming_removed');
  const sql = built.list.sql;

  assert.ok(!sql.includes('removed_at IS NOT NULL'), 'there is no stored removal flag to read');
  // One arm per reason in the registry.
  assert.ok(sql.includes('ru.unboxed_at >'), 'unboxed');
  assert.ok(sql.includes("rx.exception_code IN ('LOST_IN_TRANSIT'"), 'written off');
  assert.ok(sql.includes('rt.door_received_at >'), 'dock scanned');
  assert.ok(sql.includes(`NOT ${NOT_ZOHO_RECEIVED}`), 'vendor received');
  assert.ok(sql.includes('stn.delivered_at <'), 'aged out of the hunt window');

  // The lane reads the vendor's POLL time because no transition time exists.
  assert.ok(sql.includes('mirror.last_synced_at'), 'ordered by what we actually know');
  assert.ok(sql.includes('AS removed_at'), 'the anchor is surfaced for the row face');
  assert.ok(sql.includes('ORDER BY removed_at DESC NULLS LAST'), 'most recently departed first');

  // Precedence lives in the registry, never in SQL — a CASE here would be the
  // second ladder `resolveIncomingRemovalReason` exists to prevent.
  assert.ok(!sql.includes('AS removed_reason'), 'the reason is resolved on the row, not in SQL');
  assert.ok(sql.includes('AS removed_written_off') && sql.includes('AS removed_aged_out'),
    'only the two signals the row shape lacks are computed server-side');
});

test('incoming_removed joins the mirror in BOTH the list and its COUNT', () => {
  // Every alias the lane predicate names must exist in the count query too, or
  // the pager reports a total the list can never produce.
  const built = listFor('view=incoming_removed');
  for (const sql of [built.list.sql, built.count.sql]) {
    assert.ok(sql.includes('LEFT JOIN zoho_po_mirror mirror'), 'mirror is joined');
    assert.ok(sql.includes('LEFT JOIN receiving_triage rt'), 'rt is joined');
    assert.ok(sql.includes('LEFT JOIN receiving_unbox ru'), 'ru is joined');
    assert.ok(sql.includes('LEFT JOIN shipping_tracking_numbers stn'), 'stn is joined');
  }
  // The dock-scan arm is an EXISTS precisely because scan_first is list-only.
  assert.ok(!built.count.sql.includes('scan_first'), 'the count query must not need a list-only LATERAL');
  assert.ok(built.count.sql.includes('receiving_scans rs_removed'), 'so the scan recency is an EXISTS');
});

test('tracking_in works on the removed lane — it is where a fruitless paste lands', () => {
  const built = listFor('view=incoming_removed&tracking_in=1Z999AA10123456784');
  assert.ok(built.list.sql.includes('stn.tracking_number_normalized = ANY($2::text[])'));
  assert.deepEqual(built.list.params[1], ['1Z999AA10123456784']);
});

// ── view=reconcile — every line a pasted order / tracking list names ─────────

test('reconcile matches the pasted keys on tracking, PO number, PO id and order id — with no lane membership', () => {
  const built = listFor('view=reconcile&ref_in=PO-10423,1z999-aa1-0123456784,12-34567-89012');
  const sql = built.list.sql;
  assert.deepEqual(built.list.params[1], ['PO10423', '1Z999AA10123456784', '123456789012']);
  for (const arm of [
    'stn.tracking_number_normalized = ANY($2::text[])',
    'rz.zoho_purchaseorder_number_norm = ANY($2::text[])',
    'rz.zoho_purchaseorder_id::text = ANY($2::text[])',
    `regexp_replace(upper(COALESCE(rl.source_order_id, '')), '[^A-Z0-9]', '', 'g') = ANY($2::text[])`,
  ]) {
    assert.ok(sql.includes(arm), arm);
  }
  // A received, unboxed or failed line must come back: no lane predicate at all.
  assert.ok(!sql.includes(`rl.workflow_status = 'EXPECTED'`));
  assert.ok(!sql.includes(NOT_ZOHO_RECEIVED));
  // Painted by the Incoming ledger, so it carries the Incoming decorations.
  assert.ok(sql.includes('AS delivery_state'));
  assert.equal(built.count.params[1], built.list.params[1], 'the count names the same keys');
});

test('reconcile without a list returns nothing, never the whole org', () => {
  const built = listFor('view=reconcile');
  assert.ok(/WHERE rl\.organization_id = \$1 AND FALSE/.test(built.list.sql.replace(/\s+/g, ' ')));
});

test('reconcile brings lineless door-scanned cartons the list names, from any source', () => {
  const query = parseReceivingLinesQuery(new URLSearchParams('view=reconcile&ref_in=1Z999AA10123456784,PO-7'));
  assert.equal(shouldIncludeUnmatchedPlaceholders(query), true);
  const placeholders = buildUnmatchedPlaceholdersSql(query, ORG);
  assert.deepEqual(placeholders.list.params, [ORG, ['1Z999AA10123456784', 'PO7']]);
  assert.ok(placeholders.list.sql.includes('stn.tracking_number_normalized = ANY($2::text[])'));
  assert.ok(!placeholders.list.sql.includes('r.source IN'), 'a scanned zoho_po carton counts too');
  // Every carton the list names (bounded by its keys), never the 150-row browse cap.
  assert.ok(!/LIMIT 150/.test(placeholders.list.sql));
  assert.ok(/LIMIT 150/.test(buildUnmatchedPlaceholdersSql(parseReceivingLinesQuery(new URLSearchParams('view=all')), ORG).list.sql));
  assert.equal(
    shouldIncludeUnmatchedPlaceholders(parseReceivingLinesQuery(new URLSearchParams('view=reconcile'))),
    false,
  );
});

// ── view=exceptions — Inbound lines that need a person ───────────────────────

const exceptionsFor = (warehousePostal?: string, universalIncoming = false) =>
  buildReceivingLinesListSql({
    query: parseReceivingLinesQuery(new URLSearchParams('view=exceptions&limit=50&offset=0')),
    orgId: ORG,
    viewerStaffId: NaN,
    universalIncoming,
    applyScannedZohoExclusion: true,
    warehousePostal,
  });

test('exceptions never judges by the ERP received status — only a cancelled PO drops out', () => {
  const sql = exceptionsFor('92647').list.sql;
  assert.ok(!sql.includes(NOT_ZOHO_RECEIVED), 'a Zoho-received PO is not excluded — physical facts decide');
  assert.ok(sql.includes(`COALESCE(mirror.status, '') NOT IN ('cancelled','rejected')`), 'a dead PO is nobody’s problem');
  assert.ok(!sql.includes(`IN ('received','billed','closed')`), 'no exception reads the ERP received status');
  // Physical-first: a received line never labels, and a tracking scan keeps it out.
  assert.ok(sql.includes(`rl.workflow_status = 'EXPECTED'`));
  assert.ok(sql.includes('ru.unboxed_at IS NOT NULL') && sql.includes('rt.door_received_at IS NOT NULL'));
});

test('exceptions judges wrong destination against the org ZIP, and not at all without one', () => {
  const withZip = exceptionsFor('92647-1234');
  assert.equal(withZip.list.params[1], '92647', 'the ZIP5, normalized once');
  assert.ok(withZip.list.sql.includes(`<> $2`) && withZip.list.sql.includes(`'WRONG_DESTINATION'`));
  assert.ok(withZip.list.sql.includes('$2::text AS warehouse_postal'));
  assert.equal(withZip.count.params[1], '92647', 'the count judges by the same ZIP');
  assert.equal(withZip.count.params.length, withZip.list.params.length - 2, 'count = list without LIMIT / OFFSET');

  for (const unset of [undefined, '', 'n/a']) {
    const without = exceptionsFor(unset);
    assert.ok(!without.list.sql.includes(`'WRONG_DESTINATION'`), `no crying wolf (${String(unset)})`);
    assert.ok(without.list.sql.includes('NULL::text AS warehouse_postal'));
    assert.equal(without.list.params.length, 3, 'org + LIMIT + OFFSET only');
  }
});

test('exceptions joins every alias its CASE reads in the COUNT too', () => {
  const built = exceptionsFor('92647', true);
  for (const sql of [built.list.sql, built.count.sql]) {
    for (const join of ['LEFT JOIN zoho_po_mirror mirror', ') stn_evt ON TRUE', 'LEFT JOIN receiving_unbox ru', 'LEFT JOIN receiving_triage rt']) {
      assert.ok(sql.includes(join), join);
    }
  }
  assert.ok(built.list.sql.includes(`AS exception_code`) && built.list.sql.includes('AS delivery_state'));
  assert.ok(
    built.list.sql.includes(`rl.inbound_source_type IN ('ebay', 'amazon', 'manual')`),
    'Universal Incoming marketplace lines can be exceptions too',
  );
});

test('Incoming + reconcile project the carrier facts the sheet carried (signer, attempts, ETA)', () => {
  for (const qs of ['view=incoming', 'view=reconcile&ref_in=PO-7']) {
    const { sql } = listFor(qs).list;
    assert.ok(sql.includes(`->> 'receivedByName'`) && sql.includes(`->> 'receivedBy'`), `${qs}: FedEx + UPS signer paths`);
    assert.ok(sql.includes('AS shipment_signed_by'), `${qs}: signer column`);
    assert.ok(sql.includes('AS shipment_delivery_attempts'), `${qs}: attempts column`);
    assert.ok(sql.includes('stn.estimated_delivery_at::text      AS shipment_estimated_delivery_at'), `${qs}: ETA column`);
  }
  assert.equal(listFor('view=all').list.sql.includes('AS shipment_signed_by'), false, 'history views stay lean');
});

test('unmatched placeholders carry the same carrier facts — a pasted line-less carton still shows its signer', () => {
  const built = buildUnmatchedPlaceholdersSql(parseReceivingLinesQuery(new URLSearchParams('view=reconcile&ref_in=PO-7')), ORG);
  for (const column of ['shipment_signed_by', 'shipment_delivery_attempts', 'shipment_estimated_delivery_at']) {
    assert.ok(built.list.sql.includes(`AS ${column}`), column);
  }
});
