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
  orderRecordHref,
  isUiEntityType,
  journeyHandoffHref,
  narrowSearchTitleDisplay,
  searchHitHref,
  searchScopeHref,
  searchScopeLabel,
  globalSearchHref,
  shouldAutoOpenSearchOrder,
  soleHitHref,
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
    '/o/42',
  );
  assert.equal(searchHitHref('SERIAL_UNIT', 9), '/inventory/units?unit=9');
  assert.equal(searchHitHref('RECEIVING', 3), '/carton/3');
  assert.equal(searchHitHref('SKU', 11), '/products?view=qc&skuId=11');
  assert.equal(searchHitHref('REPAIR', 5), '/repair?tab=active&openRepair=5');
  assert.equal(searchHitHref('FBA_SHIPMENT', 2), '/fba?openShipmentId=2');
});

// One order shell: an ORDER hit resolves to the same href every other opener
// uses. The retired `orderSearchHref` built a second one on a dashboard mode.
test('searchHitHref: an ORDER hit is the order record page', () => {
  assert.equal(searchHitHref('ORDER', 42), '/o/42');
  assert.equal(orderRecordHref(42), '/o/42');
  assert.equal(orderRecordHref(' 111-6350504-7603458 '), '/o/111-6350504-7603458');
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

test('globalSearchHandoffHref: identifier + one order hit jumps to the record (D4a)', () => {
  // One confident hit → `/o/[id]`, the canonical record. A results list of one
  // is a failure to recognize intent.
  assert.equal(
    globalSearchHandoffHref('111-6350504-7603458', [{ id: 99, entityType: 'order' }]),
    '/o/99',
  );
  assert.equal(
    globalSearchHandoffHref('111-6350504-7603458', []),
    '/search?q=111-6350504-7603458',
  );
  // Zoho PO / identifier with no ORDER preview → Search results (not forced openOrderId).
  // 05-14897-15602 is a receiving carton PO in dogfood, not a sales order_id.
  assert.equal(
    globalSearchHandoffHref('05-14897-15602', []),
    '/search?q=05-14897-15602',
  );
  assert.equal(
    globalSearchHandoffHref('05-14897-15602', [{ id: 14897, entityType: 'order' }]),
    '/o/14897',
  );
  // Identifier with SEVERAL order candidates → the top one. There is no longer
  // a "search shell + hit-map rail" to keep them in; the results ARE the list,
  // and Enter commits to the best candidate rather than parking on a page the
  // operator has to click again.
  assert.equal(
    globalSearchHandoffHref('05-14897-15602', [
      { id: 14897, entityType: 'order' },
      { id: 14898, entityType: 'order' },
    ]),
    '/o/14897',
  );
  assert.equal(
    globalSearchHandoffHref('bose remote', [
      { id: 1, entityType: 'order' },
      { id: 2, entityType: 'order' },
    ]),
    '/o/1',
  );
  assert.equal(globalSearchHandoffHref('bose remote', []), '/search?q=bose%20remote');
  assert.equal(
    globalSearchHandoffHref('bose', [
      { id: 1, entityType: 'order' },
      { id: 2, entityType: 'sku' },
    ]),
    '/search?q=bose',
  );
});

test('globalSearchHandoffHref: Enter stays on work surfaces (never Trace)', () => {
  // Identifier with only a unit hit → Search results list (Enter default), not Trace.
  assert.equal(
    globalSearchHandoffHref('SN-ABC-12345', [
      { id: 9, entityType: 'unit', facets: { serial_number: 'SN-ABC-12345' } },
    ]),
    '/search?q=SN-ABC-12345',
  );
  // Identifier matching one order → the canonical record (journey stays secondary / ⌘Enter).
  assert.equal(
    globalSearchHandoffHref('9400111899561234567890', [
      {
        id: 99,
        entityType: 'order',
        facets: { tracking_number: '9400111899561234567890' },
      },
    ]),
    '/o/99',
  );
});

test('orderRecordHref: canonical record path, encoded', () => {
  assert.equal(orderRecordHref(99), '/o/99');
  assert.equal(orderRecordHref(' 14897 '), '/o/14897');
  // Human order ids reach the route param intact.
  assert.equal(orderRecordHref('111-6350504-7603458'), '/o/111-6350504-7603458');
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

test('soleHitHref: one hit of ANY type opens; a real list never does', () => {
  // The whole point: `shouldAutoOpenSearchOrder` only covered orders, so a
  // search that settled on a single carton parked the operator on a one-row
  // list. One row is not a choice.
  assert.equal(
    soleHitHref([{ id: 50200, entityType: 'receiving' }]),
    '/carton/50200',
  );
  assert.equal(soleHitHref([{ id: 12, entityType: 'unit' }]), '/inventory/units?unit=12');
  assert.equal(soleHitHref([{ id: 9, entityType: 'repair' }]), '/repair?tab=active&openRepair=9');

  // 0 or 2+ hits are a genuine list — never force a destination.
  assert.equal(soleHitHref([]), null);
  assert.equal(
    soleHitHref([
      { id: 1, entityType: 'order' },
      { id: 2, entityType: 'receiving' },
    ]),
    null,
  );
});

test('soleHitHref: refuses an unusable id or an unknown vocabulary', () => {
  assert.equal(soleHitHref([{ id: 0, entityType: 'receiving' }]), null);
  assert.equal(soleHitHref([{ id: -3, entityType: 'receiving' }]), null);
  assert.equal(soleHitHref([{ id: Number.NaN, entityType: 'receiving' }]), null);
  assert.equal(soleHitHref([{ id: 5, entityType: 'not_a_thing' }]), null);
});

test('globalSearchHref: the /search route with the query pre-applied', () => {
  assert.equal(globalSearchHref('19-14910-41811'), '/search?q=19-14910-41811');
  // Trimmed + encoded — a PO with a space or slash must not break the URL.
  assert.equal(globalSearchHref('  a b/c '), '/search?q=a%20b%2Fc');
  assert.equal(globalSearchHref('bose remote'), '/search?q=bose%20remote');
  // No query at all is the bare surface, never a dangling `?q=`.
  assert.equal(globalSearchHref('   '), '/search');
});
