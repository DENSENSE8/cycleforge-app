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
  cartonEventSignature,
  cartonEventTitle,
  cartonExceptions,
  cartonFacts,
  cartonFlags,
  cartonHeaderIdentity,
  cartonLifecycle,
  cartonRecordMeta,
  qaStatusLabel,
  qaStatusMeta,
  qaStatusToneClass,
  receivingSourceLabel,
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

test('cartonContentsSummary reads as progress, not raw counts', () => {
  assert.equal(
    cartonContentsSummary({ expected: 3, received: 3, lines: 2, lines_complete: 2 }),
    '3/3 units · 2/2 complete',
  );
  assert.equal(
    cartonContentsSummary({ expected: 0, received: 2, lines: 1, lines_complete: 0 }),
    '2 units · 0/1 complete',
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
  assert.equal(byKey.get('carrier'), 'carrier');

  // qa_status is its own vocabulary (not a workflow stage). The Record strip
  // resolves via `qaStatusMeta` — never `workflowStage*`.
  assert.equal(byKey.get('qaStatus'), 'qaStatus');
});

test('cartonFacts leads with platform then QA status (telemetry first)', () => {
  const keys = cartonFacts({
    ...RECEIVING,
    source_platform: 'ebay',
    qa_status: 'PENDING',
    carrier: 'FedEx',
  }).map((f) => f.key);
  assert.equal(keys[0], 'platform');
  assert.equal(keys[1], 'qaStatus');
  assert.equal(keys[2], 'carrier');
});

test('qaStatusMeta paints PENDING / PASSED / FAILED without inventing stages', () => {
  assert.equal(qaStatusLabel('PENDING'), 'Pending');
  assert.equal(qaStatusLabel('passed'), 'Passed');
  assert.equal(qaStatusMeta('FAILED').dot, 'bg-rose-500');
  assert.match(qaStatusToneClass('PENDING'), /amber/);
  // Unknown token stays legible — quiet chip, raw face.
  assert.equal(qaStatusLabel('WEIRD'), 'WEIRD');
  assert.match(qaStatusToneClass('WEIRD'), /surface-sunken/);
});

test('receivingSourceLabel humanizes intake source tokens', () => {
  assert.equal(receivingSourceLabel('zoho_po'), 'PO');
  assert.equal(receivingSourceLabel('unmatched'), 'Unmatched');
  assert.equal(receivingSourceLabel('local_pickup'), 'Local pickup');
  assert.equal(receivingSourceLabel('sourcing_import'), 'Sourcing import');
  assert.equal(receivingSourceLabel('ebay'), 'eBay');
  assert.equal(receivingSourceLabel('custom_token'), 'custom_token');
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
  // Internal row handles are NOT facts — the carton id addresses the page and
  // the shipment id names a grouping nobody quotes.
  assert.equal(byKey.has('id'), false, 'the carton id is the address, not a fact');
  assert.equal(byKey.has('shipment'), false, 'the shipment id is not an operator fact');
  assert.equal(byKey.get('poId'), '5623409000003125066');
  // Null on the fixture.
  assert.equal(byKey.has('receiveId'), false, 'an unset zoho receive id must be omitted');
});

test('cartonRecordMeta tags system facts for typed presenters', () => {
  const byKey = new Map(cartonRecordMeta(RECEIVING).map((m) => [m.key, m]));
  assert.equal(byKey.get('source')?.kind, 'source');
  assert.equal(byKey.get('poId')?.kind, 'externalId');
  assert.equal(byKey.get('poId')?.label, 'PO id');
  assert.equal(byKey.get('created')?.kind, 'instant');
  assert.equal(byKey.get('updated')?.kind, 'instant');
});

test('cartonHeaderIdentity: PO + tracking from the carton header', () => {
  const id = cartonHeaderIdentity(RECEIVING);
  assert.equal(id.poNumber, '19-14910-41811');
  assert.equal(id.tracking, '874847124243');
  assert.equal(id.platform, null);
  assert.equal(id.productTitle, null, 'PO identity wins over a product title');
});

test('cartonHeaderIdentity: falls back to line PO/tracking and sole product name', () => {
  const id = cartonHeaderIdentity(
    {
      ...RECEIVING,
      zoho_purchaseorder_number: null,
      zoho_purchaseorder_id: null,
      tracking: null,
      source_platform: null,
    },
    [
      {
        item_name: 'Netgear Orbi',
        sku: 'ORBI-1',
        zoho_purchaseorder_number: 'PO-LINE-9',
        tracking_number: 'TRACK-LINE-9',
      },
    ],
  );
  assert.equal(id.poNumber, 'PO-LINE-9');
  assert.equal(id.tracking, 'TRACK-LINE-9');
  assert.equal(id.productTitle, null, 'a line PO still suppresses the product title');

  const noPo = cartonHeaderIdentity(
    {
      ...RECEIVING,
      zoho_purchaseorder_number: null,
      zoho_purchaseorder_id: null,
      tracking: null,
    },
    [
      {
        item_name: 'Netgear Orbi',
        sku: 'ORBI-1',
        zoho_purchaseorder_number: null,
        tracking_number: null,
      },
    ],
  );
  assert.equal(noPo.poNumber, null);
  assert.equal(noPo.productTitle, 'Netgear Orbi');
});

// ── Disposition truth (exceptions outrank lifecycle.done) ───────────────────

test('cartonDisposition: received + linked PO + 0 lines is NOT complete', () => {
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
  assert.equal(
    d.exceptions.some((e) => e.key === 'triage_incomplete'),
    false,
    'incomplete triage is bookkeeping, not a finding on the read surface',
  );
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

// ── cartonEventSignature — two events, one second apart, must not read alike ──

const EVENT = {
  event_type: null as string | null,
  prev_status: null as string | null,
  next_status: null as string | null,
  notes: null as string | null,
};

test('cartonEventSignature: a unit\'s FIRST status is still a transition', () => {
  // The real carton-50354 pair. Before the fix both rendered as bare title +
  // timestamp + serial, because `prev && next && prev !== next` is false when
  // prev is null — so the row that moved the unit to RECEIVED showed nothing.
  const attach = cartonEventSignature({
    ...EVENT,
    event_type: 'RECEIVED',
    next_status: 'RECEIVED',
    notes: 'Serial 049331F81860251AE',
  });
  const note = cartonEventSignature({
    ...EVENT,
    event_type: 'NOTE',
    notes: 'Unmatched return serial 049331f81860251ae — no order match',
  });

  assert.deepEqual(attach, { kind: null, trail: '→ RECEIVED' });
  assert.deepEqual(note, { kind: 'NOTE', trail: null });
  // The whole point: the two rows say different things.
  assert.notDeepEqual(attach, note);
});

test('cartonEventSignature: a real move keeps both ends', () => {
  assert.deepEqual(
    cartonEventSignature({
      ...EVENT,
      event_type: 'MOVED',
      prev_status: 'RECEIVED',
      next_status: 'TESTED',
      notes: 'Moved to bench',
    }),
    { kind: 'MOVED', trail: 'RECEIVED → TESTED' },
  );
});

test('cartonEventSignature: never prints one fact twice', () => {
  // kind === next_status → the trail already said it.
  assert.equal(
    cartonEventSignature({
      ...EVENT,
      event_type: 'RECEIVED',
      next_status: 'RECEIVED',
      notes: 'anything',
    }).kind,
    null,
  );
  // No notes ⇒ the TITLE is the event type ⇒ do not repeat it in the meta row.
  assert.equal(
    cartonEventSignature({ ...EVENT, event_type: 'TRIAGED' }).kind,
    null,
  );
  // A no-op re-stamp of the same status is not a move.
  assert.equal(
    cartonEventSignature({
      ...EVENT,
      event_type: 'NOTE',
      prev_status: 'RECEIVED',
      next_status: 'RECEIVED',
      notes: 'x',
    }).trail,
    '→ RECEIVED',
  );
});

test('cartonEventSignature: whitespace-only fields are absent, not values', () => {
  assert.deepEqual(
    cartonEventSignature({ ...EVENT, event_type: '  ', next_status: '  ', notes: '   ' }),
    { kind: null, trail: null },
  );
});

test('cartonEventTitle: strips Stage prefix from workflow notes', () => {
  assert.equal(
    cartonEventTitle({
      event_type: 'NOTE',
      notes: 'Stage Matched → Unboxed',
    }),
    'Matched → Unboxed',
  );
  assert.equal(
    cartonEventTitle({
      event_type: 'NOTE',
      notes: 'Matched → Unboxed',
    }),
    'Matched → Unboxed',
  );
  assert.equal(
    cartonEventTitle({ event_type: 'TRIAGED', notes: null }),
    'TRIAGED',
  );
});

test('cartonEventSignature: Stage workflow notes do not reprint NOTE + machine trail', () => {
  // Legacy receive-line write: notes already ARE the human trail.
  assert.deepEqual(
    cartonEventSignature({
      ...EVENT,
      event_type: 'NOTE',
      prev_status: 'MATCHED',
      next_status: 'UNBOXED',
      notes: 'Stage Matched → Unboxed',
    }),
    { kind: null, trail: null },
  );
  // Current write shape (no Stage prefix) — same suppression.
  assert.deepEqual(
    cartonEventSignature({
      ...EVENT,
      event_type: 'NOTE',
      prev_status: 'MATCHED',
      next_status: 'UNBOXED',
      notes: 'Matched → Unboxed',
    }),
    { kind: null, trail: null },
  );
});

test('cartonExceptions: a RETURN never asks the operator to go find a PO', () => {
  // A return has no PO to match, so "unpaired" is not a finding about it —
  // same rule `isTriagePaired` (triage-focus.ts) has used since C6. Carton
  // 50354 has NO receiving_triage row at all, which is why the fixture below
  // carries an explicit UNFOUND: the suppression must hold even when the
  // pairing answer really was recorded.
  const asReturn = cartonExceptions(
    { ...RECEIVING, pairing_state: 'UNFOUND', is_return: true, intake_type: 'RETURN' },
    { expected: 1, received: 0, lines: 1, lines_complete: 0 },
  );
  assert.equal(asReturn.some((e) => e.key === 'unfound'), false);

  // intake_type alone is enough — the boolean lags on some rows.
  const byIntakeOnly = cartonExceptions(
    { ...RECEIVING, pairing_state: 'UNFOUND', is_return: false, intake_type: 'return' },
    { expected: 1, received: 0, lines: 1, lines_complete: 0 },
  );
  assert.equal(byIntakeOnly.some((e) => e.key === 'unfound'), false);

  // A PO-intake carton with no PO link still gets the finding — that one CAN be
  // found. (The base fixture carries a linked PO, which `cartonHasLinkedPo`
  // already suppresses on its own, so the control has to clear it.)
  const poCarton = cartonExceptions(
    {
      ...RECEIVING,
      pairing_state: 'UNFOUND',
      is_return: false,
      intake_type: 'PO',
      zoho_purchaseorder_id: null,
      zoho_purchaseorder_number: null,
    },
    { expected: 1, received: 0, lines: 1, lines_complete: 0 },
  );
  assert.ok(poCarton.some((e) => e.key === 'unfound'));
});

test('cartonFlags: the return suppression matches the exception rule', () => {
  const flags = cartonFlags({
    ...RECEIVING,
    pairing_state: 'UNFOUND',
    is_return: true,
    intake_type: 'RETURN',
  });
  assert.equal(flags.some((f) => f.key === 'unfound'), false);
});

// --- absent vs recorded -----------------------------------------------------
// `/api/receiving/[id]` and the receiving-lines builders no longer send
// COALESCE(rt.pairing_state,'UNFOUND'), so `pairing_state: null` now genuinely
// means "no receiving_triage row" — 751 of 2790 dogfood cartons. The finding has
// to come from a fact somebody RECORDED instead.

const NO_PO = { zoho_purchaseorder_id: null, zoho_purchaseorder_number: null } as const;

test('cartonExceptions: an unrecorded pairing state still finds an unmatched-source carton', () => {
  // Nobody triaged it, so there is no pairing answer — but the intake scan
  // stamped source='unmatched' when the tracking number matched no PO. That is
  // recorded, and it is the fact the finding rests on.
  const untriaged = cartonExceptions(
    { ...RECEIVING, ...NO_PO, pairing_state: null, source: 'unmatched' },
    { expected: 1, received: 0, lines: 1, lines_complete: 0 },
  );
  assert.ok(untriaged.some((e) => e.key === 'unfound'));
});

test('cartonExceptions: nothing recorded, nothing claimed', () => {
  // A PO-sourced carton with no triage row and no PO link. Nothing on disk says
  // a PO search happened, let alone failed — so the surface must not report one.
  // This is the case the COALESCE default used to fabricate a finding for.
  const silent = cartonExceptions(
    { ...RECEIVING, ...NO_PO, pairing_state: null, source: 'zoho_po' },
    { expected: 1, received: 0, lines: 1, lines_complete: 0 },
  );
  assert.equal(silent.some((e) => e.key === 'unfound'), false);

  // …and the recorded answer alone is still enough, with no help from `source`.
  const recorded = cartonExceptions(
    { ...RECEIVING, ...NO_PO, pairing_state: 'UNFOUND', source: 'zoho_po' },
    { expected: 1, received: 0, lines: 1, lines_complete: 0 },
  );
  assert.ok(recorded.some((e) => e.key === 'unfound'));
});

test('cartonFlags and cartonExceptions never disagree about No matched PO', () => {
  // The chip and the header's settled-ness read one predicate. A carton showing
  // the flag while the disposition says "complete" is the surface contradicting
  // itself, so this walks the axes that decide it.
  for (const pairing_state of [null, 'UNFOUND', 'MATCHED', 'WAIVED']) {
    for (const source of ['unmatched', 'zoho_po', null]) {
      for (const is_return of [true, false]) {
        const r = { ...RECEIVING, ...NO_PO, pairing_state, source, is_return };
        const totals = { expected: 1, received: 0, lines: 1, lines_complete: 0 };
        assert.equal(
          cartonFlags(r).some((f) => f.key === 'unfound'),
          cartonExceptions(r, totals).some((e) => e.key === 'unfound'),
          `flag/exception disagree for ${JSON.stringify({ pairing_state, source, is_return })}`,
        );
      }
    }
  }
});

test('cartonRecordMeta: omits Pairing state when nobody recorded one', () => {
  const absent = cartonRecordMeta({ ...RECEIVING, pairing_state: null });
  assert.equal(absent.some((f) => f.key === 'pairing'), false, 'no row is not a value');

  const recorded = cartonRecordMeta({ ...RECEIVING, pairing_state: 'WAIVED' });
  assert.equal(recorded.find((f) => f.key === 'pairing')?.value, 'WAIVED');
});
