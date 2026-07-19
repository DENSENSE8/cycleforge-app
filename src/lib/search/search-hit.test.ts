/**
 * DB-free unit tests for the SearchHit SoT mappings (vocab, deep-links,
 * scope-filter hrefs).
 * Run: npx tsx --test src/lib/search/search-hit.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  facetChips,
  globalSearchHandoffHref,
  isUiEntityType,
  journeyHandoffHref,
  orderSearchHref,
  searchHitHref,
  searchScopeHref,
  searchScopeLabel,
  toDbEntityType,
  toUiEntityType,
} from './search-hit';
import { SEARCH_ENTITY_TYPES } from './build-search-text';

test('DB↔UI vocabulary round-trips for every discriminator value', () => {
  for (const dbType of SEARCH_ENTITY_TYPES) {
    const ui = toUiEntityType(dbType);
    assert.equal(isUiEntityType(ui), true);
    assert.equal(toDbEntityType(ui), dbType);
  }
});

test('searchHitHref: every entity type deep-links to its record surface', () => {
  assert.equal(searchHitHref('ORDER', 42), '/o/42?mode=search');
  assert.equal(searchHitHref('SERIAL_UNIT', 9), '/inventory/units?unit=9');
  assert.equal(searchHitHref('RECEIVING', 3), '/unbox?openReceivingId=3');
  assert.equal(searchHitHref('SKU', 11), '/products?view=qc&skuId=11');
  assert.equal(searchHitHref('REPAIR', 5), '/repair?tab=active&openRepair=5');
  assert.equal(searchHitHref('FBA_SHIPMENT', 2), '/fba?openShipmentId=2');
});

test('orderSearchHref: always opens master-nav Search mode with optional q', () => {
  assert.equal(orderSearchHref(42), '/o/42?mode=search');
  assert.equal(
    orderSearchHref(42, '111-6350504-7603458'),
    '/o/42?mode=search&q=111-6350504-7603458',
  );
  assert.equal(
    orderSearchHref('111-6350504-7603458', '111-6350504-7603458'),
    '/o/111-6350504-7603458?mode=search&q=111-6350504-7603458',
  );
});

test('journeyHandoffHref: order/unit/tracking dims; null when anchor missing', () => {
  assert.equal(
    journeyHandoffHref({ id: 42, entityType: 'order' }),
    '/operations?mode=history&dim=order&order=42',
  );
  // Unit hits always use dim=unit&unit={id} — never depend on serial facet.
  assert.equal(
    journeyHandoffHref({
      id: 9,
      entityType: 'unit',
      facets: { serial_number: 'SN-ABC-123' },
    }),
    '/operations?mode=history&dim=unit&unit=9',
  );
  assert.equal(
    journeyHandoffHref({ id: 9, entityType: 'unit', facets: {} }),
    '/operations?mode=history&dim=unit&unit=9',
  );
  assert.equal(
    journeyHandoffHref({
      id: 3,
      entityType: 'receiving',
      facets: { tracking_number: '9400111899560000000000' },
    }),
    '/operations?mode=history&dim=tracking&tracking=9400111899560000000000',
  );
  assert.equal(journeyHandoffHref({ id: 1, entityType: 'sku' }), null);
});

test('globalSearchHandoffHref: order-heavy skips /search (no flash)', () => {
  assert.equal(
    globalSearchHandoffHref('111-6350504-7603458', [{ id: 99, entityType: 'order' }]),
    '/o/99?mode=search&q=111-6350504-7603458',
  );
  assert.equal(
    globalSearchHandoffHref('111-6350504-7603458', []),
    '/o/111-6350504-7603458?mode=search&q=111-6350504-7603458',
  );
  assert.equal(
    globalSearchHandoffHref('bose remote', [
      { id: 1, entityType: 'order' },
      { id: 2, entityType: 'order' },
    ]),
    '/o/1?mode=search&q=bose+remote',
  );
  assert.equal(globalSearchHandoffHref('bose remote', []), '/dashboard?mode=search&q=bose%20remote');
  assert.equal(
    globalSearchHandoffHref('bose', [
      { id: 1, entityType: 'order' },
      { id: 2, entityType: 'sku' },
    ]),
    '/dashboard?mode=search&q=bose',
  );
});

test('globalSearchHandoffHref: Enter stays on work surfaces (never Trace)', () => {
  // Identifier with only a unit hit → order Search map (Enter default), not Trace.
  assert.equal(
    globalSearchHandoffHref('SN-ABC-12345', [
      { id: 9, entityType: 'unit', facets: { serial_number: 'SN-ABC-12345' } },
    ]),
    '/o/SN-ABC-12345?mode=search&q=SN-ABC-12345',
  );
  // Identifier matching an order → /o Search map (journey is secondary / ⌘Enter).
  assert.equal(
    globalSearchHandoffHref('9400111899561234567890', [
      {
        id: 99,
        entityType: 'order',
        facets: { tracking_number: '9400111899561234567890' },
      },
    ]),
    '/o/99?mode=search&q=9400111899561234567890',
  );
});

test('searchScopeHref: URL-searchable surfaces get the query applied; others null', () => {
  assert.equal(searchScopeHref('ORDER', 'bose revolve'), '/dashboard?search=bose%20revolve');
  assert.equal(searchScopeHref('SERIAL_UNIT', 'samsung'), '/inventory/units?q=samsung');
  assert.equal(searchScopeHref('SKU', 'wave radio'), '/inventory/skus?q=wave%20radio');
  assert.equal(searchScopeHref('RECEIVING', 'x'), null);
  assert.equal(searchScopeHref('REPAIR', 'x'), null);
  assert.equal(searchScopeHref('FBA_SHIPMENT', 'x'), null);
  assert.equal(searchScopeHref('ORDER', '   '), null); // blank query → no dead link
});

test('searchScopeLabel pairs exactly with searchScopeHref availability', () => {
  for (const dbType of SEARCH_ENTITY_TYPES) {
    const href = searchScopeHref(dbType, 'q');
    const label = searchScopeLabel(dbType);
    assert.equal(href === null, label === null, `${dbType}: href/label must agree`);
  }
});

test('facetChips: one chip per present facet, tones from the semantic families', () => {
  const chips = facetChips({ status: 'TESTED', conditionGrade: 'USED_GOOD', sourcePlatform: 'ebay' });
  assert.deepEqual(
    chips.map((c) => `${c.label}:${c.tone}`),
    ['TESTED:blue', 'USED_GOOD:amber', 'ebay:gray'],
  );
  assert.deepEqual(facetChips({}), []);
});
