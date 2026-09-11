/**
 * Unit tests for Skew Protection pin decisions.
 * Run: `node --import tsx --test src/lib/vercel/skew-pin.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { skewPinDecision } from './skew-pin';

const ON = {
  skewProtectionEnabled: '1',
  deploymentId: 'dpl_abc',
  existingVdpl: undefined as string | undefined,
  hasStaffSession: false,
  isKioskHost: false,
};

test('skewPinDecision: off unless platform flag + deployment id', () => {
  assert.deepEqual(skewPinDecision({ ...ON, skewProtectionEnabled: undefined }), { pin: false });
  assert.deepEqual(skewPinDecision({ ...ON, skewProtectionEnabled: '0' }), { pin: false });
  assert.deepEqual(skewPinDecision({ ...ON, deploymentId: undefined }), { pin: false });
  assert.deepEqual(skewPinDecision({ ...ON, deploymentId: '  ' }), { pin: false });
});

test('skewPinDecision: does not pin anonymous staff-host traffic', () => {
  assert.deepEqual(skewPinDecision(ON), { pin: false });
});

test('skewPinDecision: pins staff session and kiosk host', () => {
  assert.deepEqual(skewPinDecision({ ...ON, hasStaffSession: true }), {
    pin: true,
    deploymentId: 'dpl_abc',
  });
  assert.deepEqual(skewPinDecision({ ...ON, isKioskHost: true }), {
    pin: true,
    deploymentId: 'dpl_abc',
  });
});

test('skewPinDecision: does not overwrite an existing pin', () => {
  assert.deepEqual(
    skewPinDecision({ ...ON, hasStaffSession: true, existingVdpl: 'dpl_old' }),
    { pin: false },
  );
});
