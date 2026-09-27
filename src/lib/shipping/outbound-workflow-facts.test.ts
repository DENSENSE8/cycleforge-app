import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOutboundWorkflowFacts } from './outbound-workflow-facts';

const TODAY = '2026-09-16';

test('mobile and desktop-shaped inputs receive the same workflow verdict', () => {
  const desktop = resolveOutboundWorkflowFacts(
    {
      shipmentId: 42,
      hasPickScan: true,
      packedAt: null,
      isOutOfStock: false,
      deadlineAt: '2026-09-15T12:00:00Z',
    },
    { todayKey: TODAY },
  );
  const mobile = resolveOutboundWorkflowFacts(
    {
      shipmentId: '42',
      hasPickScan: true,
      packedAt: null,
      isOutOfStock: null,
      deadlineAt: '2026-09-15T12:00:00Z',
    },
    { todayKey: TODAY },
  );

  assert.deepEqual(mobile, desktop);
  assert.equal(desktop.stage, 'TESTED');
  assert.equal(desktop.stateRail, 'ready');
  assert.equal(desktop.deadlineBand, 'overdue');
  assert.equal(desktop.nextStep.label, '→ Pack');
  assert.equal(desktop.actions.pack.state, 'primary');
  assert.equal(desktop.exception.kind, 'none');
});

test('packed work needs a dock-stage fact before it becomes scan-out ready', () => {
  const facts = resolveOutboundWorkflowFacts({
    shipmentId: 42,
    hasPickScan: true,
    packedAt: '2026-09-16T12:00:00Z',
    isOutOfStock: 'Out of stock',
  });

  assert.equal(facts.stage, 'PACKED_STAGED');
  assert.equal(facts.blocked, false);
  assert.equal(facts.readyForScanOut, false);
  assert.equal(facts.actions.scan_out.state, 'blocked');
  assert.equal(facts.actions.stage.state, 'primary');
});

test('a DOCK_STAGED timestamp is the only scan-out readiness proof', () => {
  const facts = resolveOutboundWorkflowFacts({
    shipmentId: 42,
    hasPickScan: true,
    packedAt: '2026-09-16T12:00:00Z',
    dockStagedAt: '2026-09-16T12:10:00Z',
  });

  assert.equal(facts.staged, true);
  assert.equal(facts.stateRail, 'packed');
  assert.equal(facts.readyForScanOut, true);
  assert.equal(facts.actions.stage.state, 'complete');
  assert.equal(facts.actions.scan_out.state, 'primary');
});

test('out-of-stock resolves to one blocked clear-hold verdict', () => {
  const facts = resolveOutboundWorkflowFacts({
    shipmentId: 42,
    isOutOfStock: true,
    deadlineAt: '2026-09-16',
  }, { todayKey: TODAY });

  assert.equal(facts.stage, 'BLOCKED');
  assert.equal(facts.deadlineBand, 'today');
  assert.equal(facts.blocked, true);
  assert.equal(facts.nextStep.label, '→ Clear hold');
  assert.equal(facts.nextStep.blocked, true);
  assert.equal(facts.exception.kind, 'out_of_stock');
  assert.equal(facts.stateRail, 'exception');
  assert.equal(facts.actions.clear_hold.state, 'primary');
});
