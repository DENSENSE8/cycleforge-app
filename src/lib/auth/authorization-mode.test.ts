import test from 'node:test';
import assert from 'node:assert/strict';
import {
  effectivePermissionsForAuthorizationMode,
  parseAuthorizationModeConfig,
  resolveAuthorizationMode,
  shouldRequireStepUp,
} from './authorization-mode';
import type { PermissionString } from './permissions-shared';

const ORG_ONE = '00000000-0000-0000-0000-000000000001';
const ORG_TWO = '00000000-0000-0000-0000-000000000002';
const CUSTOMER = '00000000-0000-0000-0000-000000000003';

test('authorization mode defaults to strict', () => {
  const config = parseAuthorizationModeConfig({});
  assert.equal(config.mode, 'strict');
  assert.equal(resolveAuthorizationMode(ORG_ONE, config), 'strict');
});

test('explicit strict mode ignores an allowlist', () => {
  const config = parseAuthorizationModeConfig({
    AUTHORIZATION_MODE: 'strict',
    AUTHORIZATION_MODE_ORGS: ORG_ONE,
  });
  assert.equal(resolveAuthorizationMode(ORG_ONE, config), 'strict');
});

test('authenticated-only applies to both dogfood organizations and not other organizations', () => {
  const config = parseAuthorizationModeConfig({
    AUTHORIZATION_MODE: 'authenticated-only',
    AUTHORIZATION_MODE_ORGS: ` ${ORG_ONE.toUpperCase()}, ${ORG_TWO} `,
  });
  assert.equal(resolveAuthorizationMode(ORG_ONE, config), 'authenticated-only');
  assert.equal(resolveAuthorizationMode(ORG_TWO, config), 'authenticated-only');
  assert.equal(resolveAuthorizationMode(CUSTOMER, config), 'strict');
});

test('authenticated-only rejects an empty allowlist', () => {
  assert.throws(
    () => parseAuthorizationModeConfig({ AUTHORIZATION_MODE: 'authenticated-only' }),
    /AUTHORIZATION_MODE_ORGS must contain at least one organization UUID/,
  );
});

test('authenticated-only rejects malformed organization ids', () => {
  assert.throws(
    () => parseAuthorizationModeConfig({
      AUTHORIZATION_MODE: 'authenticated-only',
      AUTHORIZATION_MODE_ORGS: 'dogfood',
    }),
    /invalid organization UUID/,
  );
});

test('unknown modes fail closed as configuration errors', () => {
  assert.throws(
    () => parseAuthorizationModeConfig({ AUTHORIZATION_MODE: 'off' }),
    /AUTHORIZATION_MODE must be/,
  );
});

test('authenticated-only expands effective permissions without changing stored permissions', () => {
  const stored = new Set<PermissionString>(['dashboard.view']);
  const effective = effectivePermissionsForAuthorizationMode('authenticated-only', stored);
  assert.equal(stored.size, 1);
  assert.ok(effective.has('dashboard.view'));
  assert.ok(effective.has('admin.manage_staff'));
  assert.ok(effective.size > stored.size);
});

test('strict mode preserves the stored permission boundary', () => {
  const stored = new Set<PermissionString>(['dashboard.view']);
  const effective = effectivePermissionsForAuthorizationMode('strict', stored);
  assert.deepEqual(effective, stored);
  assert.notEqual(effective, stored);
});

test('explicit security step-up survives authenticated-only mode', () => {
  assert.equal(shouldRequireStepUp({
    mode: 'authenticated-only',
    isAdmin: false,
    explicit: true,
    permissionRequiresStepUp: false,
  }), true);
});

test('permission-derived step-up is bypassed only in authenticated-only mode', () => {
  assert.equal(shouldRequireStepUp({
    mode: 'authenticated-only',
    isAdmin: false,
    explicit: false,
    permissionRequiresStepUp: true,
  }), false);
  assert.equal(shouldRequireStepUp({
    mode: 'strict',
    isAdmin: false,
    explicit: false,
    permissionRequiresStepUp: true,
  }), true);
});
