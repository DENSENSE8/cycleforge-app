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
  // `/incoming` is the Deliveries desk (On the way · History · PO Mailbox) — the title mirrors the sidebar page LABEL, which the name law…
  assert.equal(getMobileAppTitle('/incoming'), 'Deliveries');
  assert.equal(getMobileAppTitle('/pickup'), 'Local Pickup');
  // The Receiving mode's label, not 'Repair':
  assert.equal(getMobileAppTitle('/repair'), 'Repair service');
});

test('getMobileAppTitle resolves mobile daily and assigned-orders routes', () => {
  // `/m/home` IS the shift checklist since 2026-09-14 (it stopped being a redirect stub), and since the 2026-09-15 deletion it is the ONLY…
  assert.equal(getMobileAppTitle('/m/home'), 'Daily');
  assert.equal(getMobileAppTitle('/m/settings'), 'Settings');
  assert.equal(getMobileAppTitle('/m/work'), 'Allocate');
  assert.equal(getMobileAppTitle('/m/work/42'), 'Fulfill');
  assert.equal(getMobileAppTitle('/m/orders'), 'Allocate');
  assert.equal(getMobileAppTitle('/m/orders/42'), 'Fulfill');
  assert.equal(getMobileAppTitle('/m/exceptions'), 'Exceptions');
  assert.equal(getMobileAppTitle('/m/exceptions/42'), 'Exceptions');
  assert.equal(getMobileAppTitle('/m/exceptions/bins%3A9'), 'Exceptions');
  assert.equal(getMobileAppTitle('/m/products'), 'Products');
  assert.equal(getMobileAppTitle('/m/products/SKU-42'), 'Products');
  assert.equal(getMobileAppTitle('/m/reports'), 'Reports');
  assert.equal(getMobileAppTitle('/m/pick'), 'Picks');
  assert.equal(getMobileAppTitle('/m/pack'), 'Packing');
  assert.equal(getMobileAppTitle('/m/scan'), 'Scan');
  assert.equal(getMobileAppTitle('/m/id/scan-out/42'), 'Scan out');
  assert.equal(getMobileAppTitle('/m/id/pick/42'), 'Picks');
  assert.notEqual(getMobileAppTitle('/m/checklist'), 'Checklists');
  // Precedence: the new-order job is not swallowed by the '/m/orders/' queue prefix.
  assert.notEqual(getMobileAppTitle('/m/orders/new'), getMobileAppTitle('/m/orders'));
});

test('routeHasMobileContextRow includes receiving', () => {
  assert.equal(routeHasMobileContextRow('receiving'), true);
  assert.equal(routeHasMobileContextRow('dashboard'), true);
  assert.equal(routeHasMobileContextRow('tech'), false);
});
