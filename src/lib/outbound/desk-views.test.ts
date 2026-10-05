import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESK_LANDING_VIEW,
  DESK_VIEWS,
  DESK_VIEW_ORDER,
  deskViewHref,
  isOutboundDeskPath,
  resolveDeskView,
} from '@/lib/outbound/desk-views';

const at = (href: string) => resolveDeskView(new URL(href, 'http://x').pathname);

test('every view href resolves back to that view (cold load paints the selection)', () => {
  for (const id of DESK_VIEW_ORDER.filter((view) => view !== 'exceptions')) {
    assert.equal(at(deskViewHref(id)), id, `${deskViewHref(id)} must light ${id}`);
  }
  assert.equal(deskViewHref('exceptions'), '/exceptions?domain=fulfillment&kind=fbm');
  assert.equal(at(deskViewHref('exceptions')), null, 'Exceptions belongs to the global page, never FBM');
});

test('FBM lands on Allocate, painted first — exactly one landing view', () => {
  assert.deepEqual(DESK_VIEWS.filter((view) => view.landing).map((view) => view.id), ['triage']);
  assert.equal(DESK_LANDING_VIEW.label, 'Allocate');
  assert.equal(DESK_VIEW_ORDER[0], DESK_LANDING_VIEW.id);
  assert.equal(deskViewHref(DESK_LANDING_VIEW.id), '/shipping/orders');
});

test('each view owns its path and its nav child, so resolving a location is unambiguous', () => {
  assert.equal(new Set(DESK_VIEWS.map((view) => view.pathname)).size, DESK_VIEWS.length);
  assert.equal(new Set(DESK_VIEWS.map((view) => view.navChild)).size, DESK_VIEWS.length);
});

test('operator params ride along without moving the selection', () => {
  assert.equal(at('/shipping/orders?stage=packed&staff=4&open=12'), 'triage');
  assert.equal(at('/fulfilled?carrier=UPS'), 'shipped');
});

test('the parked Shortage desk is on no FBM view', () => {
  assert.equal(at('/shipping/shortage'), null);
  assert.equal(at('/shipping/shortage?pair=po'), null);
});

test('switching views drops the previous view\'s filters and record', () => {
  assert.equal(deskViewHref('triage'), '/shipping/orders');
  assert.equal(deskViewHref('shipped'), '/fulfilled?shippedFilter=all');
});

test('legacy exceptions and shortage URLs still mount long enough to redirect', () => {
  for (const path of ['/shipping/exceptions', '/shipping/shortage', '/shipping/orders', '/fulfilled']) {
    assert.equal(isOutboundDeskPath(path), true, path);
  }
  for (const path of ['/shipping/fba', '/shipping/labels', '/shipping/scan-out', '/shipping/label-intake', '/shipping', null]) {
    assert.equal(isOutboundDeskPath(path), false, String(path));
  }
  assert.equal(at('/shipping/fba'), null);
});
