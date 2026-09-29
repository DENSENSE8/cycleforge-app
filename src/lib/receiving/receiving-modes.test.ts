import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getReceivingModeDescriptor,
  getReceivingTableModeDescriptor,
  resolveReceivingTableMode,
  resolveUnboxReceivingTableMode,
  RECEIVING_MODES,
  INCOMING_PAGE_SIZE,
  RECEIVING_TABLE_LIMIT,
  RECEIVING_HISTORY_LIMIT,
  HISTORY_SORT_OPTIONS,
  HISTORY_SORT_WIRE_IDS,
  historySortGroupAxis,
  type ReceivingModeContext,
} from '@/lib/receiving/receiving-modes';
import {
  parseReceivingView,
  isReceivingView,
  RECEIVING_VIEWS,
} from '@/lib/receiving/receiving-views';
import {
  UNBOX_WORKSPACE_TAB_LABEL,
  UNBOX_WORKSPACE_TABS,
} from '@/utils/unbox-workspace-state';

/** A neutral context — no search, no facets, default page. */
function ctx(overrides: Partial<ReceivingModeContext> = {}): ReceivingModeContext {
  return {
    historySearch: '',
    historySearchField: 'all',
    historySearchScope: 'all',
    historySort: '',
    incomingSearch: '',
    incomingState: null,
    incomingSort: '',
    incomingPoFrom: '',
    incomingPoTo: '',
    incomingPage: 1,
    incomingSource: 'all',
    isDeliveredUnscannedFacet: false,
    isDeliveredNotUnboxedFacet: false,
    staffFilterId: null,
    listSearch: '',
    queueStage: null,
    queueLane: null,
    priorityOnly: false,
    trackingIn: [],
    refIn: [],
    incomingExceptions: false,
    ...overrides,
  };
}

// ── Mode resolution ──────────────────────────────────────────────────────────

test('resolveReceivingTableMode maps the URL ?mode= to a table mode', () => {
  assert.equal(resolveReceivingTableMode('incoming'), 'incoming');
  assert.equal(resolveReceivingTableMode('history'), 'history');
  assert.equal(resolveReceivingTableMode('receive'), 'receive');
  // Unknown / absent / sidebar-only modes fall back to Receive.
  assert.equal(resolveReceivingTableMode(null), 'receive');
  assert.equal(resolveReceivingTableMode(undefined), 'receive');
  assert.equal(resolveReceivingTableMode('pickup'), 'receive');
  assert.equal(resolveReceivingTableMode('unfound'), 'receive');
});

test('resolveUnboxReceivingTableMode maps workbench tabs to table modes', () => {
  assert.equal(resolveUnboxReceivingTableMode('queue'), 'unbox_queue');
  // The UI's `recent` tab (this operator's opens) resolves to the SERVER's
  // `unbox_viewed` mode — the seam between the two vocabularies.
  assert.equal(resolveUnboxReceivingTableMode('recent'), 'unbox_viewed');
  assert.equal(resolveUnboxReceivingTableMode('history'), 'history');
});

test('Unbox tab labels follow the house vocabulary (Recent, not Viewed)', () => {
  assert.equal(UNBOX_WORKSPACE_TAB_LABEL.incoming, 'Inbound');
  assert.equal(UNBOX_WORKSPACE_TAB_LABEL.recent, 'Recent');
  assert.equal(UNBOX_WORKSPACE_TAB_LABEL.queue, 'Queue');
  assert.equal(UNBOX_WORKSPACE_TAB_LABEL.all, 'All');
  assert.equal(UNBOX_WORKSPACE_TAB_LABEL.history, 'History');
});

test('Inbound leads the strip and History closes it', () => {
  assert.deepEqual([...UNBOX_WORKSPACE_TABS], ['incoming', 'queue', 'recent', 'history']);
});

test('Queue and All resolve to the queue table mode', () => {
  assert.equal(resolveUnboxReceivingTableMode('all'), 'unbox_queue');
  assert.equal(resolveUnboxReceivingTableMode('queue'), 'unbox_queue');
});

test('Inbound tab resolves to the incoming table mode', () => {
  assert.equal(resolveUnboxReceivingTableMode('incoming'), 'incoming');
});

test('Unbox queue buildParams sets priority_only when Urgent', () => {
  const mode = getReceivingTableModeDescriptor('unbox_queue');
  const p = mode.buildParams(ctx({ priorityOnly: true }));
  assert.equal(p.get('priority_only'), '1');
  assert.equal(p.get('view'), 'scanned');
});

// ── The core invariant: History is the scanned/unpacked log, NOT incoming ────

test('History requests view=activity, NOT all (incoming rows must not leak in)', () => {
  const history = getReceivingModeDescriptor('history');
  assert.equal(history.apiView, 'activity');
  // Regression guard for the original bug: 'all' includes untouched-incoming
  // EXPECTED rows, so History must never use it.
  assert.notEqual(history.apiView, 'all');
});

test('Incoming requests view=incoming and paginates server-side', () => {
  const incoming = getReceivingModeDescriptor('incoming');
  assert.equal(incoming.apiView, 'incoming');
  assert.equal(incoming.pageSize, INCOMING_PAGE_SIZE);
  assert.equal(incoming.serverSorted, true);
  assert.equal(incoming.isIncoming, true);
  assert.equal(incoming.groupAxis, 'po_date');
});

test('Receive uses the broad all bucket on a long scroll', () => {
  const receive = getReceivingModeDescriptor('receive');
  assert.equal(receive.apiView, 'all');
  assert.equal(receive.pageSize, null);
  assert.equal(receive.serverSorted, false);
  assert.equal(receive.groupAxis, 'activity');
});

test('Unbox Queue requests view=scanned with priority sort', () => {
  const p = RECEIVING_MODES.unbox_queue.buildParams(ctx());
  assert.equal(p.get('view'), 'scanned');
  assert.equal(p.get('sort'), 'priority');
  assert.equal(RECEIVING_MODES.unbox_queue.skipWeekFilter(ctx()), true);
});

test('Deliveries Docked reads the Arrival scan feed without queue priority semantics', () => {
  const mode = RECEIVING_MODES.docked;
  const p = mode.buildParams(ctx({ historySearch: '8194843', historySearchField: 'tracking', staffFilterId: 7 }));
  assert.equal(mode.apiView, 'scanned');
  assert.equal(p.get('view'), 'scanned');
  assert.equal(p.get('sort'), 'scanned_newest');
  assert.equal(p.get('search'), '8194843');
  assert.equal(p.get('search_field'), 'tracking');
  assert.equal(p.get('staff'), '7');
  assert.notDeepEqual(mode.queryKey(ctx({ historySearch: '8194843' })), mode.queryKey(ctx()));
});

test('Unbox Viewed requests view=viewed', () => {
  const p = RECEIVING_MODES.unbox_viewed.buildParams(ctx({ listSearch: '1Z' }));
  assert.equal(p.get('view'), 'viewed');
  assert.equal(p.get('search'), '1Z');
});

test('staff filter forwards on history + unbox modes', () => {
  assert.equal(
    RECEIVING_MODES.history.buildParams(ctx({ staffFilterId: 7 })).get('staff'),
    '7',
  );
  assert.equal(
    RECEIVING_MODES.unbox_queue.buildParams(ctx({ staffFilterId: 7 })).get('staff'),
    '7',
  );
  assert.equal(
    RECEIVING_MODES.docked.buildParams(ctx({ staffFilterId: 7 })).get('staff'),
    '7',
  );
  assert.equal(RECEIVING_MODES.history.buildParams(ctx()).get('staff'), null);
});

// ── buildParams ──────────────────────────────────────────────────────────────

test('history buildParams sets view=activity + search facets', () => {
  const p = RECEIVING_MODES.history.buildParams(
    ctx({ historySearch: 'acme', historySearchField: 'po', historySearchScope: 'unmatched' }),
  );
  assert.equal(p.get('view'), 'activity');
  assert.equal(p.get('search'), 'acme');
  assert.equal(p.get('search_field'), 'po');
  assert.equal(p.get('search_scope'), 'unmatched');
  // Operator 2026-09-14: History fetches the ENTIRE timeline — its ceiling is
  // RECEIVING_HISTORY_LIMIT, not the funnel-page RECEIVING_TABLE_LIMIT.
  assert.equal(p.get('limit'), String(RECEIVING_HISTORY_LIMIT));
  assert.equal(p.get('offset'), '0');
});

test('history buildParams omits search when blank but always sends field/scope', () => {
  const p = RECEIVING_MODES.history.buildParams(ctx());
  assert.equal(p.has('search'), false);
  assert.equal(p.get('search_field'), 'all');
  assert.equal(p.get('search_scope'), 'all');
});

test('history sort: default unboxed is always sent; scanned wire still accepted for Docked Triage', () => {
  assert.equal(
    RECEIVING_MODES.history.buildParams(ctx()).get('sort'),
    'unboxed_newest',
  );
  assert.equal(
    RECEIVING_MODES.history.buildParams(ctx({ historySort: 'unboxed_newest' })).get('sort'),
    'unboxed_newest',
  );
  assert.equal(
    RECEIVING_MODES.history.buildParams(ctx({ historySort: 'scanned_newest' })).get('sort'),
    'scanned_newest',
  );
});

test('Unbox History Sort-by menu is Unboxed only (Scanned is triage / Docked wire)', () => {
  assert.deepEqual(
    HISTORY_SORT_OPTIONS.map((o) => o.id),
    ['unboxed_newest'],
  );
  assert.ok(HISTORY_SORT_WIRE_IDS.includes('scanned_newest'));
});

test('historySortGroupAxis maps sort ids to lifecycle axes', () => {
  assert.equal(historySortGroupAxis(''), 'unboxed');
  assert.equal(historySortGroupAxis('unboxed_newest'), 'unboxed');
  assert.equal(historySortGroupAxis('scanned_newest'), 'scanned');
  assert.equal(historySortGroupAxis('received_newest'), 'unboxed');
});

test('history sort axis varies the query key so a sort flip refetches', () => {
  const unboxed = RECEIVING_MODES.history.queryKey(ctx());
  const scanned = RECEIVING_MODES.history.queryKey(ctx({ historySort: 'scanned_newest' }));
  assert.notDeepEqual(unboxed, scanned);
});

test('incoming buildParams computes server offset from the 1-based page', () => {
  const p = RECEIVING_MODES.incoming.buildParams(ctx({ incomingPage: 3 }));
  assert.equal(p.get('view'), 'incoming');
  assert.equal(p.get('limit'), String(INCOMING_PAGE_SIZE));
  assert.equal(p.get('offset'), String(2 * INCOMING_PAGE_SIZE));
});

test('incoming buildParams forwards facet + sort + date range, defaults search to PO#', () => {
  const p = RECEIVING_MODES.incoming.buildParams(
    ctx({
      incomingSearch: '12345',
      incomingState: 'STALLED',
      incomingSort: 'zoho_oldest',
      incomingPoFrom: '2026-01-01',
      incomingPoTo: '2026-02-01',
    }),
  );
  assert.equal(p.get('search'), '12345');
  assert.equal(p.get('search_field'), 'po');
  assert.equal(p.get('delivery_state'), 'STALLED');
  assert.equal(p.get('sort'), 'zoho_oldest');
  assert.equal(p.get('po_from'), '2026-01-01');
  assert.equal(p.get('po_to'), '2026-02-01');
});

test('incoming buildParams maps the purchasing-source tab to ?inbound (all = no param)', () => {
  assert.equal(RECEIVING_MODES.incoming.buildParams(ctx()).get('inbound'), null);
  assert.equal(
    RECEIVING_MODES.incoming.buildParams(ctx({ incomingSource: 'zoho' })).get('inbound'),
    'zoho',
  );
  assert.equal(
    RECEIVING_MODES.incoming.buildParams(ctx({ incomingSource: 'ebay' })).get('inbound'),
    'ebay',
  );
});

test('incoming queryKey varies by purchasing source so a tab flip refetches', () => {
  const all = RECEIVING_MODES.incoming.queryKey(ctx());
  const ebay = RECEIVING_MODES.incoming.queryKey(ctx({ incomingSource: 'ebay' }));
  assert.notDeepEqual(all, ebay);
});

// ── skipWeekFilter ───────────────────────────────────────────────────────────

test('skipWeekFilter: receive keeps weeks; incoming always skips', () => {
  assert.equal(RECEIVING_MODES.receive.skipWeekFilter(ctx()), false);
  assert.equal(RECEIVING_MODES.incoming.skipWeekFilter(ctx()), true);
});
test('skipWeekFilter: history is ALL TIME by default; a week narrows only when explicit', () => {
  // Operator 2026-09-14: the inbound history displays the ENTIRE history by
  // default — no week slicing unless ?weekOffset is explicitly in the URL.
  assert.equal(RECEIVING_MODES.history.skipWeekFilter(ctx()), true);
  assert.equal(
    RECEIVING_MODES.history.skipWeekFilter(ctx({ historyWeekExplicit: true })),
    false,
  );
  // Search / non-default scope still narrows globally regardless of week.
  assert.equal(RECEIVING_MODES.history.skipWeekFilter(ctx({ historySearch: 'x' })), true);
  assert.equal(
    RECEIVING_MODES.history.skipWeekFilter(ctx({ historySearchScope: 'zoho_po' })),
    true,
  );
});

// ── emptyMessage ─────────────────────────────────────────────────────────────

test('emptyMessage reflects mode + facet context', () => {
  assert.match(RECEIVING_MODES.history.emptyMessage(ctx({ historySearch: 'x' })), /No lines match/);
  assert.match(RECEIVING_MODES.history.emptyMessage(ctx()), /start scanning/);
  assert.match(RECEIVING_MODES.incoming.emptyMessage(ctx()), /No incoming POs/);
  assert.match(
    RECEIVING_MODES.incoming.emptyMessage(ctx({ incomingSource: 'ebay' })),
    /No eBay purchases yet/,
  );
  assert.match(
    RECEIVING_MODES.incoming.emptyMessage(ctx({ isDeliveredUnscannedFacet: true })),
    /delivered-and-unscanned/,
  );
});

test('an empty lane under a PASTE never explains the guard the paste removed', () => {
  // `?tracking_in=` drops NOT_ZOHO_RECEIVED server-side, so the default line ("Zoho says everything issued is already received") describes a…
  for (const mode of ['incoming', 'incoming_removed'] as const) {
    const msg = RECEIVING_MODES[mode].emptyMessage(ctx({ trackingIn: ['ABC123'] }));
    assert.doesNotMatch(
      msg,
      /already received/i,
      `${mode}: must not explain the vendor-receipt guard under a paste`,
    );
    assert.match(msg, /tracking number/i, `${mode}: must name the paste as the reason`);
  }
});

// ── queryKey isolation ───────────────────────────────────────────────────────

test('each mode produces a distinct query-key namespace', () => {
  const h = RECEIVING_MODES.history.queryKey(ctx());
  const i = RECEIVING_MODES.incoming.queryKey(ctx());
  const r = RECEIVING_MODES.receive.queryKey(ctx());
  assert.equal(h[2], 'history');
  assert.equal(i[2], 'incoming');
  assert.equal(r[2], 'receive');
  // Incoming page must be part of its key so paging refetches.
  const i2 = RECEIVING_MODES.incoming.queryKey(ctx({ incomingPage: 2 }));
  assert.notDeepEqual(i, i2);
});

// ── Shared view contract ─────────────────────────────────────────────────────

test('parseReceivingView accepts the full server set and rejects junk', () => {
  for (const v of RECEIVING_VIEWS) {
    assert.equal(parseReceivingView(v), v);
  }
  // The two views that previously existed only server-side must round-trip.
  assert.equal(parseReceivingView('activity'), 'activity');
  assert.equal(parseReceivingView('testing'), 'testing');
  assert.equal(parseReceivingView('needs-test'), 'needs-test'); // testing to-do (P1-PCK-03)
  assert.equal(parseReceivingView('ALL'), 'all'); // case-insensitive
  assert.equal(parseReceivingView('bogus'), null);
  assert.equal(parseReceivingView(''), null);
  assert.equal(parseReceivingView(null), null);
});

test('every descriptor apiView is a valid ReceivingView', () => {
  for (const descriptor of Object.values(RECEIVING_MODES)) {
    assert.ok(isReceivingView(descriptor.apiView), `${descriptor.id} -> ${descriptor.apiView}`);
  }
});
