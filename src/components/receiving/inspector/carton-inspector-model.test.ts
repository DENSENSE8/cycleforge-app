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
  cartonLifecycle,
  cartonTimelineAnchor,
  collapseProvenance,
  type CartonInspectorReceiving,
} from './carton-inspector-model';
import { formatDateTimePST } from '@/utils/date';

const RECEIVING: CartonInspectorReceiving = {
  id: 49929,
  tracking: '874847124243',
  carrier: 'FedEx',
  source: 'unmatched',
  source_platform: null,
  intake_type: null,
  pairing_state: 'UNFOUND',
  triage_complete: false,
  is_return: false,
  return_platform: null,
  staging_location_label: null,
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

test('collapseProvenance folds a one-person session to a single line', () => {
  const c = collapseProvenance(buildCartonMilestones(RECEIVING));
  assert.deepEqual(c, {
    actor: 'Kai',
    firstAt: '2026-07-28 14:23:54',
    lastAt: '2026-07-28 14:27:46',
    steps: 4,
  });
});

test('collapseProvenance REFUSES when more than one person touched it', () => {
  // Multi-actor attribution is the content — collapsing it hides exactly what
  // the surface exists to prove.
  const m = buildCartonMilestones({ ...RECEIVING, unboxed_by_name: 'Sam' });
  assert.equal(collapseProvenance(m), null);
});

test('collapseProvenance REFUSES on an unattributed step or a lone milestone', () => {
  assert.equal(collapseProvenance(buildCartonMilestones({ ...RECEIVING, unboxed_by_name: null })), null);
  assert.equal(
    collapseProvenance(
      buildCartonMilestones({
        ...RECEIVING, tracking_scanned_at: null, unbox_opened_at: null, received_at: null,
      }),
    ),
    null,
  );
});
