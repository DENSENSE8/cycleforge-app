/**
 * `sku-exceptions` family — the catalog, its product layout, and the words the
 * queue paints.
 *
 * - The layout PARSES against the catalog with no subtitle bindings: that empty
 *   band is what lets the description paint as the note under the title.
 * - `Needs photo` is the alert word, and only a row with zero photos wears it.
 * - The Locations fact names every location still holding stock, in the
 *   segmented face an operator reads, and drops emptied ones.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ProvisionalSku } from '@/lib/neon/provisional-sku-queries';
import { skuExceptionsCompoundView } from '@/components/inventory/sku-exceptions/sku-exceptions-row-view';
import { parseSlotLayout } from '../slot-layout';
import { SKU_EXCEPTIONS_FIELD_CATALOG, SKU_EXCEPTIONS_PRODUCT_LAYOUT } from './sku-exceptions';
import { resolveSkuExceptionsSlotValue } from './sku-exceptions-resolve';

function row(overrides: Partial<ProvisionalSku> = {}): ProvisionalSku {
  return {
    sku: 'TMP-0123456789',
    stockId: 41,
    productTitle: 'Brake lever, left',
    description: 'Black, scuffed on the blade',
    barcode: '0123456789',
    stock: 4,
    createdByStaffId: 7,
    createdByName: 'Ana',
    createdAt: '2026-09-20T15:04:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
    photoCount: 2,
    coverPhotoId: 900,
    locations: [
      { locationId: 1, barcode: 'C0409200', room: 'Back', qty: 3 },
      { locationId: 2, barcode: 'TECH-PARTS', room: null, qty: 1 },
    ],
    ...overrides,
  };
}

describe('sku-exceptions catalog', () => {
  it('parses its product layout with the SKU as identity and no subtitle bindings', () => {
    const parsed = parseSlotLayout(SKU_EXCEPTIONS_PRODUCT_LAYOUT, SKU_EXCEPTIONS_FIELD_CATALOG);
    assert.equal(parsed.identityFieldId, 'sku-exceptions.sku');
    assert.deepEqual(parsed.subtitleBindings, []);
    for (const field of SKU_EXCEPTIONS_FIELD_CATALOG) {
      assert.ok(field.id.startsWith('sku-exceptions.'), `${field.id} is not family-qualified`);
    }
  });
});

describe('sku-exceptions words', () => {
  it('only a photo-less placeholder needs a photo, and only that one is alert-toned', () => {
    assert.deepEqual(resolveSkuExceptionsSlotValue(row({ photoCount: 0 }), 'sku-exceptions.state'), {
      kind: 'value',
      text: 'Needs photo',
    });
    assert.equal(skuExceptionsCompoundView(row({ photoCount: 0, coverPhotoId: null })).stateTone, 'alert');
    assert.equal(skuExceptionsCompoundView(row({ photoCount: 1 })).stateTone, 'neutral');
  });

  it('lists held locations in the segmented face and drops emptied ones', () => {
    const value = resolveSkuExceptionsSlotValue(
      row({
        locations: [
          { locationId: 1, barcode: 'C0409200', room: 'Back', qty: 3 },
          { locationId: 2, barcode: 'TECH-PARTS', room: null, qty: 1 },
          { locationId: 3, barcode: 'A0101100', room: null, qty: 0 },
        ],
      }),
      'sku-exceptions.locations',
    );
    assert.deepEqual(value, { kind: 'value', text: 'C-04-09-2-00 ×3 · TECH-PARTS ×1' });
    assert.deepEqual(resolveSkuExceptionsSlotValue(row({ locations: [] }), 'sku-exceptions.locations'), {
      kind: 'value',
      text: null,
    });
  });

  it('paints the description under the title and the barcode under the SKU', () => {
    const view = skuExceptionsCompoundView(row());
    assert.equal(view.note, 'Black, scuffed on the blade');
    assert.equal(view.identityFace?.value, 'TMP-0123456789');
    assert.equal(view.identitySubFace?.value, '0123456789');
    assert.equal(skuExceptionsCompoundView(row({ description: '  ' })).note, null);
    assert.equal(skuExceptionsCompoundView(row({ coverPhotoId: null })).thumbUrl, null);
  });
});
