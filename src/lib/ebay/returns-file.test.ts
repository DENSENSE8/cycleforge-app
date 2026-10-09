import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectPoPreset, identifyColumns, poRowToDeskRow, PO_PRESETS } from '@/lib/inbound/po-columns';
import { readReturnReason } from '@/lib/inbound/return-reason-codes';
import { ebayReturnRecord, ebaySearchRanges, parseReturnSearchPage, renderEbayReturnsFile } from './returns-file';

/** A Post-Order search page (ReturnSummaryType members), trimmed to what eBay documents. */
const SEARCH_PAGE = {
  countSummary: [{ count: 2, type: 'ALL_OPEN' }],
  members: [
    {
      returnId: '5000123456',
      orderId: '12-34567-89012',
      state: 'CLOSED',
      status: 'REFUND_ISSUED',
      creationInfo: {
        item: { itemId: '296512345678', transactionId: '1234567890001', returnQuantity: 1 },
        reason: 'NOT_AS_DESCRIBED',
        reasonType: 'SNAD',
        comments: { content: 'Frame has a crack not shown in photos', language: 'en' },
        creationDate: { value: '2026-09-14T18:22:05.000Z', formattedValue: '' },
      },
    },
    {
      returnId: 5000123457,
      orderId: '23-45678-90123',
      state: 'RETURN_REQUESTED',
      creationInfo: {
        item: { itemId: 296599999999, returnQuantity: '2' },
        creationDate: { value: '2026-09-20T09:00:00.000Z' },
      },
    },
  ],
  paginationOutput: { limit: 200, offset: 0, totalEntries: 2, totalPages: 1 },
  total: 2,
};

/** `GET /post-order/v2/return/{id}?fieldgroups=FULL` for the first member. */
const DETAIL_1 = {
  summary: SEARCH_PAGE.members[0],
  detail: {
    itemDetail: { itemId: '296512345678', itemTitle: 'Trek Domane AL 2 56cm', returnQuantity: 1 },
    returnShipmentInfo: {
      shipmentTracking: { carrierEnum: 'USPS', trackingNumber: '9405511899223197428490' },
    },
  },
};

/** The second member's search slice lacks the reason; only the full return carries it. */
const DETAIL_2 = {
  summary: { returnId: '5000123457', orderId: '23-45678-90123', creationInfo: { reason: 'NO_LONGER_NEED_ITEM' } },
  detail: {
    itemDetail: { itemId: '296599999999', itemTitle: 'Shimano 105 pedals' },
    returnShipmentInfo: { allShipmentTrackings: [{ trackingNumber: '' }, { trackingNumber: '1Z999AA10123456784' }] },
  },
};

/** Sell Fulfillment getOrder slice — the SKU lives only here. */
const ORDER_1 = {
  orderId: '12-34567-89012',
  lineItems: [
    { legacyItemId: '111111111111', sku: 'OTHER-SKU', title: 'Other' },
    { legacyItemId: '296512345678', sku: 'BK-TREK-DOM-56', title: 'Trek Domane AL 2 56cm' },
  ],
};

const WINDOW = { since: new Date('2026-09-01T00:00:00Z'), until: new Date('2026-10-01T00:00:00Z') };

function renderFixture() {
  const { members, total } = parseReturnSearchPage(SEARCH_PAGE);
  assert.equal(total, 2);
  return renderEbayReturnsFile(
    [ebayReturnRecord(members[0]!, DETAIL_1, ORDER_1), ebayReturnRecord(members[1]!, DETAIL_2, null)],
    WINDOW,
  );
}

describe('renderEbayReturnsFile', () => {
  it('renders one ebay_returns row per return in the preset header words', () => {
    const file = renderFixture();
    assert.equal(file.preset, 'ebay_returns');
    assert.equal(file.fileName, 'ebay-returns 2026-09-01..2026-10-01');
    assert.equal(detectPoPreset(file.headers, file.rows), 'ebay_returns');
    assert.deepEqual(file.rows[0], {
      'return id': '5000123456',
      'order number': '12-34567-89012',
      'item id': '296512345678',
      'item title': 'Trek Domane AL 2 56cm',
      'custom label': 'BK-TREK-DOM-56',
      quantity: '1',
      'return reason': 'NOT_AS_DESCRIBED',
      'buyer comments': 'Frame has a crack not shown in photos',
      'return tracking number': '9405511899223197428490',
      'return opened': '2026-09-14',
    });
    assert.equal(file.rows[1]!['return reason'], 'NO_LONGER_NEED_ITEM', 'reason from the full return when search lacks it');
    assert.equal(file.rows[1]!['return tracking number'], '1Z999AA10123456784');
    assert.equal(file.rows[1]!['custom label'], '', 'no order → no SKU, the return still lands');
    assert.equal(file.rows[1]!.quantity, '2');
  });

  it('identifies every column and lands the desk row with order number, reason and RMA', () => {
    const file = renderFixture();
    const preset = PO_PRESETS.ebay_returns;
    const { mapping } = identifyColumns(file.headers, file.rows, { preset });
    assert.deepEqual(
      { ...mapping },
      {
        rma: 'return id',
        order_number: 'order number',
        item_id: 'item id',
        item_title: 'item title',
        sku: 'custom label',
        quantity: 'quantity',
        return_reason: 'return reason',
        customer_comment: 'buyer comments',
        tracking: 'return tracking number',
        return_request_date: 'return opened',
      },
    );
    const { deskRow, problems } = poRowToDeskRow(file.rows[0]!, 0, { mapping, preset, platform: '' });
    assert.deepEqual(problems, []);
    assert.equal(deskRow?.receivingType, 'RETURN');
    assert.equal(deskRow?.orderId, '12-34567-89012');
    assert.equal(deskRow?.returnReason, 'NOT_AS_DESCRIBED');
    assert.equal(deskRow?.rmaId, '5000123456');
    assert.equal(deskRow?.returnRequestDate, '2026-09-14');
    assert.equal(deskRow?.trackingNumber, '9405511899223197428490');
    assert.equal(deskRow?.sku, 'BK-TREK-DOM-56');
    assert.equal(deskRow?.itemNumber, '296512345678');
    assert.equal(deskRow?.quantity, 1);
    assert.equal(deskRow?.customerComment, 'Frame has a crack not shown in photos');
    assert.equal(deskRow?.lineItemId, '5000123456:296512345678');
    assert.equal(readReturnReason(deskRow?.returnReason)?.label, 'Not as described');
  });

  it('prefers the Fulfillment order number over a legacy Post-Order id', () => {
    const { members } = parseReturnSearchPage({
      members: [{ returnId: '1', orderId: '296512345678-1234567890001', creationInfo: { item: { itemId: '296512345678' } } }],
    });
    assert.equal(ebayReturnRecord(members[0]!, null, ORDER_1).orderNumber, '12-34567-89012');
    assert.equal(ebayReturnRecord(members[0]!, null, null).orderNumber, '296512345678-1234567890001');
  });
});

describe('ebaySearchRanges', () => {
  it('splits the window into ≤90-day ranges with an inclusive end just before `until`', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const ranges = ebaySearchRanges({ since: new Date('2026-04-01T00:00:00Z'), until: new Date('2026-10-01T00:00:00Z') }, now);
    assert.equal(ranges.length, 3);
    assert.equal(ranges[0]!.from, '2026-04-01T00:00:00.000Z');
    assert.equal(ranges[0]!.to, '2026-06-29T23:59:59.999Z');
    assert.equal(ranges[2]!.to, '2026-09-30T23:59:59.999Z');
  });

  it('never asks before eBay’s 18-month floor or past now', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const ranges = ebaySearchRanges({ since: new Date('2020-01-01T00:00:00Z'), until: new Date('2027-01-01T00:00:00Z') }, now);
    assert.equal(ranges[0]!.from, '2025-04-10T12:00:00.000Z');
    assert.equal(ranges.at(-1)!.to, '2026-10-09T11:59:59.999Z');
    assert.deepEqual(ebaySearchRanges({ since: new Date('2019-01-01T00:00:00Z'), until: new Date('2019-02-01T00:00:00Z') }, now), []);
  });
});
