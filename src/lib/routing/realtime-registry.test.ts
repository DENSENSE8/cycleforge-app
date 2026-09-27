/**
 * The route → live-domain registry: prefixes match whole segments, routes
 * without a live layer resolve to nothing, and desktop order desks replay
 * after a dropped socket.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { realtimeFlagsFor, realtimeRouteFor } from './realtime-registry';

const OFF = { dashboard: false, receiving: false, repair: false, walkIn: false, reconnect: false };

test('a prefix owns its children but never a sibling that shares its letters', () => {
  assert.deepEqual(realtimeRouteFor('/m/rs/42/work')?.domains, ['repair']);
  assert.deepEqual(realtimeRouteFor('/m/r/42/photos')?.domains, ['receiving']);
  assert.equal(realtimeRouteFor('/m/repair-scan'), null);
  assert.deepEqual(realtimeRouteFor('/packer')?.domains, ['dashboard']);
  assert.equal(realtimeRouteFor('/shippingx'), null);
});

test('surfaces without a live layer mount nothing', () => {
  for (const route of ['/kiosk', '/kiosk/v2', '/signin', '/m/signin', '/settings/me', '/', null, undefined]) {
    assert.deepEqual(realtimeFlagsFor(route), OFF, String(route));
  }
});

test('the order desks replay after a reconnect; other domains do not ask for it', () => {
  assert.deepEqual(realtimeFlagsFor('/shipping/orders'), { ...OFF, dashboard: true, reconnect: true });
  assert.deepEqual(realtimeFlagsFor('/m/work'), { ...OFF, dashboard: true, reconnect: true });
  assert.deepEqual(realtimeFlagsFor('/receiving/history'), { ...OFF, receiving: true });
  assert.deepEqual(realtimeFlagsFor('/dashboard'), { ...OFF, repair: true, walkIn: true });
});
