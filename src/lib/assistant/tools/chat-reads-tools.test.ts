/**
 * DB-free tests for the ChatReads tools: reconcile_refs, get_customer,
 * get_worklist, get_staff_report, get_tracking_status / watch_tracking.
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/assistant/tools/chat-reads-tools.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitToolArtifact } from '@/lib/assistant/tool-artifact';
import { planIdentifierTurn } from '@/lib/assistant/identifier-turn';
import type { IdentifyLine } from '@/lib/identify/schema';
import type { PomodoroReport } from '@/lib/pomodoro/contract';
import type { PackingKpiSummary } from '@/lib/packing/packer-kpi-queries';
import { parseRefList, type ReconEntry } from '@/lib/receiving/reconcile';
import { buildReconcileEnvelope, classifyRefs, extractRefText, isRefListPaste } from './reconcile-refs-tool';
import { buildCandidatesEnvelope, buildDossierEnvelope, customerQueryKind } from './customer-dossier-tool';
import {
  buildOverviewEnvelope,
  daysPastShipBy,
  rankByUrgency,
  setWorklistSourcesForTest,
  workItemFromOrder,
  type WorkItem,
} from './worklist-tool';
import { buildStaffReport, daysBetween, foldStaffDays } from './staff-report-tool';
import { buildTrackingEnvelope } from './tracking-tools';
import { buildWriteToolMap, dispatchToolCall } from './dispatch';
import { buildWriteTools } from './write-tools';
import { runAssistantTool } from './index';
import type { AssistantToolCtx } from './types';

const ORG = '11111111-2222-3333-4444-555555555555';
const ALL: ReadonlySet<string> = { has: () => true } as unknown as ReadonlySet<string>;
const CTX: AssistantToolCtx = { organizationId: ORG, staffId: 7, permissions: ALL, accessMode: 'full' };

// ─── reconcile_refs ──────────────────────────────────────────────────────────

test('extractRefText keeps only the pasted numbers, never header words or bullets', () => {
  const text = 'check these for me:\n1. 1Z999AA10123456784\n- PO-55123929, 21-15107-47310\nthanks';
  assert.equal(extractRefText(text), '1Z999AA10123456784\nPO-55123929\n21-15107-47310');
});

test('isRefListPaste: a list with a header passes; a question, one line, or a PO paste does not', () => {
  assert.equal(isRefListPaste('which of these did we get?\n1Z999AA10123456784\n9400111899223344556677\nPO-7'), true);
  assert.equal(isRefListPaste('1Z999AA10123456784\n9400111899223344556677'), true);
  assert.equal(isRefListPaste('1Z999AA10123456784'), false);
  assert.equal(isRefListPaste('Where is order 21-15107-47310?'), false);
  // A pasted PO has labels and quantities on its lines — the PO import draft owns it.
  assert.equal(isRefListPaste('PO 55123929\nVendor: Acme\nTracking: 1Z999AA10123456784\nSKU A-1 qty 2'), false);
});

function entry(ref: string, patch: Partial<ReconEntry>): ReconEntry {
  return { ref, key: ref.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), status: 'not_received', detail: 'Ordered · no tracking', poNumber: null, vendor: null, exception: null, ...patch };
}

function line(input: string, candidates: Array<Partial<IdentifyLine['candidates'][number]>>): IdentifyLine {
  return {
    input,
    mode: candidates.length ? 'single' : 'none',
    tokens: [],
    filters: { brands: [], conditions: [] },
    candidates: candidates.map((c, i) => ({
      kind: 'order',
      entityId: i + 1,
      title: 'Bose PCB board',
      subtitle: `${input} · eBay`,
      brand: null,
      confidence: 1,
      matchedOn: { field: 'order_id', token: input },
      href: '/x',
      actions: [],
      stage: 'to_ship',
      inContext: false,
      ...c,
    })) as IdentifyLine['candidates'],
  };
}

test('classifyRefs: inbound verdict wins when inbound owns the number; outbound orders are pending / shipped; unknown is not in system', () => {
  const rows = classifyRefs(
    [
      entry('1Z1', { status: 'received', detail: 'Unboxed', poNumber: 'PO-1', vendor: 'Acme' }),
      entry('PO-2', { detail: 'PO issued', poNumber: 'PO-2' }),
      entry('21-1', { exception: { reason: 'No match anywhere', inView: false } }),
      // A local tracking row alone (no PO) does not make an outbound tracking "not received".
      entry('9400', { reasonCode: 'in_transit', detail: 'In transit' }),
      entry('SHIP-9', { exception: { reason: 'No match anywhere', inView: false } }),
      entry('NOPE-1', { exception: { reason: 'No match anywhere', inView: false } }),
    ],
    [line('21-1', [{}]), line('9400', [{ stage: 'exception' }]), line('SHIP-9', [{ stage: 'shipped' }]), line('NOPE-1', [])],
  );
  assert.deepEqual(
    rows.map((r) => [r.ref, r.group, r.status]),
    [
      ['1Z1', 'received', 'Unboxed'],
      ['PO-2', 'not_received', 'PO issued'],
      ['21-1', 'pending', 'To ship'],
      ['9400', 'pending', 'In exceptions'],
      ['SHIP-9', 'shipped', 'Shipped'],
      ['NOPE-1', 'not_in_system', 'Not found in Zoho, receiving or orders'],
    ],
  );
  assert.equal(rows[2].record, '21-1');
});

test('reconcile envelope: counts header, names the refs that need a person, validates as a table', () => {
  const rows = classifyRefs(
    [entry('1Z1', { status: 'received', detail: 'Unboxed' }), entry('PO-2', { poNumber: 'PO-2' }), entry('NOPE-1', { exception: { reason: 'No match anywhere', inView: false } })],
    [],
  );
  const env = buildReconcileEnvelope(rows, 0);
  const split = splitToolArtifact(env);
  assert.ok(split && split.artifact.kind === 'table');
  assert.equal(split.tool, 'reconcile_refs');
  assert.equal(env.answer, '3 numbers: 1 received · 1 not received · 1 not in system · 0 pending. Not received: PO-2. Not in system: NOPE-1.');
  assert.deepEqual(split.artifact.kind === 'table' ? split.artifact.rows.map((r) => r.Group) : [], ['Received', 'Not received', 'Not in system']);
});

test('reconcile_refs reads the list from the message; the fast path takes a pasted list without a model', async () => {
  const plan = await planIdentifierTurn(ORG, 'PO-55123929\n1Z999AA10123456784\n21-15107-47310', {
    identify: async () => {
      throw new Error('a pasted list must not be identified one-by-one');
    },
  });
  assert.deepEqual(plan, { tool: 'reconcile_refs', input: {}, onlyIfFound: false });
  const empty = await runAssistantTool('reconcile_refs', {}, { ...CTX, userMessage: 'can you check the list?' });
  assert.deepEqual(empty.ok && empty.data, { found: false, message: 'No tracking, order or PO numbers were found in the message to reconcile.' });
  assert.equal(parseRefList(extractRefText('check:\nPO-1\nPO-1')).refs.length, 1);
});

// ─── get_customer ────────────────────────────────────────────────────────────

test('customerQueryKind: email, typed phone, else name', () => {
  assert.equal(customerQueryKind('jane@x.com'), 'email');
  assert.equal(customerQueryKind('(512) 555-0101'), 'phone');
  assert.equal(customerQueryKind('+1 512 555 0101'), 'phone');
  assert.equal(customerQueryKind('Jane Doe'), 'name');
  assert.equal(customerQueryKind('Order 5125550101 for Jane'), 'name');
});

test('customer dossier: identity first, orders link to their record, closed facts stated', () => {
  const env = buildDossierEnvelope({
    customer: {
      id: 3, display_name: null, customer_name: 'Jane Doe', first_name: null, last_name: null, email: 'jane@x.com', phone: '5125550101', mobile: null,
      shipping_address_1: '42 Wallaby Way', shipping_address_2: null, shipping_city: 'Chicago', shipping_state: 'IL', shipping_postal_code: '60614', shipping_country: 'US',
    },
    orderCount: 3,
    orders: [{ id: 91, orderNumber: '111-2', date: '2026-09-20T10:00:00Z', status: 'SHIPPED', title: 'Bose 151', channel: 'Amazon' }],
    tickets: [{ id: 5, externalId: '8192', subject: 'Where is my order', status: 'open' }],
  });
  const split = splitToolArtifact(env);
  assert.ok(split && split.artifact.kind === 'record');
  const card = split.artifact;
  assert.equal(card.identity?.title, 'Jane Doe');
  assert.deepEqual(card.identity?.ids.map((i) => i.label), ['Phone', 'Email', 'Order']);
  assert.equal(card.identity?.href, '/search?sel=order:91');
  assert.equal(card.fields.find((f) => f.label === 'Order 111-2')?.href, '/search?sel=order:91');
  assert.match(env.answer ?? '', /^Jane Doe, 5125550101, jane@x\.com: 3 orders, the latest 111-2 on 2026-09-20 \(shipped\); 1 open ticket \(#8192\)\. Ships to 42 Wallaby Way, Chicago IL 60614, US\.$/);
});

test('several customers → a candidates table and a question, never a pick', () => {
  const env = buildCandidatesEnvelope('Smith', [
    { id: 1, name: 'Ann Smith', phone: null, email: 'a@x.com', city: 'Austin, TX', lastOrderRef: '1', lastOrderDate: '2026-09-01' },
    { id: 2, name: 'Bo Smith', phone: '5125550101', email: null, city: null, lastOrderRef: null, lastOrderDate: null },
  ]);
  const split = splitToolArtifact(env);
  assert.ok(split && split.artifact.kind === 'table' && split.artifact.rows.length === 2);
  assert.match(env.answer ?? '', /which one\?/);
});

test('fast path: a bare phone / email / name goes to the dossier, answered only when found', async () => {
  const deps = { identify: async () => { throw new Error('contacts never need identify'); } };
  assert.deepEqual(await planIdentifierTurn(ORG, '(512) 555-0101', deps), { tool: 'get_customer', input: { query: '(512) 555-0101' }, onlyIfFound: true });
  assert.deepEqual(await planIdentifierTurn(ORG, 'jane@x.com', deps), { tool: 'get_customer', input: { query: 'jane@x.com' }, onlyIfFound: true });
});

// ─── get_worklist ────────────────────────────────────────────────────────────

test('daysPastShipBy: late only strictly before today on the warehouse calendar', () => {
  assert.equal(daysPastShipBy('2026-09-24', '2026-09-27'), 3);
  assert.equal(daysPastShipBy('2026-09-27', '2026-09-27'), null);
  assert.equal(daysPastShipBy('2026-09-30', '2026-09-27'), null);
  assert.equal(daysPastShipBy(null, '2026-09-27'), null);
});

const item = (ref: string, patch: Partial<WorkItem>): WorkItem => ({
  ref, sku: null, title: null, qty: 1, shipBy: null, daysLate: null, urgent: false, reason: null, action: null, owner: null, channel: null, ...patch,
});

test('rankByUrgency: days late, then urgent, then earliest ship-by, else desk order', () => {
  const ranked = rankByUrgency([
    item('A', {}),
    item('B', { shipBy: '2026-09-29' }),
    item('C', { urgent: true }),
    item('D', { daysLate: 1, shipBy: '2026-09-26' }),
    item('E', { daysLate: 4, shipBy: '2026-09-23' }),
    item('F', { shipBy: '2026-09-28' }),
  ]);
  assert.deepEqual(ranked.map((i) => i.ref), ['E', 'D', 'C', 'F', 'B', 'A']);
});

test('late = to-ship ∪ out-of-stock past ship-by, deduped, ranked most late first', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const ago = (d: number) => new Date(Date.parse(`${today}T00:00:00Z`) - d * 86_400_000).toISOString().slice(0, 10);
  const restore = setWorklistSourcesForTest({
    exceptions: async () => [],
    needToOrder: async () => [],
    orders: async (_org, params) =>
      params.blockedOnly
        ? [{ id: 2, order_id: 'OOS-2', ship_by_date: ago(5), oos_sku: 'A-1', oos_qty_short: '1' }, { id: 1, order_id: 'SHIP-1', ship_by_date: ago(2) }]
        : [{ id: 1, order_id: 'SHIP-1', ship_by_date: ago(2) }, { id: 3, order_id: 'ONTIME-3', ship_by_date: today }],
  });
  try {
    const out = await runAssistantTool('get_worklist', { kind: 'late' }, CTX);
    const split = out.ok ? splitToolArtifact(out.data) : null;
    assert.ok(split && split.artifact.kind === 'table');
    assert.deepEqual(split.artifact.kind === 'table' ? split.artifact.rows.map((r) => [r.Order, r['Days late']]) : [], [['OOS-2', 5], ['SHIP-1', 2]]);
    assert.match(split.modelData.summary, /Do first: order OOS-2 .*5 days past ship-by/);
  } finally {
    restore();
  }
});

test('overview: the most urgent non-empty list leads the do-first line', () => {
  const env = buildOverviewEnvelope({
    late: [],
    exceptions: [item('EX-1', { action: 'Pair the SKU', reason: 'SKU Mapping' })],
    out_of_stock: [item('OOS-1', {})],
    need_to_order: [],
    ready: [],
    pending: [item('P-1', {}), item('P-2', {})],
  });
  assert.match(env.answer ?? '', /^Do first: order EX-1; Pair the SKU \(exceptions\)\. Open work: 1 exceptions, 1 out of stock, 2 pending \(to ship\)\.$/);
  assert.equal(workItemFromOrder({ id: 9, order_id: '9', ship_by_date: null, sku: 'S', replenishment_po_number: 'PO-3' }, '2026-09-27', true).action, 'On PO PO-3');
});

// ─── get_staff_report ────────────────────────────────────────────────────────

const packingDay = (day: string, packers: Array<[number, string, number]>): PackingKpiSummary =>
  ({
    day,
    capacity: { packer_headcount: 2, workday_minutes: 480, daily_capacity_minutes: 960, daily_medium_target: 0, daily_large_target: 0 },
    totals: { small_count: 0, medium_count: 0, large_count: 0, total_boxes_packed: 0, weighted_minutes: 0, remaining_minutes: 0 },
    by_packer: packers.map(([id, name, boxes]) => ({ staff_id: id, staff_name: name, small_count: boxes, medium_count: 0, large_count: 0, weighted_minutes: boxes * 2 })),
    fba: { pending_units: 0, pending_weighted_minutes: 0, avg_minutes_per_unit: null, fillable_units: 0 },
  }) as unknown as PackingKpiSummary;

const pomodoro = {
  ok: true,
  from: '2026-09-24',
  to: '2026-09-25',
  rows: [
    { staffId: 4, staffName: 'Tuan', kind: 'task', id: 1, date: '2026-09-25', checkDate: null, title: 'Return for order 5', targetEntityType: null, targetEntityId: null, viewedAt: [], workedAt: [], completedAt: ['2026-09-25T20:00:00Z'], measuredFocusSeconds: 1500 },
    { staffId: 5, staffName: 'Thuy', kind: 'task', id: 2, date: '2026-09-24', checkDate: null, title: 'Relabel', targetEntityType: null, targetEntityId: null, viewedAt: [], workedAt: [], completedAt: [], measuredFocusSeconds: 600 },
  ],
  events: [],
  taskLifecycles: [],
} as unknown as PomodoroReport;

test('foldStaffDays joins packing and task time per staff per day, scoped to one staff when asked', () => {
  const packing = [packingDay('2026-09-24', [[5, 'Thuy', 3]]), packingDay('2026-09-25', [[4, 'Tuan', 23], [5, 'Thuy', 10]])];
  assert.deepEqual(daysBetween('2026-09-24', '2026-09-25'), ['2026-09-24', '2026-09-25']);
  const tuan = foldStaffDays(packing, pomodoro, 4);
  assert.deepEqual(tuan.map((d) => [d.date, d.boxes, d.focusSec, d.done]), [['2026-09-25', 23, 1500, 1]]);
  assert.equal(foldStaffDays(packing, pomodoro, null).length, 3);
});

test('staff report: one staff member → validated report with boxes headline and a goal verdict', () => {
  const env = buildStaffReport({
    from: '2026-09-24',
    to: '2026-09-25',
    today: '2026-09-25',
    asOf: 'Sep 25, 2026, 5:00 PM',
    question: "Tuan's performance",
    staff: { id: 4, name: 'Tuan' },
    packing: [packingDay('2026-09-24', []), packingDay('2026-09-25', [[4, 'Tuan', 23]])],
    pomodoro,
    goals: [{ staff_id: 4, staff_name: 'Tuan', station: 'PACK', daily_goal: 40, today_count: 23, week_count: 90 }],
  });
  const split = splitToolArtifact(env);
  assert.ok(split && split.artifact.kind === 'report');
  if (split.artifact.kind !== 'report') return;
  assert.equal(split.artifact.headline.value, '23');
  assert.equal(split.artifact.kpis.find((k) => k.id === 'goal')?.status, 'watch');
  assert.equal(env.answer, 'Tuan, 2026-09-24 to 2026-09-25: 23 boxes packed (46 weighted min), 25 min measured task time, 1 completed. Today 23 of a 40 pack goal.');
});

// ─── tracking ────────────────────────────────────────────────────────────────

test('tracking envelope: status, links and the scan timeline, newest first', () => {
  const env = buildTrackingEnvelope({
    shipment: {
      tracking_number_raw: '1Z999AA10123456784', tracking_number_normalized: '1Z999AA10123456784', carrier: 'UPS',
      latest_status_label: 'Delivered', latest_status_description: null, latest_status_category: 'DELIVERED',
      delivered_at: '2026-09-25T18:00:00Z', latest_event_at: '2026-09-25T18:00:00Z', is_delivered: true,
    },
    events: [
      { event_occurred_at: '2026-09-25T18:00:00Z', event_recorded_at: '2026-09-25T18:01:00Z', external_status_label: 'Delivered', external_status_description: 'Front door', normalized_status_category: 'DELIVERED', event_city: 'Austin', event_state: 'TX', event_country_code: 'US', signed_by: null, exception_description: null },
      { event_occurred_at: null, event_recorded_at: '2026-09-24T10:00:00Z', external_status_label: null, external_status_description: null, normalized_status_category: 'IN_TRANSIT', event_city: null, event_state: null, event_country_code: null, signed_by: null, exception_description: null },
    ],
    links: [{ label: 'Order 111-2' }],
    syncNote: null,
    watching: true,
  });
  const split = splitToolArtifact(env);
  assert.ok(split && split.artifact.kind === 'timeline');
  if (split.artifact.kind !== 'timeline') return;
  assert.deepEqual(split.artifact.items.map((i) => [i.action, i.actor, i.detail]), [['Delivered', 'Austin, TX', 'Front door'], ['In transit', null, null]]);
  assert.match(env.answer ?? '', /^UPS 1Z999AA10123456784 \(Order 111-2\): Delivered\. Delivered Sep 25, 2026.* You are watching it\.$/);
});

test('watch_tracking is a write: Full access builds it, Ask only refuses it without running', async () => {
  const writes = buildWriteTools('sess-1', undefined, ALL, { startedAt: new Date() });
  assert.ok(buildWriteToolMap(CTX, writes).has('watch_tracking'));
  const ask: AssistantToolCtx = { ...CTX, accessMode: 'ask' };
  const refused = await dispatchToolCall('watch_tracking', { tracking: '1Z999AA10123456784' }, ask, buildWriteToolMap(ask, writes), runAssistantTool);
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? '' : refused.error, /Ask only/);
});
