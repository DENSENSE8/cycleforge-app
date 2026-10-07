import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerShipment, registerShipmentPermissive } from './sync-shipment';

// A rounded `9.43e+21` never becomes a package: both doors refuse it before any write.
test('a tracking number in scientific notation is never registered as a package', async () => {
  assert.equal(await registerShipmentPermissive({ trackingNumber: '9.434608106244568e+21', sourceSystem: 'zoho_po' }), null);
  await assert.rejects(
    () => registerShipment({ trackingNumber: '9.434608106244568E+21', sourceSystem: 'scan' }),
    /scientific notation/,
  );
});
