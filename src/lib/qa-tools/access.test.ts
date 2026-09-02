import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QA_TOOL_PERMISSIONS,
  resolveQaToolsAccess,
} from './access';

test('sandbox org with view permission can open the QA console', () => {
  const access = resolveQaToolsAccess({
    organizationEnvironment: 'sandbox',
    permissions: new Set([QA_TOOL_PERMISSIONS.view]),
  });

  assert.deepEqual(access, {
    visible: true,
    canExecute: false,
    canResetFixtures: false,
    canDestructive: false,
    reason: 'authorized',
  });
});

test('customer org is denied even when the user has QA permissions', () => {
  const access = resolveQaToolsAccess({
    organizationEnvironment: 'customer',
    permissions: new Set([
      QA_TOOL_PERMISSIONS.view,
      QA_TOOL_PERMISSIONS.execute,
      QA_TOOL_PERMISSIONS.fixtureReset,
    ]),
  });

  assert.equal(access.visible, false);
  assert.equal(access.reason, 'organization_not_sandbox');
});

test('QA actions are independently permissioned', () => {
  const access = resolveQaToolsAccess({
    organizationEnvironment: 'sandbox',
    permissions: new Set([QA_TOOL_PERMISSIONS.execute]),
  });

  assert.equal(access.visible, false);
  assert.equal(access.canExecute, false);
  assert.equal(access.canResetFixtures, false);
  assert.equal(access.reason, 'missing_view_permission');
});

test('fixture reset requires the destructive QA permission', () => {
  const access = resolveQaToolsAccess({
    organizationEnvironment: 'sandbox',
    permissions: new Set([
      QA_TOOL_PERMISSIONS.view,
      QA_TOOL_PERMISSIONS.execute,
    ]),
  });

  assert.equal(access.visible, true);
  assert.equal(access.canExecute, true);
  assert.equal(access.canResetFixtures, false);
});

test('destructive replay requires the dedicated destructive QA permission', () => {
  const access = resolveQaToolsAccess({
    organizationEnvironment: 'sandbox',
    permissions: new Set([QA_TOOL_PERMISSIONS.view, QA_TOOL_PERMISSIONS.execute]),
  });

  assert.equal(access.canDestructive, false);
});
