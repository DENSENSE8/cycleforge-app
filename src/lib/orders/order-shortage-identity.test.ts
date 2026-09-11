/**
 * Tests for order shortage identity helpers.
 * Callers under test: order-shortage-identity.ts (assign / Morphing / itemStatus).
 * Schema: oos_* payload. User: Implement OOS identity + Pending-tab toast plan.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CLEAR_ORDER_SHORTAGE_IDENTITY,
  catalogChildShortageIdentity,
  catalogOtherShortageIdentity,
  kitPartShortageIdentity,
  listingShortageIdentity,
  shortageIdentityFromRow,
  shortageIdentityToPayload,
  shortageZohoKey,
} from '@/lib/orders/order-shortage-identity';

describe('order-shortage-identity', () => {
  it('builds a listing identity', () => {
    const id = listingShortageIdentity({
      sku: 'SKU-1',
      skuCatalogId: 9,
      title: 'Widget',
      qtyShort: 2,
    });
    assert.equal(id.kind, 'listing');
    assert.equal(id.sku, 'SKU-1');
    assert.equal(id.kitPartId, null);
    assert.equal(id.qtyShort, 2);
  });

  it('builds a kit-part identity with component title', () => {
    const id = kitPartShortageIdentity({
      kitPartId: 44,
      title: 'Remote',
      sku: 'KIT-1',
      skuCatalogId: 3,
      qtyShort: 1,
    });
    assert.equal(id.kind, 'kit_part');
    assert.equal(id.kitPartId, 44);
    assert.equal(id.title, 'Remote');
  });

  it('round-trips payload and clears identity', () => {
    const id = listingShortageIdentity({ sku: 'A', title: 'T' });
    const payload = shortageIdentityToPayload(id);
    assert.equal(payload.oosKind, 'listing');
    assert.equal(payload.oosSku, 'A');
    assert.deepEqual(shortageIdentityToPayload(null), CLEAR_ORDER_SHORTAGE_IDENTITY);
  });

  it('reads snake_case row fields', () => {
    const id = shortageIdentityFromRow({
      oos_kind: 'kit_part',
      oos_sku: 'PART',
      oos_kit_part_id: 7,
      oos_qty_short: '3',
      oos_title: 'Cable',
    });
    assert.ok(id);
    assert.equal(id.kind, 'kit_part');
    assert.equal(id.qtyShort, 3);
    assert.equal(id.title, 'Cable');
  });

  it('keys open shortages on zoho_item_id', () => {
    assert.equal(
      shortageZohoKey(listingShortageIdentity({ sku: 'A', zohoItemId: 'ZI-9' })),
      'ZI-9',
    );
    assert.equal(
      shortageZohoKey(catalogChildShortageIdentity({ sku: 'C', skuCatalogId: 4, title: 'Child' })),
      'catalog:4',
    );
    assert.equal(
      shortageZohoKey(catalogOtherShortageIdentity({ sku: 'X', title: 'Other', zohoItemId: 'ZI-1' })),
      'ZI-1',
    );
  });
});
