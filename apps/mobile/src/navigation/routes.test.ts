import test from 'node:test';
import assert from 'node:assert/strict';
import { MOBILE_MODULES, getModuleDefinition } from './routes';

test('declares every required L1 module with L2, L3, and L4 labels', () => {
  assert.equal(MOBILE_MODULES.length, 8);
  for (const module of MOBILE_MODULES) {
    assert.ok(module.label);
    assert.ok(module.sessionLabel);
    assert.ok(module.workspaceLabel);
    assert.ok(module.contextLabel);
    assert.equal(getModuleDefinition(module.key).key, module.key);
  }
});

test('maps the required module names to the mobile navigation tree', () => {
  assert.deepEqual(
    MOBILE_MODULES.map((module) => module.key),
    [
      'FieldAcquisitions',
      'Receiving',
      'PickLists',
      'PackShip',
      'ItemLookup',
      'BinTransfers',
      'ScanHistory',
      'WorkspaceSettings',
    ],
  );
});
