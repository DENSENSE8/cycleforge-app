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

test('getMobileAppTitle resolves mobile home and assigned-orders routes', () => {
  assert.equal(getMobileAppTitle('/m/home'), 'Home');
  assert.equal(getMobileAppTitle('/m/work'), 'Orders');
  assert.equal(getMobileAppTitle('/m/search'), 'Find');
  assert.equal(getMobileAppTitle('/m/pick'), 'Picks');
  assert.equal(getMobileAppTitle('/m/pack'), 'Packing');
  assert.equal(getMobileAppTitle('/m/print'), 'Print');
  assert.equal(getMobileAppTitle('/m/scan'), 'Scan');
  assert.equal(getMobileAppTitle('/m/id/scan-out/42'), 'Scan out');
  assert.equal(getMobileAppTitle('/m/id/pick/42'), 'Picks');
  assert.equal(getMobileAppTitle('/m/checklist'), 'Checklists');
  assert.equal(getMobileAppTitle('/m/triage'), 'Scan');
  assert.equal(getMobileAppTitle('/m/unbox'), 'Unbox');
  assert.equal(getMobileAppTitle('/m/receiving'), 'Photo feed');
  assert.equal(
    getMobileAppTitle('/m/receiving', new URLSearchParams('mode=local-pickup')),
    'Walk-In',
  );
  assert.equal(
    getMobileAppTitle('/m/receiving', new URLSearchParams('mode=repair')),
    'Repair',
  );
});

test('routeHasMobileContextRow includes receiving', () => {
  assert.equal(routeHasMobileContextRow('receiving'), true);
  assert.equal(routeHasMobileContextRow('dashboard'), true);
  assert.equal(routeHasMobileContextRow('tech'), false);
});
