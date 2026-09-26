/** The search box must match what the row PAINTS — cohort-wide. */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { slotTableSearchFactIds } from './slot-table-search-vocabulary';

/** A compound skeleton in miniature: two chrome tracks, one bound status slot. */
const COLUMNS = [
  { key: 'select' },
  { key: 'fulfillment' },
  { key: 'thumb' },
  { key: 'item' },
  { key: 'dates' },
  { key: 'state' },
  { key: 'status:1', fieldId: 'fam.room' },
  { key: '_fill' },
] as const;

const SORT_FACT_FOR = (col: { key: string; fieldId?: string }): string | null => {
  if (col.key === 'fulfillment') return 'fam.location';
  if (col.key === 'item') return 'fam.item';
  if (col.key === 'state') return 'fam.level';
  if (col.key === 'dates') return 'fam.counted';
  if (col.key === 'select' || col.key === 'thumb' || col.key === '_fill') return null;
  return col.fieldId ?? null;
};

describe('slot-table search vocabulary', () => {
  it('covers the STRUCTURAL facts the chrome tracks paint, which carry no fieldId', () => {
    const ids = slotTableSearchFactIds({ columns: COLUMNS, sortFactFor: SORT_FACT_FOR });
    // The title is the single most-typed thing on any desk, and it lives on a
    // chrome track — this is the bug that started the fix.
    assert.ok(ids.includes('fam.item'), 'the product TITLE is not searchable');
    assert.ok(ids.includes('fam.location'), 'the identity handle is not searchable');
    assert.ok(ids.includes('fam.level'), 'the state word is not searchable');
    assert.ok(ids.includes('fam.counted'), 'the date stamp is not searchable');
  });

  it('covers the UNDER-TITLE band — compound paints it in the cell, not as a track', () => {
    const ids = slotTableSearchFactIds({
      columns: COLUMNS,
      sortFactFor: SORT_FACT_FOR,
      subtitleFieldIds: ['fam.qty'],
    });
    assert.ok(ids.includes('fam.qty'), 'the line qty is not searchable');
    // …and it is absent when nothing is bound there, rather than guessed at.
    const bare = slotTableSearchFactIds({ columns: COLUMNS, sortFactFor: SORT_FACT_FOR });
    assert.ok(!bare.includes('fam.qty'));
  });

  it('covers the bound status band, and never invents a fact for pure chrome', () => {
    const ids = slotTableSearchFactIds({ columns: COLUMNS, sortFactFor: SORT_FACT_FOR });
    assert.ok(ids.includes('fam.room'));
    // `select` / `thumb` / `_fill` resolve nothing — a blank id in the
    // vocabulary would make every row match the empty-ish query.
    assert.ok(ids.every((id) => id.length > 0));
    assert.equal(new Set(ids).size, ids.length, 'duplicate fact ids');
  });

  it('follows the layout — unbinding a fact stops matching on it', () => {
    const withoutRoom = COLUMNS.filter((c) => c.key !== 'status:1');
    const ids = slotTableSearchFactIds({ columns: withoutRoom, sortFactFor: SORT_FACT_FOR });
    assert.ok(!ids.includes('fam.room'));
    assert.ok(ids.includes('fam.item'), 'unbinding one fact must not drop the rest');
  });

  it('covers the ADAPTER-painted facts no track names', () => {
    // The Id track stacks two identifiers and `sortFactFor` names one, so the
    // second — `identitySubFace`, the SKU under the bin code — needs its own
    // source or a typed SKU matches nothing.
    const ids = slotTableSearchFactIds({
      columns: COLUMNS,
      sortFactFor: SORT_FACT_FOR,
      adapterPaintedFieldIds: ['fam.sku'],
    });
    assert.ok(ids.includes('fam.sku'), 'the Id second line is not searchable');
    const bare = slotTableSearchFactIds({ columns: COLUMNS, sortFactFor: SORT_FACT_FOR });
    assert.ok(!bare.includes('fam.sku'));
  });
});
