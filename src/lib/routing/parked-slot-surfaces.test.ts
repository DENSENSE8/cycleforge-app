import assert from 'node:assert/strict';
import test from 'node:test';

import { parkedSlotSurfaceDestination } from './parked-slot-surfaces';

function destination(url: string): string | null {
  const parsed = new URL(url, 'http://cycleforge.test');
  return parkedSlotSurfaceDestination(parsed.pathname, parsed.searchParams);
}

test('parks retired inventory grid routes on the retained locations surface', () => {
  const parkedPaths = [
    '/inventory',
    '/inventory/activity',
    '/inventory/alerts',
    '/inventory/bins',
    '/inventory/bulk-allocate',
    '/inventory/counts',
    '/inventory/cycle-counts',
    '/inventory/cycle-counts/42',
    '/inventory/events',
    '/inventory/health',
    '/inventory/health/sku/ABC-123',
    '/inventory/holds',
    '/inventory/pulse',
    '/inventory/returns',
    '/inventory/skus',
    '/inventory/units',
    '/admin/inventory',
  ];

  for (const pathname of parkedPaths) {
    assert.equal(destination(pathname), '/inventory/locations', pathname);
  }
  assert.equal(destination('/inventory/units?unit=72'), '/serial/72');
  assert.equal(destination('/inventory?sku=ABC-123'), null);
  assert.equal(destination('/inventory?bin=A0101101'), null);
  assert.equal(destination('/inventory?unit=72'), '/serial/72');
  assert.equal(destination('/inventory?section=replenish'), null);

  assert.equal(destination('/inventory/locations?tab=bins&q=A01'), '/inventory/locations');
  assert.equal(destination('/inventory/locations?tab=map'), null);
  assert.equal(destination('/inventory/locations'), null);
  assert.equal(destination('/inventory/stock'), null);
});

test('keeps only the retained report views mounted', () => {
  assert.equal(destination('/reports'), '/reports?tab=packer');
  assert.equal(destination('/reports?tab=staff&staffId=17'), '/reports?tab=packer&staffId=17');
  assert.equal(destination('/reports?tab=velocity&q=charger'), '/reports?tab=packer&q=charger');
  assert.equal(destination('/reports?tab=packer'), null);
  assert.equal(destination('/reports?tab=activity'), null);
});

test('parks review, search, settings, and sales table routes', () => {
  assert.equal(destination('/review'), '/operations');
  assert.equal(destination('/review?mode=packing'), '/operations');
  assert.equal(destination('/review?mode=pairing'), '/products');
  assert.equal(destination('/review?mode=catalog-link'), '/products');
  assert.equal(destination('/review/42'), '/operations');
  assert.equal(destination('/search?q=bose'), '/');
  assert.equal(destination('/search?sel=order:41'), '/shipping/orders?openOrderId=41');
  assert.equal(
    destination('/search?sel=order:111-6350504-7603458'),
    '/shipping/orders?openOrderId=111-6350504-7603458',
  );
  assert.equal(destination('/search?sel=unit:42'), '/serial/42');
  assert.equal(destination('/search?sel=receiving:43'), '/unbox?openReceivingId=43');
  assert.equal(destination('/search?sel=repair:44'), '/repair?openRepair=44');
  assert.equal(destination('/search?sel=sku:45'), '/products');
  assert.equal(destination('/search?sel=fba:46'), '/shipping/fba');
  // The pasted list is Search's one live page — never parked.
  assert.equal(destination('/search/list?refs=A-1,B-2&locator=inbound'), null);
  assert.equal(destination('/settings/staff'), '/settings');
  assert.equal(destination('/settings/staff/7'), '/settings');
  assert.equal(destination('/settings/sessions'), '/settings');
  assert.equal(destination('/settings/devices'), '/settings');
  assert.equal(destination('/settings/audit'), '/settings');
  assert.equal(destination('/audit-log'), '/settings');
  assert.equal(destination('/dashboard?mode=sales'), '/counter');
  assert.equal(destination('/walk-in'), '/counter');

  assert.equal(destination('/settings/profile'), null);
  assert.equal(destination('/dashboard?mode=pickup'), null);
  assert.equal(destination('/walk-in?mode=repair'), null);
});

test('removes the parked sourcing mode', () => {
  assert.equal(destination('/sourcing?mode=compatibility&q=iphone'), '/sourcing?q=iphone');
  assert.equal(destination('/sourcing'), null);
  assert.equal(destination('/'), null);
});

test('deleted RMA desk and phone pack queue land on the jobs that replace them', () => {
  assert.equal(destination('/warehouse/rma'), '/unbox');
  assert.equal(destination('/warehouse/rma/disposition'), '/unbox');
  assert.equal(destination('/m/pack'), '/m/pick');
  // The pack JOB stays: pick hands off to it.
  assert.equal(destination('/m/pack/start/7'), null);
  assert.equal(destination('/warehouse/replenishment'), null);
});
