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
  for (const path of ['/m/u/1', '/m/rs/RS-204', '/m/t/88', '/m/pick/9001', '/m/receiving/po/55', '/m/exceptions/42']) {
    assert.equal(mobileRouteOwnsTopBar(path), true, path);
  }
});

test('/m/pick is the pick session itself — its progress band is the only chrome', () => {
  // The bare route stopped being a queue (operator 2026-09-25): a host header
  // above the directed screen would stack a second bar over its progress band.
  assert.equal(mobileRouteOwnsTopBar('/m/pick'), true);
});

test('a queue route keeps the host header — the trailing slash is the whole rule', () => {
  // `/m/exceptions/` excludes the exception RECORD while `/m/exceptions`
  // itself, the queue, still gets the host header. Drop the slash and the
  // queue loses its header (and its only scan door, because a queue has no
  // record bar).
  assert.equal(mobileRouteOwnsTopBar('/m/work'), false);
  assert.equal(mobileRouteOwnsTopBar('/m/exceptions'), false);
  assert.equal(mobileRouteOwnsTopBar('/m/scan'), false);
});

test('pairing owns its back bar — two headers: back, then search', () => {
  // Operator 2026-09-25 reversed the 2026-09-15 ruling: the back bar replaces
  // the host header, so the screen stacks back bar + search, not host + back +
  // search. The seat moves into the pair bar and still exists exactly once.
  assert.equal(mobileRouteOwnsTopBar('/m/pair/A0101101'), true);
  assert.equal(mobileRouteOwnsTopBar('/m/pair/A0101101/00157'), true);
  assert.equal(mobileRouteOwnsTopBar('/m/on-hold'), false);
  // …and an on-hold RECORD and its doors own the bar (one header, one seat).
  assert.equal(mobileRouteOwnsTopBar('/m/on-hold/TMP-X/locations'), true);
});

test('no pathname is not an own-bar route', () => {
  // First render before the router settles: falling through to `true` would
  // paint a seat under the host header's for one frame.
  assert.equal(mobileRouteOwnsTopBar(null), false);
  assert.equal(mobileRouteOwnsTopBar(''), false);
});
