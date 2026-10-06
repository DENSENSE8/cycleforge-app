import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyInboundLane,
  clearCrossLaneParams,
  isDockedSort,
  isPipelineSort,
  parseInboundDeskSort,
  parseInboundLane,
  INBOUND_LANE_PARAM_VALUES,
} from '@/lib/receiving/inbound-lane';

test('parseInboundLane: Deliveries resolves Inbound, Docked and Unboxed independently', () => {
  assert.equal(parseInboundLane(null), 'pipeline');
  assert.equal(parseInboundLane(''), 'pipeline');
  assert.equal(parseInboundLane('pipeline'), 'pipeline');
  assert.equal(parseInboundLane('DOCKED'), 'docked');
  assert.equal(parseInboundLane('docked'), 'docked');
  assert.equal(parseInboundLane('UNBOXED'), 'unboxed');
  assert.equal(parseInboundLane('unboxed'), 'unboxed');
});

test('parseInboundDeskSort accepts pipeline ∪ history ids', () => {
  assert.equal(parseInboundDeskSort('zoho_newest'), 'zoho_newest');
  assert.equal(parseInboundDeskSort('scanned_newest'), 'scanned_newest');
  assert.equal(parseInboundDeskSort('unboxed_newest'), 'unboxed_newest');
  assert.equal(parseInboundDeskSort('nope'), null);
});

test('isPipelineSort / isDockedSort partition the union', () => {
  assert.equal(isPipelineSort('expected_soonest'), true);
  assert.equal(isDockedSort('expected_soonest'), false);
  assert.equal(isDockedSort('scanned_newest'), true);
  assert.equal(isPipelineSort('scanned_newest'), false);
});

test('clearCrossLaneParams drops the other lane’s keys', () => {
  const pipeline = new URLSearchParams(
    'inbound=ebay&state=IN_TRANSIT&sort=zoho_oldest&page=2&rh_q=abc',
  );
  const toDocked = clearCrossLaneParams(pipeline, 'docked');
  assert.equal(toDocked.get('inbound'), null);
  assert.equal(toDocked.get('state'), null);
  assert.equal(toDocked.get('sort'), null);
  assert.equal(toDocked.get('page'), null);
  assert.equal(toDocked.get('rh_q'), 'abc');

  const docked = new URLSearchParams(
    'lane=docked&sort=scanned_newest&rh_field=po&rh_scope=unmatched&page=3',
  );
  const toPipeline = clearCrossLaneParams(docked, 'pipeline');
  assert.equal(toPipeline.get('rh_field'), null);
  assert.equal(toPipeline.get('rh_scope'), null);
  assert.equal(toPipeline.get('sort'), null);
  assert.equal(toPipeline.get('page'), null);
});

test('applyInboundLane writes or clears lane=', () => {
  const base = new URLSearchParams('inbound=zoho&sort=zoho_newest');
  const docked = applyInboundLane(base, 'docked');
  assert.equal(docked.get('lane'), 'docked');
  assert.equal(docked.get('inbound'), null);

  const unboxed = applyInboundLane(base, 'unboxed');
  assert.equal(unboxed.get('lane'), 'unboxed');
  assert.equal(unboxed.get('inbound'), null);

  const back = applyInboundLane(docked, 'pipeline');
  assert.equal(back.get('lane'), null);
});

test('exceptions is a lane of its own: parsed, written, and it sheds the paste and the facets', () => {
  assert.equal(parseInboundLane('Exceptions'), 'exceptions');
  const pasted = new URLSearchParams('ref_in=PO-1,PO-2&recon=not_received&state=IN_TRANSIT&sort=zoho_oldest&openLine=7&page=3');
  const next = applyInboundLane(pasted, 'exceptions');
  assert.equal(next.get('lane'), 'exceptions');
  for (const gone of ['ref_in', 'recon', 'state', 'openLine', 'page']) assert.equal(next.get(gone), null, gone);
  assert.equal(next.get('sort'), 'zoho_oldest', 'Exceptions orders like Incoming');
  assert.equal(applyInboundLane(new URLSearchParams('sort=unboxed_newest'), 'exceptions').get('sort'), null);
  // Docked never carries a paste either; Pipeline round-trips back to no lane.
  assert.equal(applyInboundLane(pasted, 'docked').get('ref_in'), null);
  assert.equal(applyInboundLane(next, 'pipeline').get('lane'), null);
  // A list pasted on Unboxed is Unboxed's: back on On the way it is gone, reason filter too.
  const unboxedPaste = new URLSearchParams('lane=unboxed&ref_in=PO-1,PO-2&recon=received&recon_reason=unboxed');
  for (const gone of ['ref_in', 'recon', 'recon_reason']) assert.equal(applyInboundLane(unboxedPaste, 'pipeline').get(gone), null, gone);
});

test('Purchasing is its own Receiving mode (`/purchasing`), never a Deliveries lane', () => {
  assert.equal(parseInboundLane('purchases'), 'pipeline');
  assert.equal((INBOUND_LANE_PARAM_VALUES as readonly string[]).includes('purchases'), false);
});
