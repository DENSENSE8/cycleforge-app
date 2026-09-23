/**
 *   npx tsx --test src/design-system/tokens/item-record-mobile.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ITEM_RECORD_MOBILE_META,
  ITEM_RECORD_MOBILE_ROW,
  ITEM_RECORD_MOBILE_STATE_RAIL,
  ITEM_RECORD_MOBILE_STAGE,
  ITEM_RECORD_MOBILE_STAGE_VERBS,
  ITEM_RECORD_MOBILE_THUMB,
  ITEM_RECORD_MOBILE_TITLE,
} from './item-record-mobile';

describe('item-record mobile tokens', () => {
  it('keeps qty · condition · notes on one cluster token', () => {
    assert.match(ITEM_RECORD_MOBILE_META.cluster, /text-role-caption/);
    assert.doesNotMatch(ITEM_RECORD_MOBILE_META.cluster, /bg-surface-sunken|inset-chip|text-base/);
    assert.ok(ITEM_RECORD_MOBILE_META.qty);
    assert.ok(ITEM_RECORD_MOBILE_META.condition);
    assert.ok(ITEM_RECORD_MOBILE_META.notes);
    assert.equal('sep' in ITEM_RECORD_MOBILE_META, false);
  });

  it('keeps queue rows flush and hairline-separated on the phone sheet', () => {
    assert.match(ITEM_RECORD_MOBILE_ROW.shell, /border-b/);
    assert.doesNotMatch(ITEM_RECORD_MOBILE_ROW.shell, /rounded|shadow/);
  });

  it('maps workflow state rails to semantic color roles', () => {
    assert.match(ITEM_RECORD_MOBILE_STATE_RAIL.ready, /border-l-4 border-border-accent/);
    assert.match(ITEM_RECORD_MOBILE_STATE_RAIL.exception, /border-l-4 border-border-danger/);
    assert.match(ITEM_RECORD_MOBILE_STATE_RAIL.packed, /border-l-4 border-border-success/);
    assert.doesNotMatch(
      Object.values(ITEM_RECORD_MOBILE_STATE_RAIL).join(' '),
      /(?:blue|orange|green|red)-\d{2,3}/,
    );
  });

  it('keeps queued image verification compact and quantity independently pinned', () => {
    assert.match(ITEM_RECORD_MOBILE_THUMB.size, /w-12/);
    assert.match(ITEM_RECORD_MOBILE_THUMB.activeSize, /w-20/);
    assert.match(ITEM_RECORD_MOBILE_TITLE.quantityAnchor, /min-w-18/);
    assert.match(ITEM_RECORD_MOBILE_TITLE.quantityAnchor, /bg-surface-sunken/);
    assert.match(ITEM_RECORD_MOBILE_TITLE.quantityValue, /tabular-nums/);
  });

  it('names Picked / Packed — never a person', () => {
    assert.equal(ITEM_RECORD_MOBILE_STAGE_VERBS.pick, 'Picked');
    assert.equal(ITEM_RECORD_MOBILE_STAGE_VERBS.packed, 'Packed');
    assert.match(ITEM_RECORD_MOBILE_STAGE.mark, /items-center/);
    assert.doesNotMatch(ITEM_RECORD_MOBILE_STAGE.verb, /uppercase/);
    assert.match(ITEM_RECORD_MOBILE_STAGE.empty, /border-dashed/);
  });
});
