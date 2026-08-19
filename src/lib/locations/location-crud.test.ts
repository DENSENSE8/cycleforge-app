import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCreateLocationBody,
  buildUpdateLocationBody,
  EMPTY_LOCATION_FORM,
  filterLocations,
  locationPrintSegments,
  locationRowFace,
  locationRowSubtitle,
  locationRowToForm,
  validateLocationForm,
  type LocationFormValues,
  type LocationRow,
} from './location-crud';

function row(partial: Partial<LocationRow> & { id: number }): LocationRow {
  return {
    name: 'Bin A',
    display_name: null,
    room: 'Warehouse',
    barcode: 'A0101101',
    bin_type: null,
    capacity: null,
    ...partial,
  };
}

function form(partial: Partial<LocationFormValues> = {}): LocationFormValues {
  return { ...EMPTY_LOCATION_FORM, name: 'Bin A', ...partial };
}

test('face prefers the operator nickname over the bin code', () => {
  assert.equal(locationRowFace(row({ id: 1, display_name: 'Repair bench' })), 'Repair bench');
  assert.equal(locationRowFace(row({ id: 1 })), 'A0101101');
});

test('face falls back to a stable label when the row has no usable text', () => {
  assert.equal(
    locationRowFace({ id: 42, name: null, room: null, barcode: null }),
    'Location 42',
  );
});

test('subtitle never repeats the face', () => {
  const nicknamed = row({ id: 1, display_name: 'Repair bench' });
  assert.equal(locationRowSubtitle(nicknamed), 'Warehouse · A0101101');
  // Face IS the barcode here, so the barcode must not repeat in the subtitle.
  assert.equal(locationRowSubtitle(row({ id: 1 })), 'Warehouse · Bin A');
});

test('validate requires a name and rejects a bad capacity', () => {
  assert.deepEqual(validateLocationForm(form({ name: '  ' })), {
    field: 'name',
    message: 'Name is required',
  });
  assert.equal(validateLocationForm(form({ capacity: '12' })), null);
  assert.equal(validateLocationForm(form({ capacity: '' })), null);
  assert.equal(validateLocationForm(form({ capacity: '-1' }))?.field, 'capacity');
  assert.equal(validateLocationForm(form({ capacity: '1.5' }))?.field, 'capacity');
});

test('create body trims and nulls blank optionals', () => {
  assert.deepEqual(
    buildCreateLocationBody(form({ name: '  Bin A ', room: ' Warehouse ', capacity: '' })),
    { name: 'Bin A', room: 'Warehouse', barcode: null, binType: null, capacity: null },
  );
});

test('update body carries only changed fields, and null when nothing changed', () => {
  const original = form({ name: 'Bin A', barcode: 'A0101101' });
  assert.equal(buildUpdateLocationBody(original, { ...original }), null);
  assert.deepEqual(buildUpdateLocationBody(original, { ...original, name: 'Bin B' }), {
    name: 'Bin B',
  });
});

test('update body clears nullable fields with null, never an empty string', () => {
  const original = form({ displayName: 'Repair bench', barcode: 'A0101101', binType: 'shelf' });
  const cleared = { ...original, displayName: '', barcode: '', binType: '' };
  assert.deepEqual(buildUpdateLocationBody(original, cleared), {
    displayName: null,
    barcode: null,
    binType: null,
  });
});

test('update body sends capacity null when the field is emptied', () => {
  const original = form({ capacity: '10' });
  assert.deepEqual(buildUpdateLocationBody(original, { ...original, capacity: '' }), {
    capacity: null,
  });
});

test('roundtrip: a row converted to a form produces no update body', () => {
  const r = row({ id: 1, display_name: 'Bench', bin_type: 'shelf', capacity: 4 });
  const f = locationRowToForm(r);
  assert.equal(buildUpdateLocationBody(f, { ...f }), null);
});

test('print segments parse a rack address and refuse a free-form code', () => {
  assert.deepEqual(locationPrintSegments(row({ id: 1, barcode: 'A0101101' })), {
    zone: 'A',
    aisle: 1,
    bay: 1,
    level: 1,
    position: 1,
  });
  assert.equal(locationPrintSegments(row({ id: 1, barcode: 'RECEIVING-1' })), null);
  assert.equal(locationPrintSegments(row({ id: 1, barcode: null })), null);
});

test('filter matches nickname, room and bin code, case-insensitively', () => {
  const rows = [
    row({ id: 1, display_name: 'Repair bench', barcode: 'A0101101' }),
    row({ id: 2, room: 'Annex', barcode: 'B0202202', name: 'Bin B' }),
  ];
  assert.deepEqual(filterLocations(rows, 'repair').map((r) => r.id), [1]);
  assert.deepEqual(filterLocations(rows, 'annex').map((r) => r.id), [2]);
  assert.deepEqual(filterLocations(rows, 'b02022').map((r) => r.id), [2]);
  assert.deepEqual(filterLocations(rows, '').map((r) => r.id), [1, 2]);
});
