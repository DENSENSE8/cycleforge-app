import assert from 'node:assert/strict';
import test from 'node:test';
import { receivingDetailLine, receivingRecordIdentity, receivingRecordSerials, receivingSerialCountWarning } from './record-identity';
import type { ReceivingLineRow } from './receiving-line-row';

const row = (fields: Partial<ReceivingLineRow>) => fields as ReceivingLineRow;

test('item identity comes from the line listing before the carton listing', () => {
  const actual = receivingRecordIdentity(row({ listing_url: 'https://www.ebay.com/itm/Bose/407240268198', receiving_listing_url: 'https://shopgoodwill.com/item/276843321' }));
  assert.equal(actual.itemNumber, '407240268198');
  assert.equal(receivingRecordIdentity(row({ receiving_listing_url: 'https://shopgoodwill.com/item/276843321' })).itemNumber, '276843321');
});

test('missing, unsafe, or slug-only listing never invents a marketplace item number', () => {
  for (const listing_url of [null, 'javascript:alert(1)', 'https://example.com/a-product']) {
    assert.equal(receivingRecordIdentity(row({ listing_url, zoho_purchaseorder_number: '65411253', sku: 'BOSE-418' })).itemNumber, null);
  }
});

test('platform account face keeps catalog account identity; order number is independent', () => {
  const identity = receivingRecordIdentity(row({ platform_account_label: 'eBay purchasing', source_platform: 'ebay', zoho_purchaseorder_number: '12-15207-56171' }));
  assert.equal(identity.accountSource, 'eBay purchasing');
  assert.equal(identity.orderNumber, '12-15207-56171');
});

test('multiple note listings do not assign the first item number to every line', () => {
  const identity = receivingRecordIdentity(row({
    zoho_purchaseorder_id: 'PO-1',
    receiving_zoho_notes: 'First: https://www.ebay.com/itm/407240268198\nSecond: https://www.ebay.com/itm/407240268199',
  }));
  assert.equal(identity.itemNumber, null);
  assert.equal(identity.listingHref, null);
});

test('serial evidence is full length, deduplicated, and scoped to the given line', () => {
  const input = row({ serials: [{ id: 1, serial_number: '012345678901234567' }], units: [{ serial: '012345678901234567' }, { serial: '0000000022222222' }, { serial: null }] as ReceivingLineRow['units'] });
  assert.deepEqual(receivingRecordSerials(input), ['012345678901234567', '0000000022222222']);
  assert.deepEqual(receivingRecordSerials(row({ item_name: 'Return serial stale' })), []);
});

test('missing selected line never shows a sibling line serial or receipt', () => {
  const sibling = row({ id: 1, workflow_status: 'DONE' });
  assert.equal(receivingDetailLine([sibling], 2), null);
  assert.equal(receivingDetailLine([sibling], 1), sibling);
  assert.equal(receivingDetailLine([], null), null);
});

test('serial count flags surplus units without treating a normal pending receipt as a discrepancy', () => {
  const serials = [{ id: 1, serial_number: 'one' }, { id: 2, serial_number: 'two' }];
  assert.equal(receivingSerialCountWarning(row({ serials: serials.slice(0, 1), quantity_expected: 1, quantity_received: 0 })), null);
  assert.ok(receivingSerialCountWarning(row({ serials, quantity_expected: 1, quantity_received: 1 }))?.includes('2 serials'));
  assert.ok(receivingSerialCountWarning(row({ serials, quantity_expected: null, quantity_received: 1, received_done_at: '2026-09-25' }))?.includes('receipt completion'));
});
