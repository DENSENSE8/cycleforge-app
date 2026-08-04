/**
 * Parity + precedence for Unbox named flows (Found · Unfound · Return).
 *
 * Pins the resolved capture/commit key sequences so a flow-table edit cannot
 * silently change the operator walk. Legacy three-boolean inputs must map to
 * the same keys as the named-flow context.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProcedure,
  registerBuiltinProcedures,
  resolveContextFromFlags,
  resolveProcedureSteps,
  resolveUnboxFlow,
  UNBOX_FLOW_IDS,
  UNBOX_FLOW_LABEL,
  type ProcedureResolveContext,
  type UnboxFlowId,
} from './procedure';

registerBuiltinProcedures();

const unbox = () => {
  const p = getProcedure('unbox');
  assert.ok(p, 'unbox procedure registered');
  return p;
};

const captureKeys = (ctx: ProcedureResolveContext) =>
  resolveProcedureSteps(unbox(), ctx, 'capture').map((s) => s.key);

const FOUND_CAPTURE = [
  'arrival_check',
  'shipping_label_photo',
  'box_photo',
  'packing_material',
  'contents',
  'condition',
  'item_photos',
  'serial',
  'label',
];

const UNFOUND_CAPTURE = ['classify', ...FOUND_CAPTURE];

const RETURN_CAPTURE = [
  'arrival_check',
  'shipping_label_photo',
  'box_photo',
  'packing_material',
  'contents',
  'serial',
  'condition',
  'item_photos',
  'label',
];

test('resolveUnboxFlow precedence: return > unfound > found', () => {
  assert.equal(resolveUnboxFlow({ isReturn: true, isUnfound: true }), 'return');
  assert.equal(resolveUnboxFlow({ isReturn: true, isUnfound: false }), 'return');
  assert.equal(resolveUnboxFlow({ isReturn: false, isUnfound: true }), 'unfound');
  assert.equal(resolveUnboxFlow({ isReturn: false, isUnfound: false }), 'found');
});

test('three primary flows resolve the declared capture walks', () => {
  assert.deepEqual(captureKeys({ flow: 'found' }), FOUND_CAPTURE);
  assert.deepEqual(captureKeys({ flow: 'unfound' }), UNFOUND_CAPTURE);
  assert.deepEqual(captureKeys({ flow: 'return' }), RETURN_CAPTURE);
});

test('return + needsClassify prepends classify (unfound return)', () => {
  assert.deepEqual(
    captureKeys({ flow: 'return', modifiers: { needsClassify: true } }),
    ['classify', ...RETURN_CAPTURE],
  );
});

test('local-pickup modifier omits dunnage on every flow', () => {
  for (const flow of UNBOX_FLOW_IDS) {
    const keys = captureKeys({ flow, modifiers: { isLocalPickup: true } });
    assert.ok(!keys.includes('shipping_label_photo'), `${flow}: no shipping label`);
    assert.ok(!keys.includes('box_photo'), `${flow}: no box photo`);
    assert.ok(!keys.includes('packing_material'), `${flow}: no packing`);
    assert.ok(keys.includes('arrival_check'), `${flow}: arrival still present`);
    assert.ok(keys.includes('contents'), `${flow}: contents still present`);
  }
});

test('legacy boolean flags map to the same capture keys as named flows', () => {
  const shapes: Array<{
    name: string;
    flags: { isUnfound: boolean; isLocalPickup: boolean; isReturn: boolean };
  }> = [
    { name: 'matched', flags: { isUnfound: false, isLocalPickup: false, isReturn: false } },
    { name: 'unfound', flags: { isUnfound: true, isLocalPickup: false, isReturn: false } },
    { name: 'local pickup', flags: { isUnfound: false, isLocalPickup: true, isReturn: false } },
    { name: 'return', flags: { isUnfound: false, isLocalPickup: false, isReturn: true } },
    { name: 'unfound return', flags: { isUnfound: true, isLocalPickup: false, isReturn: true } },
    { name: 'pickup return', flags: { isUnfound: false, isLocalPickup: true, isReturn: true } },
  ];

  for (const { name, flags } of shapes) {
    const fromFlags = resolveContextFromFlags(flags);
    const viaLegacy = captureKeys(flags);
    const viaContext = captureKeys(fromFlags);
    assert.deepEqual(viaLegacy, viaContext, `${name}: legacy vs context`);
  }
});

test('commit phase is print → receive on every flow', () => {
  for (const flow of UNBOX_FLOW_IDS) {
    assert.deepEqual(
      resolveProcedureSteps(unbox(), { flow }, 'commit').map((s) => s.key),
      ['print', 'receive'],
      `${flow} commit`,
    );
  }
});

test('every flow has an operator-voiced label', () => {
  for (const id of UNBOX_FLOW_IDS) {
    assert.ok(UNBOX_FLOW_LABEL[id as UnboxFlowId].length > 0);
  }
});

test('procedure definition exposes the three flows', () => {
  const flows = unbox().flows;
  assert.ok(flows);
  assert.deepEqual(Object.keys(flows!).sort(), [...UNBOX_FLOW_IDS].sort());
});
