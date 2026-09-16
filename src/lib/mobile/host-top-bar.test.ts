/**
 * The scan seat must exist EXACTLY ONCE on every `/m` screen, and since
 * 2026-09-15 both halves of that promise read one predicate: the shell paints
 * its header when {@link mobileRouteOwnsTopBar} is false, and
 * `MobileDetailTopBar` paints the seat when it is true. So the cases that
 * matter are the ones where a wrong answer means a duplicate door (host header
 * kept AND a seat in the record bar) or none at all (header withheld AND no
 * seat).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mobileRouteOwnsTopBar } from './host-top-bar';

test('a detail route owns its bar, and with it the scan seat', () => {
  for (const path of ['/m/u/1', '/m/rs/RS-204', '/m/t/88', '/m/pick/9001', '/m/receiving/po/55']) {
    assert.equal(mobileRouteOwnsTopBar(path), true, path);
  }
});

test('a queue route keeps the host header — the trailing slash is the whole rule', () => {
  // `/m/pick/` excludes the pick DETAIL screen while `/m/pick` itself, the
  // queue, still gets the host header. Drop the slash and the queue loses its
  // header (and its only scan door, because a queue has no record bar).
  assert.equal(mobileRouteOwnsTopBar('/m/pick'), false);
  assert.equal(mobileRouteOwnsTopBar('/m/work'), false);
  assert.equal(mobileRouteOwnsTopBar('/m/scan'), false);
});

test('pairing keeps the host header, so its own bar paints no second seat', () => {
  // Operator 2026-09-15: "remove the scan button from the same header with the
  // text pair location." The screen is NOT in the denylist, which is exactly
  // how the record bar knows to withhold the seat.
  assert.equal(mobileRouteOwnsTopBar('/m/pair/A0101101'), false);
  assert.equal(mobileRouteOwnsTopBar('/m/pair/A0101101/00157'), false);
  assert.equal(mobileRouteOwnsTopBar('/m/on-hold'), false);
});

test('no pathname is not an own-bar route', () => {
  // First render before the router settles: falling through to `true` would
  // paint a seat under the host header's for one frame.
  assert.equal(mobileRouteOwnsTopBar(null), false);
  assert.equal(mobileRouteOwnsTopBar(''), false);
});
