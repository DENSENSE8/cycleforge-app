import test from 'node:test';
import assert from 'node:assert/strict';
import { extractStaffTenantSlug } from './staff-host';

test('configured lane apex is not mistaken for a tenant', () => {
  const options = { laneHost: 'prod.michaelgarisek.com' };
  assert.equal(extractStaffTenantSlug('prod.michaelgarisek.com', options), null);
  assert.equal(extractStaffTenantSlug('prod.michaelgarisek.com:3050', options), null);
  assert.equal(extractStaffTenantSlug('usav.prod.michaelgarisek.com', options), 'usav');
});

test('production staff apex and tenant hosts retain their intended identities', () => {
  assert.equal(extractStaffTenantSlug('app.cycleforge.ai'), null);
  assert.equal(extractStaffTenantSlug('usav.app.cycleforge.ai'), 'usav');
  assert.equal(extractStaffTenantSlug('USAV.app.cycleforge.ai:443'), 'usav');
});

test('localhost, preview and tunnel hosts do not invent tenant slugs', () => {
  assert.equal(extractStaffTenantSlug('localhost:3050'), null);
  assert.equal(extractStaffTenantSlug('127.0.0.1:3050'), null);
  assert.equal(extractStaffTenantSlug('cycleforge-git-thing.vercel.app'), null);
  assert.equal(extractStaffTenantSlug('random.trycloudflare.com'), null);
  assert.equal(extractStaffTenantSlug('usav-dev.michaelgarisek.com'), null);
});
