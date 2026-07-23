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
  narrowSearchTitleDisplay,
  orderSearchHref,
  searchHitHref,
  searchScopeHref,
  searchScopeLabel,
  shouldAutoOpenSearchOrder,
  soleMatchingOrderHit,
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
  assert.equal(
    searchHitHref('ORDER', 42),
    '/dashboard?mode=search&openOrderId=42&map=search',
  );
  assert.equal(searchHitHref('SERIAL_UNIT', 9), '/inventory/units?unit=9');
  assert.equal(searchHitHref('RECEIVING', 3), '/unbox?openReceivingId=3');
  assert.equal(searchHitHref('SKU', 11), '/products?view=qc&skuId=11');
  assert.equal(searchHitHref('REPAIR', 5), '/repair?tab=active&openRepair=5');
  assert.equal(searchHitHref('FBA_SHIPMENT', 2), '/fba?openShipmentId=2');
});

test('orderSearchHref: opens Dashboard Search detail with optional q', () => {
  assert.equal(orderSearchHref(42), '/dashboard?mode=search&openOrderId=42&map=search');
  assert.equal(
    orderSearchHref(42, '111-6350504-7603458'),
    '/dashboard?mode=search&openOrderId=42&map=search&q=111-6350504-7603458',
  );
  assert.equal(
    orderSearchHref('111-6350504-7603458', '111-6350504-7603458'),
    '/dashboard?mode=search&openOrderId=111-6350504-7603458&map=search&q=111-6350504-7603458',
  );
  assert.equal(
    orderSearchHref(42, 'x', { map: 'recent' }),
    '/dashboard?mode=search&openOrderId=42&map=recent&q=x',
  );
});

test('shouldAutoOpenSearchOrder: exact sole ORDER hit only', () => {
  assert.equal(shouldAutoOpenSearchOrder([{ entityType: 'order' }]), true);
  assert.equal(shouldAutoOpenSearchOrder([]), false);
  assert.equal(shouldAutoOpenSearchOrder([{ entityType: 'receiving' }]), false);
  assert.equal(
    shouldAutoOpenSearchOrder([{ entityType: 'order' }, { entityType: 'order' }]),
    false,
  );
  assert.equal(
    shouldAutoOpenSearchOrder([{ entityType: 'order' }, { entityType: 'unit' }]),
    false,
  );
});

test('soleMatchingOrderHit: sole ORDER whose subtitle/title contains the query', () => {
  assert.deepEqual(
    soleMatchingOrderHit(
      [
        {
          id: 5436,
          entityType: 'order',
          subtitle: '27-14721-28101 · 00210-P-1 · EBAY',
          title: 'Bose Wave',
        },
      ],
      '27-14721-28101',
    ),
    { id: 5436 },
  );
  // ORDER + RECEIVING siblings (common for eBay-style ids) still opens the order.
  assert.deepEqual(
    soleMatchingOrderHit(
      [
        {
          id: 5436,
          entityType: 'order',
          subtitle: '27-14721-28101 · EBAY',
        },
        {
          id: 5853,
          entityType: 'receiving',
          subtitle: '27-14721-32085 · PENDING',
        },
      ],
      '27-14721-28101',
    ),
    { id: 5436 },
  );
  // Numeric pk as query
  assert.deepEqual(
    soleMatchingOrderHit([{ id: 5436, entityType: 'order', subtitle: 'x' }], '5436'),
    { id: 5436 },
  );
  // Zoho PO / receiving-only → null (never force openOrderId)
  assert.equal(
    soleMatchingOrderHit(
      [{ id: 9, entityType: 'receiving', subtitle: '05-14897-15602 · PO' }],
      '05-14897-15602',
    ),
    null,
  );
  // Two matching orders → null
  assert.equal(
    soleMatchingOrderHit(
      [
        { id: 1, entityType: 'order', subtitle: '27-14721-28101' },
        { id: 2, entityType: 'order', subtitle: '27-14721-28101 · dup' },
      ],
      '27-14721-28101',
    ),
    null,
  );
  // Sole ORDER but query not in identity → null (avoid false open)
  assert.equal(
    soleMatchingOrderHit(
      [{ id: 1, entityType: 'order', subtitle: '99-00000-00000 · EBAY' }],
      '27-14721-28101',
    ),
    null,
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

test('globalSearchHandoffHref: order-heavy opens Dashboard Search detail', () => {
  assert.equal(
    globalSearchHandoffHref('111-6350504-7603458', [{ id: 99, entityType: 'order' }]),
    '/dashboard?mode=search&openOrderId=99&map=search&q=111-6350504-7603458',
  );
  assert.equal(
    globalSearchHandoffHref('111-6350504-7603458', []),
    '/dashboard?mode=search&q=111-6350504-7603458&map=search',
  );
  // Zoho PO / identifier with no ORDER preview → Search results (not forced openOrderId).
  // 05-14897-15602 is a receiving carton PO in dogfood, not a sales order_id.
  assert.equal(
    globalSearchHandoffHref('05-14897-15602', []),
    '/dashboard?mode=search&q=05-14897-15602&map=search',
  );
  assert.equal(
    globalSearchHandoffHref('05-14897-15602', [{ id: 14897, entityType: 'order' }]),
    '/dashboard?mode=search&openOrderId=14897&map=search&q=05-14897-15602',
  );
  assert.equal(
    globalSearchHandoffHref('bose remote', [
      { id: 1, entityType: 'order' },
      { id: 2, entityType: 'order' },
    ]),
    '/dashboard?mode=search&openOrderId=1&map=search&q=bose+remote',
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
  // Identifier with only a unit hit → Search results list (Enter default), not Trace.
  assert.equal(
    globalSearchHandoffHref('SN-ABC-12345', [
      { id: 9, entityType: 'unit', facets: { serial_number: 'SN-ABC-12345' } },
    ]),
    '/dashboard?mode=search&q=SN-ABC-12345&map=search',
  );
  // Identifier matching an order → Dashboard Search detail (journey is secondary / ⌘Enter).
  assert.equal(
    globalSearchHandoffHref('9400111899561234567890', [
      {
        id: 99,
        entityType: 'order',
        facets: { tracking_number: '9400111899561234567890' },
      },
    ]),
    '/dashboard?mode=search&openOrderId=99&map=search&q=9400111899561234567890',
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

test('narrowSearchTitleDisplay: long tracking-shaped titles abbreviate to last-4', () => {
  const tracking = '9434608101234567890123';
  const out = narrowSearchTitleDisplay(tracking);
  assert.equal(out.abbreviated, true);
  assert.equal(out.full, tracking);
  assert.equal(out.display, '0123');
});

test('narrowSearchTitleDisplay: product titles with spaces stay full', () => {
  const title = 'Bose Wave Series III / IV Console';
  const out = narrowSearchTitleDisplay(title);
  assert.equal(out.abbreviated, false);
  assert.equal(out.display, title);
  assert.equal(out.full, title);
});

test('narrowSearchTitleDisplay: short identifiers stay full', () => {
  const out = narrowSearchTitleDisplay('940011');
  assert.equal(out.abbreviated, false);
  assert.equal(out.display, '940011');
});

test('narrowSearchTitleDisplay: human order ids under the min length stay full', () => {
  // 11 chars with digits — identifier-shaped but below NARROW_ID_TITLE_MIN (12).
  const out = narrowSearchTitleDisplay('27-14721-28');
  assert.equal(out.abbreviated, false);
  assert.equal(out.display, '27-14721-28');
});

test('narrowSearchTitleDisplay: long human order ids abbreviate to last-4', () => {
  const id = '27-14721-28101';
  const out = narrowSearchTitleDisplay(id);
  assert.equal(out.abbreviated, true);
  assert.equal(out.display, '8101');
  assert.equal(out.full, id);
});
