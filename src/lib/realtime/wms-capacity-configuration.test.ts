import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildUpdateLocationBody,
  locationRowToForm,
  validateLocationForm,
} from '@/lib/locations/location-crud';

function source(file: string): string {
  return readFileSync(path.resolve(process.cwd(), file), 'utf8');
}

test('operator location editors expose capacity and the tenant route persists it', () => {
  const portable = source('src/components/locations/LocationCrudDialog.tsx');
  const route = source('src/app/api/locations/[barcode]/properties/route.ts');

  assert.match(portable, /label="Capacity"/);
  assert.match(route, /updateLocation\([^]*parsed\.capacity/);
  assert.match(route, /requireRoutePerm\(req, 'sku_stock\.manage'\)/);
});

test('capacity edits preserve zero/null semantics and reject fractional limits', () => {
  const original = locationRowToForm({
    id: 4,
    name: 'B02',
    room: 'Warehouse',
    barcode: 'B02',
    capacity: 5,
  });
  assert.deepEqual(buildUpdateLocationBody(original, { ...original, capacity: '12' }), {
    capacity: 12,
  });
  assert.equal(validateLocationForm({ ...original, capacity: '1.5' })?.field, 'capacity');
  assert.deepEqual(buildUpdateLocationBody(original, { ...original, capacity: '' }), {
    capacity: null,
  });
});
