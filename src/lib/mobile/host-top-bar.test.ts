/** The scan seat must exist EXACTLY ONCE on every `/m` screen, and since 2026-09-15 both halves of that promise read one predicate: */
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
  // `/m/exceptions/` excludes the exception RECORD while `/m/exceptions` itself, the queue, still gets the host header.
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
});

test('no pathname is not an own-bar route', () => {
  // First render before the router settles: falling through to `true` would
  // paint a seat under the host header's for one frame.
  assert.equal(mobileRouteOwnsTopBar(null), false);
  assert.equal(mobileRouteOwnsTopBar(''), false);
});
