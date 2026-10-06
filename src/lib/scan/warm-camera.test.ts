import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { createCameraKeepalive, type CameraKeepalive } from './warm-camera';

const GRACE = 90_000;

type Lens = { id: string; live: boolean };

let disposed: string[];
let keepalive: CameraKeepalive<Lens>;

beforeEach(() => {
  mock.timers.enable({ apis: ['setTimeout'] });
  disposed = [];
  keepalive = createCameraKeepalive<Lens>({
    dispose: (lens) => disposed.push(lens.id),
    isLive: (lens) => lens.live,
    graceMs: GRACE,
  });
  keepalive.setOwned(true);
});
afterEach(() => mock.timers.reset());

test('a parked lens nobody reattaches goes dark when the grace runs out', () => {
  keepalive.park({ id: 'a', live: true });
  mock.timers.tick(GRACE - 1);
  assert.deepEqual(disposed, []);
  mock.timers.tick(1);
  assert.deepEqual(disposed, ['a']);
  assert.equal(keepalive.take(), null);
});

test('reattaching within the grace cancels the release, and a later park gets a fresh grace', () => {
  const lens = { id: 'a', live: true };
  keepalive.park(lens);
  mock.timers.tick(GRACE - 10);
  assert.equal(keepalive.take(), lens);
  keepalive.park(lens);
  // The first park's timer would have fired here; the re-park owns the clock now.
  mock.timers.tick(10);
  assert.deepEqual(disposed, []);
  mock.timers.tick(GRACE - 10);
  assert.deepEqual(disposed, ['a']);
});

test('the page going hidden releases the parked lens and refuses to park until visible', () => {
  keepalive.park({ id: 'a', live: true });
  keepalive.setHidden(true);
  assert.deepEqual(disposed, ['a']);
  keepalive.park({ id: 'b', live: true });
  assert.deepEqual(disposed, ['a', 'b']);
  keepalive.setHidden(false);
  const c = { id: 'c', live: true };
  keepalive.park(c);
  assert.equal(keepalive.take(), c);
});

test('leaving the owner releases, and nothing parks without an owner', () => {
  keepalive.park({ id: 'a', live: true });
  keepalive.setOwned(false);
  assert.deepEqual(disposed, ['a']);
  keepalive.park({ id: 'b', live: true });
  assert.deepEqual(disposed, ['a', 'b']);
  assert.equal(keepalive.holding(), false);
});

test('a lens that died while parked is disposed on take, not handed back', () => {
  const lens = { id: 'a', live: true };
  keepalive.park(lens);
  lens.live = false;
  assert.equal(keepalive.take(), null);
  assert.deepEqual(disposed, ['a']);
});

test('parking a second lens disposes the first; a targeted release spares a lens that is not parked', () => {
  const a = { id: 'a', live: true };
  const b = { id: 'b', live: true };
  keepalive.park(a);
  keepalive.park(b);
  assert.deepEqual(disposed, ['a']);
  keepalive.release(a);
  assert.equal(keepalive.holding(), true);
  keepalive.release(b);
  assert.deepEqual(disposed, ['a', 'b']);
});
