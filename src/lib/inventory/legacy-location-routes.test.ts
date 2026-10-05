import assert from 'node:assert/strict';
import test from 'node:test';
import { legacyManageLocationTarget, warehouseRedirectTarget } from './legacy-location-routes';

test('legacy Warehouse redirects preserve tab, create/edit state and record code', () => {
  assert.equal(
    warehouseRedirectTarget({ tab: 'rooms', new: 'true', edit: '1', code: 'B-01' }),
    '/inventory/locations?tab=rooms&new=true&edit=1&code=B-01',
  );
  assert.equal(warehouseRedirectTarget({}), '/inventory/locations');
});

test('retired Manage links open the named location record', () => {
  assert.equal(legacyManageLocationTarget(' C 01/02 '), '/bin/C%2001%2F02');
  assert.equal(legacyManageLocationTarget(), '/inventory/locations');
});
