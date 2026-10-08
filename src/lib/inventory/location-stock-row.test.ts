import test from 'node:test';
import assert from 'node:assert/strict';
import {
  locationStockInAddress,
  locationStockRoomId,
  locationStockPositionFace,
  locationStockRackFace,
  locationStockRackGroups,
  locationStockWalkRows,
  parseLocationStockAddressScope,
  parseLocationStockRoomIds,
  resolveExplicitStockRoom,
  type LocationStockTableRow,
} from './location-stock-row';

function row(
  locationId: number,
  face: string,
  aisle: number,
  bay: number,
  level: number,
  position: number,
  sku: string,
  qty = 1,
): LocationStockTableRow {
  return {
    location_id: locationId,
    location_name: face,
    location_barcode: face.replaceAll('-', ''),
    room: 'Zone 3 - Parts',
    aisle,
    bay,
    level,
    position,
    sku,
    stock_id: locationId,
    home_location: null,
    product_title: sku,
    image_url: null,
    cover_photo_url: null,
    is_provisional: false,
    source: 'bin',
    qty,
    min_qty: null,
    last_moved: null,
    last_counted: null,
  };
}

test('location walk deduplicates bins and sorts every numeric code part', () => {
  const rows = [
    { ...row(1, 'C-02-01-1-00', 2, 1, 1, 0, '', 0), source: 'empty' as const, stock_id: null },
    row(3, 'C-02-01-10-00', 2, 1, 10, 0, 'THREE'),
    row(1, 'C-02-01-1-00', 2, 1, 1, 0, 'ONE', 2),
    row(2, 'C-02-01-2-00', 2, 1, 2, 0, 'TWO'),
    row(1, 'C-02-01-1-00', 2, 1, 1, 0, 'OTHER', 7),
    { ...row(4, 'RECEIVING', 0, 0, 0, 0, 'NO-CODE'), aisle: null, bay: null, level: null, position: null },
  ];

  const walked = locationStockWalkRows(rows, 'location-asc');
  assert.deepEqual(walked.map((item) => item.location_name), [
    'C-02-01-1-00',
    'C-02-01-2-00',
    'C-02-01-10-00',
    'RECEIVING',
  ]);
  assert.equal(walked[0]?.sku, 'ONE');
  assert.equal(walked[0]?.qty, 2, 'unrelated SKU quantities must not be folded into the record anchor');
  assert.deepEqual(
    locationStockWalkRows(rows, 'location-desc').map((item) => item.location_name),
    ['C-02-01-10-00', 'C-02-01-2-00', 'C-02-01-1-00', 'RECEIVING'],
  );
});

test('desktop rack cards group the rack sentinel and numbered positions without losing products', () => {
  const rows = [
    row(1, 'A-01-01-1-00', 1, 1, 1, 0, 'TMP-RACK', 3),
    row(2, 'A-01-01-1-01', 1, 1, 1, 1, 'TMP-POSITION', 0),
    row(3, 'A-01-01-2-01', 1, 1, 2, 1, 'OTHER', 4),
  ];

  const groups = locationStockRackGroups(rows, 'location-asc');
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0]?.rows.map((item) => item.sku), ['TMP-RACK', 'TMP-POSITION']);
  assert.equal(locationStockRackFace(groups[0]!.rows[0]!), 'A-01-01-1');
  assert.equal(locationStockPositionFace(groups[0]!.rows[1]!), 'A-01-01-1-01');
});

test('rack cards sort by on-hand total, with location order breaking a tie', () => {
  const rows = [
    row(1, 'A-01-01-1-00', 1, 1, 1, 0, 'SMALL', 2),
    row(2, 'A-01-01-2-00', 1, 1, 2, 0, 'BIG', 5),
    row(3, 'A-01-01-2-01', 1, 1, 2, 1, 'BIG-POS', 4),
  ];
  assert.equal(locationStockRackFace(locationStockRackGroups(rows, 'qty-desc')[0]!.rows[0]!), 'A-01-01-2');
  assert.equal(locationStockRackFace(locationStockRackGroups(rows, 'qty-asc')[0]!.rows[0]!), 'A-01-01-1');
});

test('longest since count leads with a rack that has no cycle count', () => {
  const rows = [
    { ...row(2, 'A-01-01-2-00', 1, 1, 2, 0, 'NEW', 1), last_counted: '2026-01-01T00:00:00.000Z' },
    { ...row(1, 'A-01-01-1-00', 1, 1, 1, 0, 'OLD', 9), last_counted: '2020-01-01T00:00:00.000Z' },
    { ...row(3, 'A-01-01-3-00', 1, 1, 3, 0, 'NONE', 1), last_counted: null },
  ];
  assert.deepEqual(
    locationStockRackGroups(rows, 'counted-asc').map((group) => group.rows[0]!.sku),
    ['NONE', 'OLD', 'NEW'],
  );
});

test('comma-bearing room names survive the comma-list room wire', () => {
  const room = 'Zone 4 - Wall Mounts, Claims, RS';
  const id = locationStockRoomId({ room });
  assert.equal(id.includes(','), false);
  assert.deepEqual(parseLocationStockRoomIds(`${id},Zone 3 - Parts`), [room, 'Zone 3 - Parts']);
});

test('the address drill drops a deeper part whose parent is missing, and never reads empty as 0', () => {
  assert.deepEqual(parseLocationStockAddressScope(true, { aisle: '', bay: '2' }), { aisle: null, bay: null, level: null, position: null });
  // An aisle with no room is not an address: aisle numbers repeat per room.
  assert.deepEqual(parseLocationStockAddressScope(false, { aisle: '2', bay: '3' }), { aisle: null, bay: null, level: null, position: null });
  assert.deepEqual(parseLocationStockAddressScope(true, { aisle: '2', bay: '3', level: 'x', position: '4' }), { aisle: 2, bay: 3, level: null, position: null });
  assert.deepEqual(parseLocationStockAddressScope(true, { aisle: '0', bay: '1', level: '2', position: '3' }), { aisle: 0, bay: 1, level: 2, position: 3 });
});

test('a row is in the address only when every picked part matches', () => {
  const at = row(1, 'A-02-03-1-04', 2, 3, 1, 4, 'BIN');
  assert.equal(locationStockInAddress(at, { aisle: 2, bay: 3, level: 1, position: 4 }), true);
  assert.equal(locationStockInAddress(at, { aisle: 2, bay: 3, level: null, position: null }), true);
  assert.equal(locationStockInAddress(at, { aisle: 2, bay: 4, level: null, position: null }), false);
  assert.equal(locationStockInAddress({ ...at, aisle: null, bay: null }, { aisle: 2, bay: null, level: null, position: null }), false);
});

test('bare Stock has no implicit room while explicit room labels canonicalize to ids', () => {
  const rooms = [
    { id: 'Zone%204%2C%20Claims', label: 'Zone 4, Claims', count: 30 },
    { id: 'Zone 3 - Parts', label: 'Zone 3 - Parts', count: 120 },
  ];
  assert.equal(resolveExplicitStockRoom(rooms, undefined), null);
  assert.equal(resolveExplicitStockRoom(rooms, ''), null);
  assert.equal(resolveExplicitStockRoom(rooms, 'Zone 4, Claims'), 'Zone%204%2C%20Claims');
  assert.equal(resolveExplicitStockRoom(rooms, 'Unknown'), null);
});
