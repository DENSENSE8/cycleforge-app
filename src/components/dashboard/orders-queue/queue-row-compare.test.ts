import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { compareQueueColumnRows } from './queue-row-compare';

function row(partial: Partial<ShippedOrder> & { id: number }): ShippedOrder {
  return {
    order_id: '',
    product_title: '',
    quantity: 1,
    condition: 'BRAND_NEW',
    deadline_at: '2026-07-01T12:00:00.000Z',
    created_at: '2026-06-01T12:00:00.000Z',
    account_source: null,
    ...partial,
  } as ShippedOrder;
}

describe('compareQueueColumnRows', () => {
  it('sorts product title A–Z / Z–A', () => {
    const a = row({ id: 1, product_title: 'Alpha Camera' });
    const b = row({ id: 2, product_title: 'Zebra Lens' });
    assert.ok(compareQueueColumnRows(a, b, 'title', 'asc') < 0);
    assert.ok(compareQueueColumnRows(a, b, 'title', 'desc') > 0);
  });

  it('sorts Late by derived days-late — DESC = most overdue first', () => {
    const earlier = row({ id: 1, deadline_at: '2026-07-01T00:00:00.000Z' });
    const later = row({ id: 2, deadline_at: '2026-07-10T00:00:00.000Z' });
    // Earlier commitment ⇒ larger days-late. DESC (column default) leads with it.
    assert.ok(compareQueueColumnRows(earlier, later, 'age', 'desc') < 0);
    assert.ok(compareQueueColumnRows(earlier, later, 'age', 'asc') > 0);
  });

  it('sorts deadline-less rows last (they show em dash, not a days-late face)', () => {
    const dated = row({ id: 1, deadline_at: '2026-07-01T00:00:00.000Z' });
    const missing = row({ id: 2, deadline_at: null, ship_by_date: null });
    assert.ok(compareQueueColumnRows(dated, missing, 'age', 'desc') < 0);
    assert.ok(compareQueueColumnRows(dated, missing, 'age', 'asc') < 0);
  });

  it('sorts qty numerically', () => {
    const one = row({ id: 1, quantity: 1 });
    const ten = row({ id: 2, quantity: 10 });
    assert.ok(compareQueueColumnRows(one, ten, 'qty', 'asc') < 0);
    assert.ok(compareQueueColumnRows(one, ten, 'qty', 'desc') > 0);
  });

  it('puts empty tracking last in both directions', () => {
    const filled = row({
      id: 1,
      tracking_number: '1Z999',
    });
    const empty = row({ id: 2 });
    assert.ok(compareQueueColumnRows(filled, empty, 'tracking', 'asc') < 0);
    assert.ok(compareQueueColumnRows(filled, empty, 'tracking', 'desc') < 0);
  });

  it('tiebreaks on deadline', () => {
    const a = row({ id: 1, product_title: 'Same', deadline_at: '2026-07-01T00:00:00.000Z' });
    const b = row({ id: 2, product_title: 'Same', deadline_at: '2026-07-05T00:00:00.000Z' });
    assert.ok(compareQueueColumnRows(a, b, 'title', 'asc') < 0);
  });

  it('sorts by packer name A–Z; blanks last in both directions', () => {
    const alex = row({ id: 1, packed_by_name: 'Alex' });
    const zoe = row({ id: 2, packed_by_name: 'Zoe' });
    const nobody = row({ id: 3 });
    assert.ok(compareQueueColumnRows(alex, zoe, 'packed', 'asc') < 0);
    assert.ok(compareQueueColumnRows(alex, zoe, 'packed', 'desc') > 0);
    assert.ok(compareQueueColumnRows(alex, nobody, 'packed', 'asc') < 0);
    assert.ok(compareQueueColumnRows(alex, nobody, 'packed', 'desc') < 0);
  });

  it('sorts by picker name A–Z; blanks last in both directions', () => {
    const alex = row({ id: 1, tested_by_name: 'Alex' });
    const zoe = row({ id: 2, tested_by_name: 'Zoe' });
    const nobody = row({ id: 3 });
    assert.ok(compareQueueColumnRows(alex, zoe, 'picked', 'asc') < 0);
    assert.ok(compareQueueColumnRows(alex, nobody, 'picked', 'desc') < 0);
  });

  it('sorts carriers A–Z with no hardcoded pin; blanks last in both directions', () => {
    const usps = row({ id: 1, carrier: 'USPS' });
    const ups = row({ id: 2, carrier: 'UPS' });
    const fedex = row({ id: 3, carrier: 'FEDEX' });
    const none = row({ id: 4 });
    assert.ok(compareQueueColumnRows(fedex, ups, 'carrier', 'asc') < 0);
    assert.ok(compareQueueColumnRows(ups, usps, 'carrier', 'asc') < 0);
    assert.ok(compareQueueColumnRows(usps, none, 'carrier', 'asc') < 0);
    assert.ok(compareQueueColumnRows(usps, none, 'carrier', 'desc') < 0);
  });

  it('pins the named carrier to the top; remaining carriers stay A–Z; blanks last', () => {
    const usps = row({ id: 1, carrier: 'USPS' });
    const ups = row({ id: 2, carrier: 'UPS' });
    const fedex = row({ id: 3, carrier: 'FEDEX' });
    const none = row({ id: 4 });
    assert.ok(compareQueueColumnRows(usps, ups, 'carrier:USPS', 'asc') < 0);
    assert.ok(compareQueueColumnRows(usps, fedex, 'carrier:USPS', 'asc') < 0);
    assert.ok(compareQueueColumnRows(usps, none, 'carrier:USPS', 'asc') < 0);
    assert.ok(compareQueueColumnRows(usps, none, 'carrier:USPS', 'desc') < 0);
    // Pin rank ignores dir — re-selecting USPS must not bury it.
    assert.ok(compareQueueColumnRows(usps, ups, 'carrier:USPS', 'desc') < 0);
    // The same menu, a different name.
    assert.ok(compareQueueColumnRows(ups, usps, 'carrier:UPS', 'asc') < 0);
    assert.ok(compareQueueColumnRows(ups, fedex, 'carrier:UPS', 'asc') < 0);
    // Unpinned carriers among themselves stay A–Z (FedEx before USPS).
    assert.ok(compareQueueColumnRows(fedex, usps, 'carrier:UPS', 'asc') < 0);
  });

  it('pins Amazon Order-column rows (3-7-7) above eBay (2-5-5); tracking does not join the pin', () => {
    const amazon = row({ id: 1, order_id: '111-2222222-3333333' });
    const ebay = row({ id: 2, order_id: '03-15100-78272' });
    const ups = row({ id: 3, carrier: 'UPS' });
    const none = row({ id: 4 });
    assert.ok(compareQueueColumnRows(amazon, ebay, 'channel:Amazon', 'asc') < 0);
    assert.ok(compareQueueColumnRows(amazon, ups, 'channel:Amazon', 'asc') < 0);
    assert.ok(compareQueueColumnRows(amazon, none, 'channel:Amazon', 'asc') < 0);
    const sorted = [ups, none, ebay, amazon].sort((a, b) =>
      compareQueueColumnRows(a, b, 'channel:Amazon', 'asc'),
    );
    assert.equal(sorted[0].id, 1);
  });

  it('channel Amazon keeps a contiguous Amazon cluster — eBay with TBA is not inserted between Amazons', () => {
    const amazonFedex = row({
      id: 1,
      order_id: '111-2222222-3333333',
      carrier: 'FEDEX',
      tracking_number: '123456789012',
    });
    const ebayTba = row({
      id: 2,
      order_id: '03-15100-78272',
      tracking_number: 'TBA123456789012',
    });
    const amazonBare = row({ id: 3, order_id: '112-3333333-4444444' });
    const amazonUps = row({
      id: 4,
      order_id: '113-4444444-5555555',
      carrier: 'UPS',
      tracking_number: '1Z999AA10123456784',
    });
    const sorted = [ebayTba, amazonBare, amazonUps, amazonFedex].sort((a, b) =>
      compareQueueColumnRows(a, b, 'channel:Amazon', 'asc'),
    );
    assert.equal(sorted[sorted.length - 1].id, 2, 'eBay is after every Amazon');
    assert.deepEqual(
      sorted.slice(0, 3).map((r) => r.id).sort((a, b) => a - b),
      [1, 3, 4],
      'Amazon Order-dots form a contiguous prefix even when tracking is FedEx/UPS/empty',
    );
  });

  it('pins Amazon logistics from TBA tracking when stn.carrier is empty', () => {
    const amazonShip = row({
      id: 1,
      order_id: '03-15100-78272',
      tracking_number: 'TBA123456789012',
    });
    const ups = row({ id: 2, carrier: 'UPS' });
    assert.ok(compareQueueColumnRows(amazonShip, ups, 'carrier:Amazon', 'asc') < 0);
  });

  it('pins USPS from a 94 tracking number under stamps_com (the chip face, not the raw code)', () => {
    const usps = row({
      id: 1,
      carrier: 'stamps_com',
      tracking_number: '9400111899562537689492',
    });
    const ups = row({ id: 2, carrier: 'UPS' });
    assert.ok(compareQueueColumnRows(usps, ups, 'carrier:USPS', 'asc') < 0);
    assert.ok(compareQueueColumnRows(usps, ups, 'carrier', 'asc') > 0, 'A–Z remainder: UPS before USPS');
  });

  it('sorts status labels and scanned-out stamps', () => {
    const scanned = row({
      id: 1,
      outboundState: 'SCANNED_OUT',
      ship_confirmed_at: '2026-08-20T12:00:00Z',
    });
    const packed = row({
      id: 2,
      outboundState: 'PACKED_STAGED',
      ship_confirmed_at: '2026-09-01T12:00:00Z',
    });
    assert.ok(compareQueueColumnRows(packed, scanned, 'status', 'asc', 'shipped') !== 0);
    assert.ok(compareQueueColumnRows(scanned, packed, 'scanned_out', 'asc') < 0);
    const nobody = row({ id: 3, ship_confirmed_at: null });
    assert.ok(compareQueueColumnRows(scanned, nobody, 'scanned_out', 'desc') < 0);
  });

  it('sorts amount with blanks last', () => {
    const cheap = row({ id: 1, sale_amount: 10 });
    const dear = row({ id: 2, sale_amount: 90 });
    assert.ok(compareQueueColumnRows(cheap, dear, 'amount', 'asc') < 0);
  });
});

describe('urgent leads every column sort', () => {
  it('an urgent row sorts above a non-urgent one whatever the column says', () => {
    // Alphabetically Zebra loses to Alpha; the expedite flag overrules it.
    const urgent = row({ id: 1, product_title: 'Zebra Lens', is_urgent: true });
    const ordinary = row({ id: 2, product_title: 'Alpha Camera' });
    assert.ok(compareQueueColumnRows(urgent, ordinary, 'title', 'asc') < 0);
  });

  it('never follows the direction — flipping must not bury the rush work', () => {
    const urgent = row({ id: 1, product_title: 'Alpha Camera', is_urgent: true });
    const ordinary = row({ id: 2, product_title: 'Zebra Lens' });
    assert.ok(compareQueueColumnRows(urgent, ordinary, 'title', 'asc') < 0);
    assert.ok(compareQueueColumnRows(urgent, ordinary, 'title', 'desc') < 0);
  });

  it('inside the urgent set the column still decides', () => {
    const a = row({ id: 1, product_title: 'Alpha Camera', is_urgent: true });
    const z = row({ id: 2, product_title: 'Zebra Lens', is_urgent: true });
    assert.ok(compareQueueColumnRows(a, z, 'title', 'asc') < 0);
    assert.ok(compareQueueColumnRows(a, z, 'title', 'desc') > 0);
  });

  it('leaves the Shipped lane alone — that work is done', () => {
    const urgent = row({ id: 1, product_title: 'Zebra Lens', is_urgent: true });
    const ordinary = row({ id: 2, product_title: 'Alpha Camera' });
    assert.ok(compareQueueColumnRows(urgent, ordinary, 'title', 'asc', 'shipped') > 0);
  });
});
