import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  EMPTY_UNBOX_RAIL_FACETS,
  matchesUnboxRailFacets,
  unboxRailFacetsHot,
} from '@/lib/receiving/rail/unbox-rail-facets';

function row(overrides: Partial<ReceivingLineRow> = {}): ReceivingLineRow {
  return {
    id: 1,
    receiving_id: 1,
    receiving_type: 'PO',
    source_platform: 'amazon',
    is_priority: false,
    priority_tier: null,
    receiving_source: 'zoho_po',
    ...overrides,
  } as ReceivingLineRow;
}

test('empty facets keep every row', () => {
  assert.equal(matchesUnboxRailFacets(row(), EMPTY_UNBOX_RAIL_FACETS), true);
  assert.equal(unboxRailFacetsHot(EMPTY_UNBOX_RAIL_FACETS), false);
});

test('platform facet matches source_platform', () => {
  assert.equal(
    matchesUnboxRailFacets(row({ source_platform: 'amazon' }), {
      ...EMPTY_UNBOX_RAIL_FACETS,
      platform: 'amazon',
    }),
    true,
  );
  assert.equal(
    matchesUnboxRailFacets(row({ source_platform: 'ebay' }), {
      ...EMPTY_UNBOX_RAIL_FACETS,
      platform: 'amazon',
    }),
    false,
  );
});

test('type facet matches receiving_type', () => {
  assert.equal(
    matchesUnboxRailFacets(row({ receiving_type: 'RETURN' }), {
      ...EMPTY_UNBOX_RAIL_FACETS,
      receivingType: 'RETURN',
    }),
    true,
  );
  assert.equal(
    matchesUnboxRailFacets(row({ receiving_type: 'PO' }), {
      ...EMPTY_UNBOX_RAIL_FACETS,
      receivingType: 'RETURN',
    }),
    false,
  );
});

test('priority facet uses effective tier (Amazon → High)', () => {
  assert.equal(
    matchesUnboxRailFacets(row({ source_platform: 'amazon', priority_tier: null }), {
      ...EMPTY_UNBOX_RAIL_FACETS,
      priorityTier: 1,
    }),
    true,
  );
  assert.equal(
    matchesUnboxRailFacets(row({ source_platform: 'amazon', priority_tier: null }), {
      ...EMPTY_UNBOX_RAIL_FACETS,
      priorityTier: 0,
    }),
    false,
  );
  assert.equal(
    matchesUnboxRailFacets(row({ priority_tier: 0 }), {
      ...EMPTY_UNBOX_RAIL_FACETS,
      priorityTier: 0,
    }),
    true,
  );
});
