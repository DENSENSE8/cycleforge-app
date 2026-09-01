/**
 *   npx tsx --test src/design-system/tokens/item-record-mobile.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ITEM_RECORD_MOBILE_META,
  ITEM_RECORD_MOBILE_STAGE,
  ITEM_RECORD_MOBILE_STAGE_VERBS,
} from './item-record-mobile';

describe('item-record mobile tokens', () => {
  it('keeps qty · condition · notes on one cluster token', () => {
    assert.equal(ITEM_RECORD_MOBILE_META.cluster, 'row-gap min-w-0 bg-surface-sunken inset-chip');
    assert.ok(ITEM_RECORD_MOBILE_META.qty);
    assert.ok(ITEM_RECORD_MOBILE_META.condition);
    assert.ok(ITEM_RECORD_MOBILE_META.notes);
    assert.ok(ITEM_RECORD_MOBILE_META.notesIdle);
  });

  it('names Picked / Packed — never a person', () => {
    assert.equal(ITEM_RECORD_MOBILE_STAGE_VERBS.pick, 'Picked');
    assert.equal(ITEM_RECORD_MOBILE_STAGE_VERBS.packed, 'Packed');
    assert.match(ITEM_RECORD_MOBILE_STAGE.verb, /uppercase/);
    assert.match(ITEM_RECORD_MOBILE_STAGE.empty, /border-dashed/);
  });
});
