import test from 'node:test';
import assert from 'node:assert/strict';
import { flagsFromPermissionSet, resolveQaCapability } from './capabilities';

const none = new Set<string>();
const view = new Set(['developer.qa_tools.view']);
const adminish = new Set([
  'developer.qa_tools.view',
  'developer.qa_tools.execute',
  'developer.qa_tools.destructive',
  'developer.qa_tools.connection_debug',
  'developer.qa_tools.webhook_replay',
  'developer.qa_tools.fixture_reset',
]);

test('customer org is denied even with every QA permission', () => {
  const cap = resolveQaCapability({
    environment: 'customer',
    permissions: adminish,
    required: 'developer.qa_tools.view',
  });
  assert.equal(cap.allowed, false);
  assert.equal(cap.reason, 'not_sandbox');
});

test('sandbox org without the permission is denied', () => {
  const cap = resolveQaCapability({
    environment: 'sandbox',
    permissions: none,
    required: 'developer.qa_tools.view',
  });
  assert.equal(cap.allowed, false);
  assert.equal(cap.reason, 'missing_permission');
});

test('sandbox org with view can open the console', () => {
  const cap = resolveQaCapability({
    environment: 'sandbox',
    permissions: view,
    required: 'developer.qa_tools.view',
  });
  assert.equal(cap.allowed, true);
  assert.equal(cap.reason, 'ok');
});

test('view does not satisfy fixture reset', () => {
  const cap = resolveQaCapability({
    environment: 'sandbox',
    permissions: view,
    required: 'developer.qa_tools.fixture_reset',
  });
  assert.equal(cap.allowed, false);
  assert.equal(cap.reason, 'missing_permission');
});

test('destructive implies execute and fixture reset', () => {
  const flags = flagsFromPermissionSet(new Set(['developer.qa_tools.destructive']));
  assert.equal(flags.destructive, true);
  assert.equal(flags.execute, true);
  assert.equal(flags.fixtureReset, true);
  const cap = resolveQaCapability({
    environment: 'sandbox',
    permissions: new Set(['developer.qa_tools.destructive']),
    required: 'developer.qa_tools.fixture_reset',
  });
  assert.equal(cap.allowed, true);
});

test('missing org is denied as not found, not as a permission miss', () => {
  const cap = resolveQaCapability({
    environment: 'sandbox',
    permissions: adminish,
    orgFound: false,
  });
  assert.equal(cap.allowed, false);
  assert.equal(cap.reason, 'org_not_found');
});
