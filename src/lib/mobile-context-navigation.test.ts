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
  // `/incoming` is the Deliveries desk (On the way · History · PO Mailbox) —
  // the title mirrors the sidebar page LABEL, which the name law renamed from
  // *Inbound* to **Deliveries** on 2026-09-14 (a child never wears its
  // parent's name; the lane keeps *Inbound*). This pin follows the label, it
  // does not preserve the retired word.
  assert.equal(getMobileAppTitle('/incoming'), 'Deliveries');
  assert.equal(getMobileAppTitle('/pickup'), 'Local Pickup');
  // 'Repair Service', not 'Repair': the title mirrors the sidebar page label,
  // and the walk-in bench was renamed there (Local Pickup · Repair Service) so
  // the counter's two jobs read as two jobs. The label is the SoT; this
  // assertion follows it rather than pinning the old word.
  assert.equal(getMobileAppTitle('/repair'), 'Repair Service');
});

test('getMobileAppTitle resolves mobile daily and assigned-orders routes', () => {
  // `/m/home` IS the shift checklist since 2026-09-14 (it stopped being a
  // redirect stub), and since the 2026-09-15 deletion it is the ONLY checklist
  // word on the phone — `/m/checklist` (the SKU kit / QC editor) is gone, so
  // its path falls through to the desktop page label rather than answering
  // "Checklists".
  assert.equal(getMobileAppTitle('/m/home'), 'Daily');
  assert.equal(getMobileAppTitle('/m/settings'), 'Settings');
  assert.equal(getMobileAppTitle('/m/work'), 'Order management');
  assert.equal(getMobileAppTitle('/m/orders'), 'Order management');
  assert.equal(getMobileAppTitle('/m/orders/42'), 'Order management');
  assert.equal(getMobileAppTitle('/m/shipping'), 'Shipping & packing');
  assert.equal(getMobileAppTitle('/m/shipping/history'), 'Shipped history');
  assert.equal(getMobileAppTitle('/m/shipping/stage/42'), 'Stage at rack');
  assert.equal(getMobileAppTitle('/m/shipping/scan-out'), 'Carrier scan-out');
  assert.equal(getMobileAppTitle('/m/exceptions'), 'Exceptions');
  assert.equal(getMobileAppTitle('/m/exceptions/42'), 'Exceptions');
  assert.equal(getMobileAppTitle('/m/search'), 'Find');
  assert.equal(getMobileAppTitle('/m/pick'), 'Picks');
  assert.equal(getMobileAppTitle('/m/pack'), 'Packing');
  assert.equal(getMobileAppTitle('/m/print'), 'Print');
  assert.equal(getMobileAppTitle('/m/scan'), 'Scan');
  assert.equal(getMobileAppTitle('/m/id/scan-out/42'), 'Scan out');
  assert.equal(getMobileAppTitle('/m/id/pick/42'), 'Picks');
  assert.notEqual(getMobileAppTitle('/m/checklist'), 'Checklists');
  assert.equal(getMobileAppTitle('/m/triage'), 'Scan');
  // Inbound on the phone is the photo feed alone (operator 2026-09-15). The
  // Unbox title went with its route, and `?mode=` no longer renames the feed —
  // the Walk-In / Repair assertions deleted with the surfaces they named.
  assert.equal(getMobileAppTitle('/m/receiving'), 'Photo feed');
  assert.equal(
    getMobileAppTitle('/m/receiving', new URLSearchParams('mode=repair')),
    'Photo feed',
  );
  assert.equal(getMobileAppTitle('/m/orders/new'), 'Add order');
});

test('routeHasMobileContextRow includes receiving', () => {
  assert.equal(routeHasMobileContextRow('receiving'), true);
  assert.equal(routeHasMobileContextRow('dashboard'), true);
  assert.equal(routeHasMobileContextRow('tech'), false);
});
