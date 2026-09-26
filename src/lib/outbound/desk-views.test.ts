import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESK_VIEW_ORDER,
  deskViewHref,
  isOutboundDeskPath,
  resolveDeskView,
} from '@/lib/outbound/desk-views';

const at = (href: string) => {
  const url = new URL(href, 'http://x');
  return resolveDeskView(url.pathname, url.searchParams);
};

test('every view href resolves back to that view (cold load paints the selection)', () => {
  for (const id of DESK_VIEW_ORDER) {
    assert.equal(at(deskViewHref(id)), id, `${deskViewHref(id)} must light ${id}`);
  }
});

test('pick list and action list share a path and split on queue=pick', () => {
  assert.equal(at('/shipping/orders'), 'triage');
  assert.equal(at('/shipping/orders?queue=pick'), 'pick');
  assert.equal(at('/shipping/orders?queue=other&stage=packed'), 'triage');
  // Operator filters ride along without moving the selection.
  assert.equal(at('/shipping/orders?queue=pick&staff=4&open=12'), 'pick');
});

test('bare shortage lights PO paired while the page redirects it', () => {
  assert.equal(at('/shipping/shortage'), 'po');
  assert.equal(at('/shipping/shortage?pair=po&aging=overdue'), 'po');
});

test('switching views drops the previous view\'s filters and record', () => {
  assert.equal(deskViewHref('triage'), '/shipping/orders');
  assert.equal(deskViewHref('pick'), '/shipping/orders?queue=pick');
  assert.equal(deskViewHref('po'), '/shipping/shortage?pair=po');
});

test('only the four desk paths mount the desk sidebar', () => {
  for (const path of ['/shipping/exceptions', '/shipping/shortage', '/shipping/orders', '/shipping/shipped']) {
    assert.equal(isOutboundDeskPath(path), true, path);
  }
  for (const path of ['/shipping/fba', '/shipping/labels', '/shipping/scan-out', '/shipping/label-intake', '/shipping', null]) {
    assert.equal(isOutboundDeskPath(path), false, String(path));
  }
  assert.equal(at('/shipping/fba'), null);
});
