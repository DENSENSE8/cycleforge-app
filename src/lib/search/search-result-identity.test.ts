import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AiSearchHit } from '@/lib/search/ai-search-client';
import {
  identityKindFor,
  matchMetaFromHit,
  orderIdFromHit,
  orderIdFromSubtitle,
  unitSerialFromHit,
} from './search-result-identity';

function hit(partial: Partial<AiSearchHit> & Pick<AiSearchHit, 'entityType'>): AiSearchHit {
  return {
    id: 1,
    title: 'Title',
    subtitle: '',
    href: '/search?sel=order:1',
    matchField: 'order',
    score: 1,
    chips: [],
    ...partial,
  };
}

describe('search-result-identity', () => {
  it('orderIdFromHit prefers facets.order_id over subtitle', () => {
    assert.equal(
      orderIdFromHit(
        hit({
          entityType: 'order',
          subtitle: '16-14873-30704 · SKU · EBAY',
          facets: { order_id: '99-11111-22222' },
        }),
      ),
      '99-11111-22222',
    );
  });

  it('orderIdFromHit parses order subtitle; receiving uses PO/order facets', () => {
    assert.equal(
      orderIdFromHit(
        hit({ entityType: 'order', subtitle: '16-14873-30704 · 00278-P-1 · EBAY' }),
      ),
      '16-14873-30704',
    );
    assert.equal(
      orderIdFromHit(
        hit({
          entityType: 'receiving',
          subtitle: 'USPS · other',
          facets: { po_number: 'PO-55', source_order_id: '16-1' },
        }),
      ),
      'PO-55',
    );
  });

  it('identityKindFor prefers order/PO id; never leads with tracking', () => {
    assert.equal(
      identityKindFor(
        hit({ entityType: 'order' }),
        '16-14873-30704',
        '',
        '9400108106244325286212',
      ),
      'order',
    );
    assert.equal(
      identityKindFor(
        hit({ entityType: 'receiving' }),
        'PO-1',
        '',
        '9400…6212',
      ),
      'order',
    );
    assert.equal(
      identityKindFor(hit({ entityType: 'receiving' }), '', '', '9400…6212'),
      'empty',
    );
    assert.equal(
      identityKindFor(hit({ entityType: 'unit' }), '', 'SN-ABC-12345', null),
      'serial',
    );
    assert.equal(
      identityKindFor(
        hit({ entityType: 'import_exception' }),
        '15-14964-95153',
        '',
        '9434608106244396718157',
      ),
      'order',
    );
  });

  it('unitSerialFromHit uses facet then subtitle', () => {
    assert.equal(
      unitSerialFromHit(
        hit({ entityType: 'unit', subtitle: 'SN-1 · SKU · DONE', facets: { serial_number: 'FACET-9' } }),
      ),
      'FACET-9',
    );
    assert.equal(
      unitSerialFromHit(hit({ entityType: 'unit', subtitle: 'SN-1 · SKU · DONE' })),
      'SN-1',
    );
  });

  it('matchMetaFromHit strips the leading order id', () => {
    assert.equal(
      matchMetaFromHit(
        hit({ entityType: 'order', subtitle: '16-14873-30704 · 00278-P-1 · EBAY' }),
        'order',
        '16-14873-30704',
      ),
      '00278-P-1 · EBAY',
    );
  });

  it('orderIdFromSubtitle returns the first segment', () => {
    assert.equal(orderIdFromSubtitle('16-14873-30704 · SKU'), '16-14873-30704');
    assert.equal(orderIdFromSubtitle(null), null);
  });
});
