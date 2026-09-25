import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mobileJobReturn, nextNavTrail, withJobReturn } from './nav-trail';

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

test('a record opened from a job only returns to a phone path', () => {
  assert.equal(mobileJobReturn('/m/pick?tab=mine'), '/m/pick?tab=mine');
  assert.equal(mobileJobReturn('  /m/exceptions  '), '/m/exceptions');
  for (const bad of ['https://evil.example/m/', '//evil.example/m/x', '/dashboard', '/m\\..\\x', '', null, undefined]) {
    assert.equal(mobileJobReturn(bad), null, String(bad));
  }
  assert.equal(withJobReturn('/m/orders/7', '/m/pick?tab=mine'), '/m/orders/7?back=%2Fm%2Fpick%3Ftab%3Dmine');
  assert.equal(withJobReturn('/m/orders/7?x=1', '/m/pick'), '/m/orders/7?x=1&back=%2Fm%2Fpick');
});
