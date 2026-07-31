/**
 * DB-free contract for the carton inspector's read model.
 *
 * Run: `node --test --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        src/components/receiving/inspector/carton-inspector-model.test.ts`
 *
 * The formatter assertions run under whatever TZ the host has; the point of the
 * warehouse wall-clock path is that the answer does not depend on it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCartonMilestones,
  cartonContentsSummary,
  cartonDisposition,
  cartonExceptions,
  cartonFacts,
  cartonFlags,
  cartonLifecycle,
  cartonRecordMeta,
  cartonTimelineAnchor,
  type CartonInspectorReceiving,
} from './carton-inspector-model';
import { formatDateTimePST } from '@/utils/date';

const RECEIVING: CartonInspectorReceiving = {
  id: 49929,
  shipment_id: '43682',
  tracking: '874847124243',
  carrier: 'FedEx',
  source: 'unmatched',
  source_platform: null,
  intake_type: null,
  pairing_state: 'UNFOUND',
  priority_lane: null,
  triage_complete: false,
  triage_completed_at: null,
  is_return: false,
  return_platform: null,
  return_reason: null,
  needs_test: false,
  target_channel: null,
  qa_status: 'PENDING',
  disposition_code: null,
  condition_grade: null,
  staging_location_label: null,
  local_pickup_order_id: null,
  zoho_purchase_receive_id: null,
  zoho_purchaseorder_id: '5623409000003125066',
  zoho_purchaseorder_number: '19-14910-41811',
  listing_url: null,
  support_notes: null,
  tracking_scanned_at: '2026-07-28 14:23:54',
  tracking_scanned_by_name: 'Kai',
  unbox_opened_at: '2026-07-28 14:23:54',
  unbox_opened_by_name: 'Kai',
  unboxed_at: '2026-07-28 14:26:58',
  unboxed_by_name: 'Kai',
  received_at: '2026-07-28 14:27:46',
  received_by_name: 'Kai',
  created_at: '2026-07-28 14:23:54',
  updated_at: '2026-07-28 14:23:57',
};

test('buildCartonMilestones returns the lifecycle in order, with actors', () => {
  const m = buildCartonMilestones(RECEIVING);
  assert.deepEqual(
    m.map((x) => x.key),
    ['scanned', 'opened', 'unboxed', 'received'],
  );
  assert.equal(m[2].label, 'Unboxed');
  assert.equal(m[2].at, '2026-07-28 14:26:58');
  assert.equal(m[2].byName, 'Kai');
});

test('buildCartonMilestones omits steps that never happened', () => {
  // Scanned is a TRIAGE stamp, Opened/Unboxed are UNBOX stamps — independent by
  // design, so a carton opened straight on the bench has no door scan. A row of
  // dashes would read as missing data rather than an incomplete lifecycle.
  const m = buildCartonMilestones({
    ...RECEIVING,
    tracking_scanned_at: null,
    tracking_scanned_by_name: null,
    received_at: null,
    received_by_name: null,
  });
  assert.deepEqual(
    m.map((x) => x.key),
    ['opened', 'unboxed'],
  );
});

test('buildCartonMilestones treats blank strings as absent and trims actors', () => {
  const m = buildCartonMilestones({
    ...RECEIVING,
    tracking_scanned_at: '   ',
    unbox_opened_by_name: '  Kai  ',
    unboxed_by_name: '   ',
  });
  assert.equal(
    m.some((x) => x.key === 'scanned'),
    false,
  );
  assert.equal(m.find((x) => x.key === 'opened')?.byName, 'Kai');
  assert.equal(m.find((x) => x.key === 'unboxed')?.byName, null);
});

test('milestone stamps render as WAREHOUSE wall-clock, not re-shifted instants', () => {
  // The API sends `to_char(ts::timestamp, …)` with the DB session on
  // America/Los_Angeles: 21:26:58Z is delivered as "2026-07-28 14:26:58"
  // ALREADY in warehouse time. Re-interpreting that as an instant would shift
  // it a second time; `formatDateTimePST` parses the naive shape purely.
  assert.equal(formatDateTimePST('2026-07-28 14:26:58'), '07/28/2026 2:26:58 PM');
  // And the events spine, which really is an instant, still lands on 14:26 PDT.
  assert.equal(formatDateTimePST('2026-07-28T21:26:58.201Z'), '07/28/2026 2:26:58 PM');
});

test('cartonTimelineAnchor feeds the SHARED WorkspaceTimelineTab', () => {
  assert.deepEqual(cartonTimelineAnchor(RECEIVING), {
    receivingId: 49929,
    tracking: '874847124243',
    poId: '5623409000003125066',
  });
  // An unfound carton has no PO — the timeline falls back to the tracking spine.
  assert.deepEqual(
    cartonTimelineAnchor({ ...RECEIVING, zoho_purchaseorder_id: null, tracking: '  ' }),
    { receivingId: 49929, tracking: null, poId: null },
  );
});

test('cartonContentsSummary reads as progress, not raw counts', () => {
  assert.equal(
    cartonContentsSummary({ expected: 3, received: 3, lines: 2, lines_complete: 2 }),
    '3/3 units · 2/2 lines complete',
  );
  assert.equal(
    cartonContentsSummary({ expected: 0, received: 2, lines: 1, lines_complete: 0 }),
    '2 units · 0/1 line complete',
  );
  assert.equal(cartonContentsSummary({ expected: 0, received: 0, lines: 0, lines_complete: 0 }), 'No lines');
  assert.equal(cartonContentsSummary(null), 'No lines');
});

test('cartonLifecycle answers "is this done?" from the milestones', () => {
  assert.deepEqual(cartonLifecycle(RECEIVING), {
    state: 'received', label: 'Received', tone: 'success', done: true,
  });
  assert.equal(cartonLifecycle({ ...RECEIVING, received_at: null }).state, 'unboxed');
  assert.equal(cartonLifecycle({ ...RECEIVING, received_at: null, unboxed_at: null }).state, 'opened');
  assert.equal(
    cartonLifecycle({ ...RECEIVING, received_at: null, unboxed_at: null, unbox_opened_at: null }).state,
    'scanned',
  );
  const none = cartonLifecycle({
    ...RECEIVING, received_at: null, unboxed_at: null, unbox_opened_at: null, tracking_scanned_at: null,
  });
  assert.deepEqual(none, { state: 'expected', label: 'Expected', tone: 'neutral', done: false });
});

test('cartonLifecycle exposes a TONE, never a class — views stay dumb', () => {
  for (const s of [RECEIVING, { ...RECEIVING, received_at: null }]) {
    assert.match(cartonLifecycle(s).tone, /^(neutral|info|success)$/);
  }
});

// ── The comprehensive record: facts, flags, system meta ─────────────────────

test('cartonFacts omits absent facts rather than emitting dashes', () => {
  const facts = cartonFacts(RECEIVING);
  const keys = facts.map((f) => f.key);

  // Present on the fixture.
  assert.ok(keys.includes('carrier'), 'carrier is set and must appear');
  assert.ok(keys.includes('qaStatus'), 'qa_status is set and must appear');

  // Null on the fixture — a grid of "—" reads as lost data, not as N/A.
  for (const absent of ['platform', 'intakeType', 'staging', 'lane', 'targetChannel']) {
    assert.equal(keys.includes(absent), false, `${absent} is null and must be omitted`);
  }
  assert.equal(facts.every((f) => f.value.length > 0), true, 'no fact may carry an empty value');
});

test('cartonFacts treats whitespace as absent', () => {
  const keys = cartonFacts({ ...RECEIVING, carrier: '   ' }).map((f) => f.key);
  assert.equal(keys.includes('carrier'), false, 'a blank string is not a fact');
});

test('cartonFacts tags each fact with the SoT that must resolve it', () => {
  const byKey = new Map(cartonFacts({
    ...RECEIVING,
    source_platform: 'ebay',
    intake_type: 'PO',
    condition_grade: 'USED_A',
  }).map((f) => [f.key, f.kind]));

  // The model never carries the label itself — it names the resolver.
  assert.equal(byKey.get('platform'), 'platform');
  assert.equal(byKey.get('intakeType'), 'receivingType');
  assert.equal(byKey.get('condition'), 'condition');
  assert.equal(byKey.get('carrier'), 'text');

  // qa_status is NOT a receiving workflow stage. Tagging it as one routed a
  // valid "PENDING" through `workflowStageLabel` and printed "Unknown" on the
  // live surface. Misresolving a value through the WRONG SoT is the same class
  // of bug as inventing a map, and it fails silently.
  assert.equal(byKey.get('qaStatus'), 'text');
});

test('cartonFlags suppresses UNFOUND when a PO is already linked', () => {
  // Fixture has pairing_state UNFOUND AND a Zoho PO — link wins over stale pairing.
  const keys = cartonFlags(RECEIVING).map((f) => f.key);
  assert.equal(keys.includes('unfound'), false, 'linked PO must suppress No matched PO');
});

test('cartonFlags surfaces UNFOUND only when no PO is linked', () => {
  const keys = cartonFlags({
    ...RECEIVING,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: null,
  }).map((f) => f.key);
  assert.ok(keys.includes('unfound'), 'pairing_state UNFOUND with no PO must be visible');
});

test('cartonFlags suppresses UNFOUND when a line carries the PO', () => {
  const keys = cartonFlags(
    {
      ...RECEIVING,
      zoho_purchaseorder_id: null,
      zoho_purchaseorder_number: null,
    },
    [{ zoho_purchaseorder_number: '19-14910-41811' }],
  ).map((f) => f.key);
  assert.equal(keys.includes('unfound'), false, 'line-level PO must suppress No matched PO');
});

test('cartonFlags stays silent on the normal case', () => {
  const keys = cartonFlags({
    ...RECEIVING,
    pairing_state: 'MATCHED',
    triage_complete: true,
  }).map((f) => f.key);
  assert.deepEqual(keys, [], 'an ordinary carton earns no exception badges');
});

test('cartonFlags reports incomplete triage ONLY once the box is open', () => {
  // Not yet opened: triage_complete=false is just "not there yet", not a fault.
  const unopened = cartonFlags({
    ...RECEIVING,
    pairing_state: 'MATCHED',
    triage_complete: false,
    unbox_opened_at: null,
    unboxed_at: null,
  }).map((f) => f.key);
  assert.equal(unopened.includes('triage'), false, 'an unopened carton is not "triage incomplete"');

  // Opened and still incomplete: a real inconsistency.
  const opened = cartonFlags({
    ...RECEIVING,
    pairing_state: 'MATCHED',
    triage_complete: false,
  }).map((f) => f.key);
  assert.ok(opened.includes('triage'), 'an opened carton with incomplete triage is a real signal');
});

test('cartonFlags carries return and needs-test states', () => {
  const keys = cartonFlags({
    ...RECEIVING,
    is_return: true,
    needs_test: true,
  }).map((f) => f.key);
  assert.ok(keys.includes('return'));
  assert.ok(keys.includes('needsTest'));
});

test('cartonRecordMeta identifies the row and omits unset ids', () => {
  const meta = cartonRecordMeta(RECEIVING);
  const byKey = new Map(meta.map((m) => [m.key, m.value]));
  assert.equal(byKey.get('id'), '49929');
  assert.equal(byKey.get('shipment'), '43682');
  assert.equal(byKey.get('poId'), '5623409000003125066');
  // Null on the fixture.
  assert.equal(byKey.has('receiveId'), false, 'an unset zoho receive id must be omitted');
});

// ── Disposition truth (exceptions outrank lifecycle.done) ───────────────────

test('cartonDisposition: received + linked PO + triage + 0 lines is NOT complete', () => {
  // Lifecycle says received/done, but triage/no-lines still block settled.
  // Stale UNFOUND does not win when a PO is linked — lead with Needs action.
  const d = cartonDisposition(RECEIVING, {
    expected: 0,
    received: 0,
    lines: 0,
    lines_complete: 0,
  });
  assert.equal(d.settled, false, 'must never show work-complete while exceptions hold');
  assert.equal(d.state, 'needs_action');
  assert.equal(d.exceptions.some((e) => e.key === 'unfound'), false);
  assert.ok(d.exceptions.some((e) => e.key === 'triage_incomplete'));
  assert.ok(d.exceptions.some((e) => e.key === 'no_lines'));
  assert.equal(d.lifecycle.done, true, 'lifecycle can still be done — disposition overrides');
});

test('cartonExceptions: UNFOUND with no PO still flags unmatched', () => {
  const ex = cartonExceptions(
    {
      ...RECEIVING,
      triage_complete: true,
      zoho_purchaseorder_id: null,
      zoho_purchaseorder_number: null,
    },
    { expected: 1, received: 1, lines: 1, lines_complete: 1 },
  );
  assert.deepEqual(
    ex.map((e) => e.key),
    ['unfound'],
  );
});

test('cartonExceptions: linked PO suppresses unmatched even when pairing is UNFOUND', () => {
  const ex = cartonExceptions(
    { ...RECEIVING, triage_complete: true },
    { expected: 1, received: 1, lines: 1, lines_complete: 1 },
  );
  assert.deepEqual(ex.map((e) => e.key), []);
});

test('cartonDisposition: settled only when lifecycle.done and zero exceptions', () => {
  const d = cartonDisposition(
    {
      ...RECEIVING,
      pairing_state: 'MATCHED',
      triage_complete: true,
      needs_test: false,
      qa_status: 'PASSED',
    },
    { expected: 1, received: 1, lines: 1, lines_complete: 1 },
  );
  assert.equal(d.state, 'complete');
  assert.equal(d.settled, true);
  assert.equal(d.exceptions.length, 0);
});

test('cartonDisposition: needs_test + QA PENDING blocks complete', () => {
  const d = cartonDisposition(
    {
      ...RECEIVING,
      pairing_state: 'MATCHED',
      triage_complete: true,
      needs_test: true,
      qa_status: 'PENDING',
    },
    { expected: 1, received: 1, lines: 1, lines_complete: 1 },
  );
  assert.equal(d.settled, false);
  assert.equal(d.state, 'needs_action');
  assert.ok(d.exceptions.some((e) => e.key === 'qa_pending'));
});

test('cartonDisposition: in_progress when lifecycle not done and no exceptions', () => {
  const d = cartonDisposition(
    {
      ...RECEIVING,
      pairing_state: 'MATCHED',
      triage_complete: true,
      needs_test: false,
      qa_status: null,
      received_at: null,
      unboxed_at: null,
      unbox_opened_at: null,
    },
    { expected: 0, received: 0, lines: 0, lines_complete: 0 },
  );
  assert.equal(d.state, 'in_progress');
  assert.equal(d.settled, false);
  assert.equal(d.lifecycle.state, 'scanned');
});
