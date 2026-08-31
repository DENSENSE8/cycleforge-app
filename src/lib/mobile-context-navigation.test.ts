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
  // `/incoming` is the Inbound desk (Pipeline + Docked lanes) — title mirrors
  // the sidebar page label.
  assert.equal(getMobileAppTitle('/incoming'), 'Inbound');
  assert.equal(getMobileAppTitle('/pickup'), 'Local Pickup');
  // 'Repair Service', not 'Repair': the title mirrors the sidebar page label,
  // and the walk-in bench was renamed there (Local Pickup · Repair Service) so
  // the counter's two jobs read as two jobs. The label is the SoT; this
  // assertion follows it rather than pinning the old word.
  assert.equal(getMobileAppTitle('/repair'), 'Repair Service');
});

test('routeHasMobileContextRow includes receiving', () => {
  assert.equal(routeHasMobileContextRow('receiving'), true);
  assert.equal(routeHasMobileContextRow('dashboard'), true);
  assert.equal(routeHasMobileContextRow('tech'), false);
});
