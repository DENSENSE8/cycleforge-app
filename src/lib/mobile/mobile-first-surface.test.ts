import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateOutboundWorkflowContract,
  MOBILE_FIRST_VERB_GAPS,
  OUTBOUND_FBA_VERBS,
  OUTBOUND_WORKFLOW_STAGES,
  OUTBOUND_WORKFLOW_SURFACES,
} from './mobile-first-surface';

test('Outbound has one canonical mobile orders door', () => {
  assert.equal(OUTBOUND_WORKFLOW_SURFACES.orders.canonicalMobilePath, '/m/orders');
  assert.deepEqual(OUTBOUND_WORKFLOW_SURFACES.orders.legacyMobilePaths, ['/m/work']);
});

test('Outbound exceptions has one mobile queue and one desktop projection', () => {
  assert.equal(OUTBOUND_WORKFLOW_SURFACES.exceptions.canonicalMobilePath, '/m/exceptions');
  assert.equal(OUTBOUND_WORKFLOW_SURFACES.exceptions.desktopPath, '/shipping/exceptions');
  assert.equal(
    MOBILE_FIRST_VERB_GAPS.some((gap) => gap.id === 'outbound-exceptions'),
    false,
  );
});

test('shortage work and shipped lookup have mobile completion paths', () => {
  assert.equal(OUTBOUND_WORKFLOW_SURFACES.history.canonicalMobilePath, '/m/shipping/history');
  assert.equal(
    MOBILE_FIRST_VERB_GAPS.some((gap) =>
      gap.id === 'outbound-shortage' || gap.id === 'outbound-shipped-history'),
    false,
  );
});

test('rack staging and carrier scan-out have queue and task paths', () => {
  assert.equal(OUTBOUND_WORKFLOW_SURFACES.staging.canonicalMobilePath, '/m/shipping/stage');
  assert.equal(OUTBOUND_WORKFLOW_SURFACES.scanOut.canonicalMobilePath, '/m/shipping/scan-out');
  assert.equal(
    MOBILE_FIRST_VERB_GAPS.some((gap) =>
      gap.id === 'outbound-stage-location' || gap.id === 'outbound-scan-out-queue'),
    false,
  );
});

test('FBA plan has a phone task while physical scan, verify, bind, and close stay governed gaps', () => {
  assert.ok(OUTBOUND_FBA_VERBS.length >= 5);
  assert.deepEqual(OUTBOUND_FBA_VERBS.find((verb) => verb.id === 'fba-plan'), {
    id: 'fba-plan',
    label: 'Plan shipment',
    desktopPath: '/shipping/fba?fbaMode=plan',
    api: '/api/fba/shipments',
    mobilePath: '/m/shipping/fba',
    completion: 'live',
  });
  assert.deepEqual(OUTBOUND_FBA_VERBS.find((verb) => verb.id === 'fba-scan-unit')?.mobilePath, '/m/shipping/fba/scan');
  assert.equal(OUTBOUND_FBA_VERBS.find((verb) => verb.id === 'fba-scan-unit')?.completion, 'live');
  assert.equal(OUTBOUND_FBA_VERBS.find((verb) => verb.id === 'fba-verify-unit')?.mobilePath, '/m/shipping/fba/verify');
  assert.equal(OUTBOUND_FBA_VERBS.find((verb) => verb.id === 'fba-verify-unit')?.completion, 'live');
  assert.equal(OUTBOUND_FBA_VERBS.find((verb) => verb.id === 'fba-bind-label')?.mobilePath, '/m/shipping/fba/label');
  assert.equal(OUTBOUND_FBA_VERBS.find((verb) => verb.id === 'fba-bind-label')?.completion, 'live');
  assert.equal(OUTBOUND_FBA_VERBS.find((verb) => verb.id === 'fba-close-shipment')?.mobilePath, '/m/shipping/fba/close');
  assert.equal(OUTBOUND_FBA_VERBS.find((verb) => verb.id === 'fba-close-shipment')?.completion, 'live');
  assert.ok(OUTBOUND_FBA_VERBS.every((verb) => verb.completion === 'live'));
  assert.ok(OUTBOUND_FBA_VERBS.every((verb) => verb.mobilePath));
  assert.equal(MOBILE_FIRST_VERB_GAPS.some((gap) => gap.id === 'outbound-fba'), false);
});

test('every outbound stage is explicitly live, partial, or a governed gap', () => {
  const gapIds = new Set(MOBILE_FIRST_VERB_GAPS.map((gap) => gap.id));
  for (const stage of OUTBOUND_WORKFLOW_STAGES) {
    assert.ok(['live', 'partial', 'gap'].includes(stage.completion), stage.id);
    if ('gapId' in stage) {
      assert.ok(gapIds.has(stage.gapId), `${stage.id} references ${stage.gapId}`);
    }
    if (stage.completion === 'gap') {
      assert.equal(stage.mobilePath, null, `${stage.id} must not claim a mobile path`);
      assert.ok('gapId' in stage, `${stage.id} must point at the gap ledger`);
    }
  }
});

test('mobile and desktop use different presentations over the same orders job', () => {
  assert.match(OUTBOUND_WORKFLOW_SURFACES.orders.presentation.mobile, /hairline rows/i);
  assert.match(OUTBOUND_WORKFLOW_SURFACES.orders.presentation.desktop, /DataTable/i);
  assert.notEqual(
    OUTBOUND_WORKFLOW_SURFACES.orders.presentation.mobile,
    OUTBOUND_WORKFLOW_SURFACES.orders.presentation.desktop,
  );
});

test('the mobile-first MCP face names the shared workflow fact resolver', () => {
  const verdict = evaluateOutboundWorkflowContract();
  assert.equal(verdict.factsContract.resolver, 'resolveOutboundWorkflowFacts');
  assert.deepEqual(verdict.factsContract.owns, [
    'stage',
    'deadlineBand',
    'blocked',
    'readyForScanOut',
    'nextStep',
    'exception',
    'actions',
  ]);
  assert.deepEqual(verdict.factsContract.actionIds, [
    'label',
    'pick',
    'pack',
    'hold',
    'clear_hold',
    'stage',
    'scan_out',
  ]);
});
