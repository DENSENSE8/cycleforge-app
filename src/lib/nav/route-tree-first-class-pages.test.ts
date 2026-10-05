import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMER_PATHS,
  QUALITY_CONTROL_PATHS,
  customerMobilePath,
  qualityControlLineMobilePath,
  qualityControlLpnMobilePath,
  routeForFile,
  routeForPath,
} from '@/lib/nav/route-tree';

test('Customers is registered as a first-class desktop and mobile destination', () => {
  assert.equal(CUSTOMER_PATHS.desktop, '/customers');
  assert.equal(CUSTOMER_PATHS.mobile, '/m/customers');
  assert.equal(customerMobilePath(42), '/m/customers/42');
  assert.equal(routeForPath('/customers')?.id, 'customers');
  assert.equal(routeForPath('/m/customers/42')?.id, 'customer-mobile');
  assert.equal(routeForFile('src/app/customers/page.tsx')?.id, 'customers');
});

test('Quality control is registered as a first-class desktop and mobile station', () => {
  assert.equal(QUALITY_CONTROL_PATHS.desktop, '/test');
  assert.equal(QUALITY_CONTROL_PATHS.mobile, '/m/qc');
  assert.equal(qualityControlLineMobilePath(7), '/m/qc/line/7');
  assert.equal(qualityControlLpnMobilePath('R-100'), '/m/qc/lpn/R-100');
  assert.equal(routeForPath('/test')?.id, 'quality-control');
  assert.equal(routeForPath('/m/qc')?.id, 'quality-control-mobile');
  assert.equal(routeForFile('src/app/test/page.tsx')?.id, 'quality-control');
});
