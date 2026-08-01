import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMobileAppTitle,
  routeHasMobileContextRow,
} from '@/lib/mobile-context-navigation';

test('getMobileAppTitle resolves receiving-family route labels', () => {
  // Legacy `/receiving` lands on Unbox; graduated surfaces use their L1 labels.
  assert.equal(getMobileAppTitle('/receiving'), 'Unbox');
  assert.equal(getMobileAppTitle('/receiving/lines/42'), 'Unbox');
  assert.equal(getMobileAppTitle('/unbox'), 'Unbox');
  assert.equal(getMobileAppTitle('/triage'), 'Arrival');
  assert.equal(getMobileAppTitle('/incoming'), 'Incoming');
  assert.equal(getMobileAppTitle('/pickup'), 'Local Pickup');
  assert.equal(getMobileAppTitle('/repair'), 'Repair Service');
});

test('routeHasMobileContextRow includes receiving', () => {
  assert.equal(routeHasMobileContextRow('receiving'), true);
  assert.equal(routeHasMobileContextRow('dashboard'), true);
  assert.equal(routeHasMobileContextRow('tech'), false);
});
