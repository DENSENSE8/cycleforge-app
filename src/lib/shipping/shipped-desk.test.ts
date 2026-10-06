import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { routeParamsFor } from '@/lib/routing/registry';
import { parseRouteParams } from '@/lib/routing/route-params';
import {
  SHIPPING_SHIPPED_PATH,
  buildShippedDeskSearch,
  fulfilledShipmentHref,
  isLegacyShippedDeskUrl,
  shippingShippedHref,
} from './shipped-desk';

const params = (qs = '') => new URLSearchParams(qs);

describe('shipped-desk', () => {
  it('claims the legacy history doors', () => {
    assert.equal(isLegacyShippedDeskUrl('/shipping/orders', params('shipped=')), true);
    assert.equal(isLegacyShippedDeskUrl('/dashboard', params('shipped=')), true);
    assert.equal(isLegacyShippedDeskUrl('/dashboard/', params('shipped=')), true);
  });

  it('leaves the open queue alone', () => {
    // No `?shipped` presence flag = the To-ship desk doing its own job.
    assert.equal(isLegacyShippedDeskUrl('/shipping/orders', params('late=1')), false);
    assert.equal(isLegacyShippedDeskUrl('/shipping/fba', params('shipped=')), false);
    assert.equal(isLegacyShippedDeskUrl('/shipping/scan-out', params('shipped=')), false);
  });

  it('never steals the Support alias', () => {
    // `?context=support` is a ticket surface that happens to sit on the orders
    // desk; sending it to history would answer a question nobody asked.
    assert.equal(
      isLegacyShippedDeskUrl('/shipping/orders', params('shipped=&context=support')),
      false,
    );
  });

  it('renames the shipped vocabulary into Fulfilled and drops the rest', () => {
    const carried = buildShippedDeskSearch(
      params(
        'shipped=&carrier=UPS&shippedWeekOffset=2&dateFrom=2026-08-01&dateTo=2026-08-07'
          + '&search=1Z999&packedBy=3&stage=packed&cage=1&ustatus=BLOCKED&openOrderId=42',
      ),
    );
    assert.equal(carried.get('carrier'), 'UPS');
    assert.equal(carried.get('from'), '2026-08-01');
    assert.equal(carried.get('to'), '2026-08-07');
    assert.equal(carried.get('q'), '1Z999');
    assert.equal(carried.get('packer'), '3');
    // The presence flag dies with the surface that read it; the old ledger's week pager too.
    for (const key of ['shipped', 'shippedWeekOffset', 'stage', 'cage', 'ustatus', 'openOrderId']) {
      assert.equal(carried.has(key), false, `${key} must not ride to Fulfilled`);
    }
  });

  it('lands every carried key inside the destination spec', () => {
    // The redirect and the boundary parse must agree: a key that survives the
    // hop only to be stripped on arrival is a bookmark that silently loses its
    // filters one tick after it opens.
    const spec = routeParamsFor(SHIPPING_SHIPPED_PATH);
    assert.ok(spec, 'the shipped desk declares a route-params spec');
    const carried = buildShippedDeskSearch(
      params(
        'shipped=&carrier=UPS&statusCategory=IN_TRANSIT&exceptions=1&shippedFilter=orders'
          + '&shippedWeekOffset=2&dateFrom=2026-08-01&dateTo=2026-08-07&search=1Z999'
          + '&packedBy=3',
      ),
    );
    const parsed = parseRouteParams(spec!, new URLSearchParams(carried.toString()));
    // Compare as a SET: the boundary parse re-emits in spec-declaration order,
    // and key order is not part of the contract — surviving the parse is.
    assert.deepEqual(
      [...parsed.entries()].sort(),
      [...carried.entries()].sort(),
    );
  });

  it('builds canonical hrefs', () => {
    assert.equal(shippingShippedHref(), SHIPPING_SHIPPED_PATH);
    assert.equal(shippingShippedHref({ find: '1Z999' }), '/fulfilled?q=1Z999');
    assert.equal(
      shippingShippedHref({ from: '2026-08-30', to: '2026-08-30' }),
      '/fulfilled?from=2026-08-30&to=2026-08-30',
    );
    assert.equal(fulfilledShipmentHref(42), '/fulfilled?shipment=42');
  });
});
