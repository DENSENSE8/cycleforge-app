import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  composeInboundReturnReason,
  emptyInboundOrderDraft,
  emptyInboundOrderLine,
  inboundOrderMissing,
  INBOUND_RETURN_REASONS,
  parseInboundReturnReason,
  type InboundOrderDraft,
} from './inbound-order-draft';

/** A return with everything the claim + unboxer need. */
function readyReturn(over: Partial<InboundOrderDraft> = {}): InboundOrderDraft {
  return {
    ...emptyInboundOrderDraft('RETURN'),
    platform: 'ebay',
    orderNumber: '12-34567-89012',
    returnReason: 'Damaged in transit',
    tracking: [{ number: '1Z999AA10123456784', carrier: '' }],
    lines: [
      {
        ...emptyInboundOrderLine(),
        skuCatalogId: 7,
        sku: 'CF-7',
        title: 'Road bike',
        quantity: 1,
        listingUrl: 'https://www.ebay.com/itm/1234',
      },
    ],
    ...over,
  };
}

describe('inboundOrderMissing — return reason and listing link', () => {
  it('a complete return is ready', () => {
    assert.deepEqual(inboundOrderMissing(readyReturn()), []);
  });

  it('a return without a reason needs one', () => {
    const needs = inboundOrderMissing(readyReturn({ returnReason: '   ' }));
    assert.deepEqual(needs, [{ field: 'return_reason', label: 'Return reason' }]);
  });

  it('a return whose item has no listing link points at that line', () => {
    const draft = readyReturn();
    const needs = inboundOrderMissing({ ...draft, lines: [{ ...draft.lines[0], listingUrl: ' ' }] });
    assert.deepEqual(needs, [{ field: 'listing_url', label: 'Listing link on the returned item', lines: [0] }]);
  });

  it('flags the filled line, not a blank trailing row', () => {
    const draft = readyReturn();
    const needs = inboundOrderMissing({ ...draft, lines: [emptyInboundOrderLine(), { ...draft.lines[0], listingUrl: '' }] });
    assert.deepEqual(needs.find((n) => n.field === 'listing_url')?.lines, [1]);
  });

  it('a purchase order needs neither', () => {
    const draft = readyReturn({ type: 'PO', returnReason: '' });
    const f = inboundOrderMissing({ ...draft, lines: [{ ...draft.lines[0], listingUrl: '' }] }).map((n) => n.field);
    assert.equal(f.includes('return_reason'), false);
    assert.equal(f.includes('listing_url'), false);
  });

  it('a return landing without a claim (CSV / sync) needs neither', () => {
    const draft = readyReturn({ returnReason: '' });
    const needs = inboundOrderMissing({ ...draft, lines: [{ ...draft.lines[0], listingUrl: '' }] }, { returnClaim: false });
    assert.deepEqual(needs, []);
  });
});

describe('return reason round-trip', () => {
  it('reason alone and reason with detail read back into both controls', () => {
    for (const reason of INBOUND_RETURN_REASONS) {
      assert.deepEqual(parseInboundReturnReason(composeInboundReturnReason(reason, '')), { reason, detail: '' });
      const withDetail = composeInboundReturnReason(reason, 'crack on the top tube');
      assert.equal(withDetail, `${reason} — crack on the top tube`);
      assert.deepEqual(parseInboundReturnReason(withDetail), { reason, detail: 'crack on the top tube' });
    }
  });

  it('a blank detail stores the reason alone', () => {
    assert.equal(composeInboundReturnReason('Wrong item sent', '  '), 'Wrong item sent');
  });

  it('text naming no known reason is kept whole as the detail', () => {
    assert.deepEqual(parseInboundReturnReason('buyer says it rattles'), { reason: null, detail: 'buyer says it rattles' });
    assert.equal(composeInboundReturnReason(null, 'buyer says it rattles'), 'buyer says it rattles');
    assert.deepEqual(parseInboundReturnReason(''), { reason: null, detail: '' });
  });

  it('a detail that itself carries the separator survives', () => {
    const raw = composeInboundReturnReason('Other', 'box — crushed — wet');
    assert.deepEqual(parseInboundReturnReason(raw), { reason: 'Other', detail: 'box — crushed — wet' });
  });
});
