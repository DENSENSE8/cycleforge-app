/**
 * Combobox encoding for item-level OOS — never synthetic line indexes.
 * Callers: OosProductCombobox. No API. User: Implement the item-level OOS plan.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  encodeOosComboboxValue,
  identityFromParsedOos,
  oosOptionsOnThisOrder,
  parseOosComboboxValue,
} from '@/lib/orders/oos-combobox-options';

describe('oos-combobox-options', () => {
  it('round-trips a Zoho product bound to an order line', () => {
    const value = encodeOosComboboxValue({
      orderRowId: 42,
      kind: 'listing',
      zohoItemId: 'ZI-1',
      skuCatalogId: 9,
      sku: 'SEED',
    });
    const parsed = parseOosComboboxValue(value);
    assert.ok(parsed);
    assert.equal(parsed.orderRowId, 42);
    assert.equal(parsed.zohoItemId, 'ZI-1');
    const identity = identityFromParsedOos(parsed, { title: 'Seed Socks' });
    assert.equal(identity.kind, 'listing');
    assert.equal(identity.zohoItemId, 'ZI-1');
    assert.equal(identity.title, 'Seed Socks');
  });

  it('labels on-order options with product titles, not line-N', () => {
    const options = oosOptionsOnThisOrder([
      { id: 1, sku: 'A', product_title: 'Seed Socks', zoho_item_id: 'ZI-A' },
      { id: 2, sku: 'B', product_title: 'Seed Hat', zoho_item_id: 'ZI-B' },
    ]);
    assert.equal(options.length, 2);
    assert.equal(options[0]?.label, 'Seed Socks');
    assert.equal(options[1]?.label, 'Seed Hat');
    for (const opt of options) {
      assert.doesNotMatch(opt.label, /line[- ]?\d/i);
      assert.doesNotMatch(opt.value, /^line-/);
    }
  });
});
