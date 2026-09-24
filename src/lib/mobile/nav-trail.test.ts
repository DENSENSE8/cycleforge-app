import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextNavTrail } from './nav-trail';

test('a new screen is pushed; landing on the same path again is not', () => {
  assert.deepEqual(nextNavTrail(['/m/scan'], '/m/rs/7'), ['/m/scan', '/m/rs/7']);
  assert.deepEqual(nextNavTrail(['/m/scan', '/m/rs/7'], '/m/rs/7'), ['/m/scan', '/m/rs/7']);
});

test('landing on the entry two back is a Back: the trail pops, so the hub again follows the scan', () => {
  const inDetails = ['/m/scan', '/m/rs/7', '/m/rs/7/info'];
  const backOnHub = nextNavTrail(inDetails, '/m/rs/7');
  assert.deepEqual(backOnHub, ['/m/scan', '/m/rs/7']);
  // The hub's own Back now reads the scan, not the details screen it left.
  assert.equal(backOnHub[backOnHub.length - 2], '/m/scan');
});
