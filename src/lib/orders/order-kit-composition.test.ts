/**
 * Tests for multi-tenant kit composition merge (no Zoho -P).
 * Callers: order-kit-composition, Morphing OOS. Schema: sku_relationships vs sku_kit_parts.
 * User: Shopify-like parent→child kit display instead of dash-P.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kitFaceFromComposition, mergeKitComposition } from '@/lib/orders/order-kit-composition';
import { morphingComponentIdentity } from '@/lib/outbound/morphing-oos';

describe('mergeKitComposition', () => {
  const parent = {
    skuCatalogId: 1,
    sku: 'BUNDLE-1',
    title: 'Soundbar kit',
    thumbUrl: null,
  };

  it('prefers catalog edges over packing kit_parts', () => {
    const composition = mergeKitComposition({
      parent,
      children: [
        {
          relationship_id: 9,
          qty: 2,
          sku_id: 44,
          sku: 'REMOTE-1',
          product_title: 'Remote',
          image_url: null,
        },
      ],
      kitParts: [{ id: 1, component_name: 'Should not win', qty_required: 1 }],
    });
    assert.equal(composition.components.length, 1);
    assert.equal(composition.components[0]?.source, 'catalog_edge');
    assert.equal(composition.components[0]?.sku, 'REMOTE-1');
    assert.equal(composition.components[0]?.qty, 2);
  });

  it('falls back to kit_parts when no catalog edges', () => {
    const composition = mergeKitComposition({
      parent,
      children: [],
      kitParts: [{ id: 7, component_name: 'Power cable', component_type: 'CABLE', qty_required: 1 }],
    });
    assert.equal(composition.components[0]?.source, 'kit_part');
    assert.equal(composition.components[0]?.title, 'Power cable');
    assert.equal(composition.components[0]?.kitPartId, 7);
  });

  it('returns empty components when neither source has rows', () => {
    const composition = mergeKitComposition({ parent, children: [], kitParts: [] });
    assert.equal(composition.components.length, 0);
  });
});

describe('kitFaceFromComposition', () => {
  const parent = {
    skuCatalogId: 1,
    sku: 'BUNDLE-1',
    title: 'Soundbar kit',
    thumbUrl: null,
  };

  it('builds Bundle · N face from catalog edges', () => {
    const composition = mergeKitComposition({
      parent,
      children: [
        {
          relationship_id: 1,
          qty: 1,
          sku_id: 2,
          sku: 'A',
          product_title: 'Part A',
        },
        {
          relationship_id: 2,
          qty: 1,
          sku_id: 3,
          sku: 'B',
          product_title: 'Part B',
        },
      ],
    });
    const face = kitFaceFromComposition(composition);
    assert.equal(face?.label, 'Bundle · 2');
    assert.equal(face?.source, 'catalog_edge');
    assert.equal(face?.components.length, 2);
  });

  it('builds Kit · N face from packing names', () => {
    const composition = mergeKitComposition({
      parent,
      kitParts: [{ id: 1, component_name: 'Cable', qty_required: 1 }],
    });
    const face = kitFaceFromComposition(composition);
    assert.equal(face?.label, 'Kit · 1');
    assert.equal(face?.source, 'kit_part');
  });

  it('returns null when empty', () => {
    assert.equal(kitFaceFromComposition(mergeKitComposition({ parent })), null);
  });
});

describe('morphingComponentIdentity', () => {
  it('writes child catalog id for a catalog-edge component', () => {
    const id = morphingComponentIdentity(
      { sku: 'BUNDLE', sku_catalog_id: 1 },
      {
        source: 'catalog_edge',
        title: 'Remote',
        sku: 'REMOTE-1',
        qty: 1,
        childSkuCatalogId: 44,
      },
    );
    assert.equal(id.kind, 'catalog_child');
    assert.equal(id.sku, 'REMOTE-1');
    assert.equal(id.skuCatalogId, 44);
    assert.equal(id.kitPartId, null);
    assert.equal(id.title, 'Remote');
  });
});
