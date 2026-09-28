import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTBOUND_TRIAGE_ACTIONS,
  OUTBOUND_TRIAGE_ACTION_IDS,
  OUTBOUND_CHANNEL_TRIAGE_ACTIONS,
  OUTBOUND_CHANNEL_TRIAGE_ACTION_IDS,
  OUTBOUND_PRIORITY_ACTION_IDS,
  OUTBOUND_WORKFLOW_ACTION_IDS,
  resolveOutboundPriorityAction,
  resolveOutboundWorkflowActions,
  resolveOutboundWorkflowException,
} from './outbound-workflow-actions';

test('floor triage has three durable, non-execution commands', () => {
  assert.deepEqual(OUTBOUND_TRIAGE_ACTIONS.map((action) => action.id), [...OUTBOUND_TRIAGE_ACTION_IDS]);
  assert.deepEqual(OUTBOUND_TRIAGE_ACTIONS.map((action) => action.persistedAs), [
    'shortage',
    'damaged',
    'discrepancy',
  ]);
});

test('channel triage remains a separate closed marketplace mutation vocabulary', () => {
  assert.deepEqual(OUTBOUND_CHANNEL_TRIAGE_ACTIONS.map((action) => action.id), [...OUTBOUND_CHANNEL_TRIAGE_ACTION_IDS]);
  assert.deepEqual(OUTBOUND_CHANNEL_TRIAGE_ACTIONS.map((action) => action.mutation), [
    'halt_listing',
    'set_inventory_zero',
  ]);
});

test('priority uses one closed two-direction command on every surface', () => {
  assert.deepEqual(OUTBOUND_PRIORITY_ACTION_IDS, ['mark_urgent', 'clear_urgent']);
  assert.deepEqual(resolveOutboundPriorityAction(false), { id: 'mark_urgent', label: 'Mark urgent' });
  assert.deepEqual(resolveOutboundPriorityAction(true), { id: 'clear_urgent', label: 'Clear urgent' });
});

test('every workflow verdict carries the same seven stable action ids', () => {
  const actions = resolveOutboundWorkflowActions({
    stage: 'PENDING',
    hasLabel: true,
    hasPickScan: false,
    packed: false,
    staged: false,
  });

  assert.deepEqual(Object.keys(actions), [...OUTBOUND_WORKFLOW_ACTION_IDS]);
  assert.deepEqual(actions.pick, {
    id: 'pick',
    label: 'Pick',
    state: 'primary',
    enabled: true,
  });
  assert.equal(actions.pack.state, 'blocked');
  assert.equal(actions.hold.state, 'available');
});

test('out-of-stock exposes one typed exception and only clear-hold as primary', () => {
  const actions = resolveOutboundWorkflowActions({
    stage: 'BLOCKED',
    hasLabel: true,
    hasPickScan: false,
    packed: false,
    staged: false,
  });
  const exception = resolveOutboundWorkflowException('BLOCKED');

  assert.deepEqual(exception, {
    kind: 'out_of_stock',
    code: 'OUT_OF_STOCK',
    severity: 'blocking',
    message: 'Inventory mismatch for current unit',
    resolutionAction: 'clear_hold',
  });
  assert.equal(actions.clear_hold.state, 'primary');
  assert.equal(actions.clear_hold.enabled, true);
  assert.equal(actions.hold.state, 'complete');
  assert.equal(actions.pick.state, 'blocked');
  assert.equal(actions.pack.state, 'blocked');
  assert.equal(actions.scan_out.state, 'blocked');
});

test('packed work requires the physical dock-stage signal before scan-out', () => {
  const actions = resolveOutboundWorkflowActions({
    stage: 'PACKED_STAGED',
    hasLabel: true,
    hasPickScan: true,
    packed: true,
    staged: false,
  });

  assert.equal(actions.pack.state, 'complete');
  assert.equal(actions.stage.state, 'primary');
  assert.equal(actions.scan_out.state, 'blocked');
  assert.equal(actions.scan_out.enabled, false);
  assert.equal(actions.hold.state, 'unavailable');
});

test('a dock-stage signal completes staging and unlocks scan-out', () => {
  const actions = resolveOutboundWorkflowActions({
    stage: 'PACKED_STAGED',
    hasLabel: true,
    hasPickScan: true,
    packed: true,
    staged: true,
  });

  assert.equal(actions.stage.state, 'complete');
  if (actions.stage.state !== 'complete') assert.fail('stage should be complete');
  assert.equal(actions.stage.completionBasis, 'direct_signal');
  assert.equal(actions.scan_out.state, 'primary');
  assert.equal(actions.scan_out.enabled, true);
});

test('missing-label data cannot create two primary commands', () => {
  const pickedWithoutLabel = resolveOutboundWorkflowActions({
    stage: 'PICKED',
    hasLabel: false,
    hasPickScan: true,
    packed: false,
    staged: false,
  });
  const primary = Object.values(pickedWithoutLabel).filter((action) => action.state === 'primary');

  assert.deepEqual(primary.map((action) => action.id), ['label']);
  assert.equal(pickedWithoutLabel.pick.state, 'complete');
  assert.equal(pickedWithoutLabel.pack.state, 'blocked');
});
