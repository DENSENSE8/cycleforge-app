import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { customFieldColumnKey, isCustomFieldColumnKey, parseCustomFieldDefKey } from '@/lib/tables/custom-field-keys';

describe('custom-field-keys', () => {
  it('round-trips def key ↔ column key', () => {
    assert.equal(customFieldColumnKey('po_ref'), 'custom:po_ref');
    assert.equal(parseCustomFieldDefKey('custom:po_ref'), 'po_ref');
    assert.equal(isCustomFieldColumnKey('custom:po_ref'), true);
    assert.equal(isCustomFieldColumnKey('title'), false);
  });
});
