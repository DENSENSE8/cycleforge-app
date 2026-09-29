/**
 * DB-free unit tests for buildSearchText — fixture rows shaped exactly like
 * the worker loader SQL aliases (see search-outbox-worker.ts LOADER_SQL).
 * Run: npx tsx --test src/lib/search/build-search-text.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchText, isSearchEntityType, SEARCH_ENTITY_TYPES } from './build-search-text';

test('ORDER: title from product_title, subtitle mirrors global-search, facets mapped', () => {
  const doc = buildSearchText('ORDER', {
    id: 42,
    order_id: '12-34567-89012',
    product_title: 'Bose SoundLink Revolve',
    sku: 'BOSE-SLR-BLK',
    account_source: 'ebay',
    status: 'Shipped',
    condition: 'USED_GOOD',
    notes: 'gift wrap',
    order_date: '2026-06-01T12:00:00Z',
    created_at: '2026-05-30T12:00:00Z',
    serials: 'SN123 SN456',
    tracking_number: '1Z999AA10123456784',
  });
  assert.equal(doc.title, 'Bose SoundLink Revolve');
  assert.equal(doc.subtitle, '12-34567-89012 · SN123 SN456 · BOSE-SLR-BLK · ebay');
  for (const needle of ['12-34567-89012', 'SN123 SN456', '1Z999AA10123456784', 'ebay', 'gift wrap']) {
    assert.ok(doc.searchText.includes(needle), `searchText missing ${needle}`);
  }
  assert.equal(doc.facets.status, 'Shipped');
  assert.equal(doc.facets.conditionGrade, 'USED_GOOD');
  assert.equal(doc.facets.sourcePlatform, 'ebay');
  assert.equal(doc.facets.happenedAt?.toISOString(), '2026-06-01T12:00:00.000Z');
});

test('ORDER: linked_trackings from shipment_links join the search text', () => {
  const doc = buildSearchText('ORDER', {
    id: 42,
    order_id: '12-34567-89012',
    product_title: 'Bose',
    tracking_number: '1Z999AA10123456784',
    linked_trackings: '9434608106244396718157',
  });
  assert.ok(doc.searchText.includes('9434608106244396718157'));
  assert.equal(doc.facets.trackingNumber, '1Z999AA10123456784');
});

test('ORDER: falls back to "Order #id" title and created_at date', () => {
  const doc = buildSearchText('ORDER', { id: 7, created_at: '2026-01-02T00:00:00Z' });
  assert.equal(doc.title, 'Order #7');
  assert.equal(doc.subtitle, null);
  assert.equal(doc.facets.happenedAt?.toISOString(), '2026-01-02T00:00:00.000Z');
});

test('SERIAL_UNIT: items.name-preferred product title wins; serial in subtitle', () => {
  const doc = buildSearchText('SERIAL_UNIT', {
    id: 9,
    serial_number: 'ABC-123',
    unit_uid: 'BOSE-2626-000001',
    sku: 'BOSE-SLR',
    product_title: 'Bose SoundLink (Zoho name)',
    current_status: 'TESTED',
    condition_grade: 'USED_FAIR',
    current_location: 'BIN-A4',
    notes: null,
    received_at: '2026-06-20T00:00:00Z',
    created_at: '2026-06-19T00:00:00Z',
    shipping_tracking_number: null,
  });
  assert.equal(doc.title, 'Bose SoundLink (Zoho name)');
  assert.equal(doc.subtitle, 'ABC-123 · BOSE-SLR · TESTED');
  assert.ok(doc.searchText.includes('BOSE-2626-000001'));
  assert.ok(doc.searchText.includes('BIN-A4'));
  assert.equal(doc.facets.conditionGrade, 'USED_FAIR');
  assert.equal(doc.facets.status, 'TESTED');
  assert.equal(doc.facets.serialNumber, 'ABC-123');
});

test('RECEIVING: adaptive title (multi SKU → PO), line items searchable, platform facet', () => {
  const doc = buildSearchText('RECEIVING', {
    id: 3,
    tracking_number: '9400111899560000000000',
    carrier: 'USPS',
    po_number: 'PO-00123',
    source_order_id: null,
    source_platform: 'ebay',
    intake_type: 'PO',
    exception_code: null,
    support_notes: 'left at dock',
    zoho_notes: null,
    quantity: '3',
    condition_grade: 'USED_GOOD',
    qa_status: 'PENDING',
    received_at: '2026-06-28T00:00:00Z',
    created_at: '2026-06-27T00:00:00Z',
    line_item_names: 'Samsung Galaxy S22 Sony WH-1000XM4',
    line_skus: 'SAM-S22 SONY-XM4',
    line_count: 2,
    distinct_sku_count: 2,
    first_item_name: 'Samsung Galaxy S22',
  });
  assert.equal(doc.title, 'ebay · PO-00123');
  assert.equal(doc.subtitle, 'PO-00123 · USPS · ebay');
  assert.ok(doc.searchText.includes('Samsung Galaxy S22'));
  assert.ok(doc.searchText.includes('SAM-S22'));
  assert.equal(doc.facets.sourcePlatform, 'ebay');
  assert.equal(doc.facets.status, 'PENDING');
  assert.equal(doc.facets.trackingNumber, '9400111899560000000000');
});

test('RECEIVING: single product → item name title', () => {
  const doc = buildSearchText('RECEIVING', {
    id: 4,
    tracking_number: '9400111899560000000001',
    carrier: 'USPS',
    po_number: 'PO-99',
    source_platform: 'ebay',
    line_count: 1,
    distinct_sku_count: 1,
    first_item_name: 'Bose Wave Music System',
    line_item_names: 'Bose Wave Music System',
    line_skus: 'BOSE-1',
    qa_status: null,
    condition_grade: null,
    received_at: null,
    created_at: '2026-06-27T00:00:00Z',
  });
  assert.equal(doc.title, 'Bose Wave Music System');
});

test('SKU: product_title title, identifiers searchable, lifecycle as status', () => {
  const doc = buildSearchText('SKU', {
    id: 11,
    sku: 'BOSE-901-IV',
    product_title: 'Bose 901 Series IV Speakers',
    category: 'Speakers',
    upc: '017817000000',
    ean: null,
    gtin: null,
    notes: 'ships freight',
    lifecycle_status: 'eol',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  });
  assert.equal(doc.title, 'Bose 901 Series IV Speakers');
  assert.equal(doc.subtitle, 'BOSE-901-IV · Speakers');
  assert.ok(doc.searchText.includes('017817000000'));
  assert.equal(doc.facets.status, 'eol');
  assert.equal(doc.facets.conditionGrade, null);
});

test('REPAIR: ticket + status subtitle; source refs searchable', () => {
  const doc = buildSearchText('REPAIR', {
    id: 5,
    ticket_number: 'RS-105',
    product_title: 'Denon AVR-X3700H',
    serial_number: 'DN998877',
    issue: 'No HDMI output',
    notes: null,
    status: 'Pending Repair',
    source_system: 'ebay',
    source_order_id: '11-22222-33333',
    source_tracking_number: null,
    source_sku: 'DENON-X3700',
    received_at: null,
    created_at: '2026-06-15T00:00:00Z',
  });
  assert.equal(doc.title, 'Denon AVR-X3700H');
  assert.equal(doc.subtitle, 'RS-105 · Pending Repair');
  assert.ok(doc.searchText.includes('No HDMI output'));
  assert.ok(doc.searchText.includes('11-22222-33333'));
  assert.equal(doc.facets.status, 'Pending Repair');
  assert.equal(doc.facets.happenedAt?.toISOString(), '2026-06-15T00:00:00.000Z');
});

test('FBA_SHIPMENT: shipment_ref title, aggregated item identifiers searchable', () => {
  const doc = buildSearchText('FBA_SHIPMENT', {
    id: 2,
    shipment_ref: 'FBA-2026-07-A',
    amazon_shipment_id: 'FBA15XYZ',
    destination_fc: 'ONT8',
    status: 'PACKING',
    notes: null,
    due_date: '2026-07-10',
    shipped_at: null,
    created_at: '2026-07-01T00:00:00Z',
    item_titles: 'Bose SoundLink Revolve',
    item_skus: 'BOSE-SLR',
    item_fnskus: 'X0012ABCDE',
    item_asins: 'B01N1RJ2C4',
  });
  assert.equal(doc.title, 'FBA-2026-07-A');
  assert.equal(doc.subtitle, 'PACKING · ONT8');
  assert.ok(doc.searchText.includes('X0012ABCDE'));
  assert.ok(doc.searchText.includes('B01N1RJ2C4'));
  assert.equal(doc.facets.sourcePlatform, 'fba');
  assert.equal(doc.facets.status, 'PACKING');
});

test('search text dedupes repeats, drops blanks, and caps length', () => {
  const doc = buildSearchText('SKU', {
    id: 1,
    sku: 'SAME',
    product_title: 'SAME',
    category: '',
    upc: null,
    notes: 'x'.repeat(5000),
  });
  assert.equal(doc.searchText.indexOf('SAME'), doc.searchText.lastIndexOf('SAME'));
  assert.ok(doc.searchText.length <= 2000);
});

test('ORDER: the order_notes trail (not just orders.notes) reaches search text', () => {
  const doc = buildSearchText('ORDER', {
    id: 7,
    order_id: '12-34567-89012',
    product_title: 'Bose SoundLink Revolve',
    sku: 'BOSE-SLR-BLK',
    notes: 'gift wrap',
    note_trail: 'buyer called about RMA 88213 customer wants the blue one',
    created_at: '2026-06-01T12:00:00Z',
  });
  assert.ok(
    doc.searchText.includes('RMA 88213'),
    'note_trail (order_notes.note_text) must be searchable',
  );
  assert.ok(doc.searchText.includes('gift wrap'), 'orders.notes column still indexed');
  // The trail is prose and goes last; identifiers must precede it so the cap
  // never eats them.
  assert.ok(doc.searchText.indexOf('12-34567-89012') < doc.searchText.indexOf('RMA 88213'));
});

test('ORDER: a serial bound by allocation (not the legacy TSN ledger) is findable', () => {
  const doc = buildSearchText('ORDER', {
    id: 9,
    order_id: 'ORD-4410',
    product_title: 'Bose QC45',
    // The legacy scan ledger contributed nothing for this order — the unit was
    // bound through order_unit_allocations, which no doc field used to read.
    serials: '',
    allocated_serials: 'SN-ALLOC-77 SN-ALLOC-78',
    notes: 'leave at door',
    created_at: '2026-06-01T12:00:00Z',
  });
  assert.ok(doc.searchText.includes('SN-ALLOC-77'), 'allocated serial must be searchable');
  assert.ok(doc.searchText.includes('SN-ALLOC-78'), 'every allocated serial, not just the first');
  // Identifier, not prose: it must sit ahead of the free-text tail the cap eats.
  assert.ok(doc.searchText.indexOf('SN-ALLOC-77') < doc.searchText.indexOf('leave at door'));
});

test('ORDER: a 5000-char note trail cannot push the buyer identity past the cap', () => {
  const doc = buildSearchText('ORDER', {
    id: 8,
    order_id: 'ORD-999',
    tracking_number: '1Z999AA10123456784',
    customer_email: 'hana@example.com',
    customer_phone: '555-0142',
    notes: 'n'.repeat(2500),
    note_trail: 'z'.repeat(2500),
    created_at: '2026-06-01T12:00:00Z',
  });
  assert.ok(doc.searchText.length <= 2000);
  for (const needle of ['ORD-999', '1Z999AA10123456784', 'hana@example.com', '555-0142']) {
    assert.ok(doc.searchText.includes(needle), `cap dropped high-selectivity ${needle}`);
  }
});

test('SERIAL_UNIT: the handling-unit (tote) code is searchable', () => {
  const doc = buildSearchText('SERIAL_UNIT', {
    id: 9,
    serial_number: 'ABC-123',
    sku: 'BOSE-SLR',
    current_location: 'BIN-A4',
    handling_unit_code: 'H-4417',
    created_at: '2026-06-19T00:00:00Z',
  });
  assert.ok(doc.searchText.includes('H-4417'), 'handling_units.code must reach search text');
  assert.equal(doc.subtitle, 'ABC-123 · BOSE-SLR', 'tote code must not enter the subtitle');
});

test('SKU: platform crosswalk and kit parts reach search text', () => {
  const doc = buildSearchText('SKU', {
    id: 11,
    sku: 'BOSE-901-IV',
    product_title: 'Bose 901 Series IV Speakers',
    category: 'Speakers',
    upc: '017817000000',
    platform_skus: 'BOSE901IV-EBAY BOSE901-FBA',
    platform_item_ids: 'B01N1RJ2C4 285512345678',
    platform_accounts: 'usav-main',
    kit_part_names: 'Power cable Equalizer module',
    kit_document_titles: '2026 warranty terms',
    notes: 'ships freight',
    lifecycle_status: 'eol',
    updated_at: '2026-06-01T00:00:00Z',
  });
  for (const needle of [
    'B01N1RJ2C4',          // ASIN
    '285512345678',        // eBay item id
    'BOSE901IV-EBAY',      // platform sku
    'usav-main',           // channel account
    'Equalizer module',    // BOM part
    '2026 warranty terms', // kit insert title
  ]) {
    assert.ok(doc.searchText.includes(needle), `searchText missing ${needle}`);
  }
  assert.equal(doc.title, 'Bose 901 Series IV Speakers');
  assert.equal(doc.subtitle, 'BOSE-901-IV · Speakers');
});

test('SKU: long catalog notes cannot truncate the platform identifiers', () => {
  const doc = buildSearchText('SKU', {
    id: 12,
    sku: 'BOSE-901-IV',
    platform_item_ids: 'B01N1RJ2C4',
    kit_part_names: 'Power cable',
    notes: 'x'.repeat(5000),
  });
  assert.ok(doc.searchText.length <= 2000);
  assert.ok(doc.searchText.includes('B01N1RJ2C4'), 'ASIN must survive the cap');
  assert.ok(doc.searchText.includes('Power cable'), 'BOM part must survive the cap');
});

test('SKU: the Zoho twin identifiers reach search text ahead of the prose cap', () => {
  const doc = buildSearchText('SKU', {
    id: 13,
    sku: 'BOSE-901-IV',
    product_title: 'Bose 901 Series IV Speakers',
    category: 'Speakers',
    upc: '017817000000',
    provider_item_id: '4728690000000212345',
    // The active items twin by sku + org (the identity law's join).
    zoho_item_title: 'Bose 901 Series IV (Zoho)',
    zoho_item_id: '4728690000000299999',
    item_upc: '017817999999',
    item_ean: '4006381333931',
    notes: 'x'.repeat(5000),
  });
  for (const needle of [
    '4728690000000212345', // catalog provider link
    '4728690000000299999', // the twin's Zoho item number
    '017817999999',        // provider UPC
    '4006381333931',       // provider EAN
    'Bose 901 Series IV (Zoho)',
  ]) {
    assert.ok(doc.searchText.includes(needle), `searchText missing ${needle}`);
  }
  assert.ok(doc.searchText.length <= 2000);
});

test('SKU: the catalog title governs over the external provider title', () => {
  const doc = buildSearchText('SKU', {
    id: 14,
    sku: 'BOSE-SLM2-BK',
    product_title: 'NEW Bose SoundLink Mini II Portable Speaker FREE SHIPPING',
    zoho_item_title: 'Bose SoundLink Mini II - Black',
    zoho_item_id: '4728690000000211111',
  });
  assert.equal(doc.title, 'NEW Bose SoundLink Mini II Portable Speaker FREE SHIPPING');
  // The provider title is still searchable text, just not the identity.
  assert.ok(doc.searchText.includes('Bose SoundLink Mini II - Black'));

  const noTwin = buildSearchText('SKU', { id: 15, sku: 'X-1', product_title: '  ', zoho_item_title: null });
  assert.equal(noTwin.title, 'X-1', 'a blank catalog title falls through to the sku');
});

test('SKU: brand name, ancestors and aliases plus the Zoho brand word are searchable; brand id is a facet', () => {
  const doc = buildSearchText('SKU', {
    id: 16,
    sku: 'BOSE-WMS-III',
    product_title: 'Wave Music System III',
    zoho_item_brand: 'Bose Corporation',
    brand_id: 7,
    // sqlSkuBrandSearchText: the Wave node + its Bose ancestor, with aliases.
    brand_text: 'Wave Bose B0SE Bose Corp',
    notes: 'y'.repeat(5000),
  });
  for (const needle of ['Wave Bose B0SE Bose Corp', 'Bose Corporation']) {
    assert.ok(doc.searchText.includes(needle), `searchText missing ${needle}`);
  }
  assert.equal(doc.facets.brandId, 7);

  const unbranded = buildSearchText('SKU', { id: 17, sku: 'CABLE-1', brand_id: null, brand_text: null });
  assert.equal(unbranded.facets.brandId, null);
});

test('ORDER / SERIAL_UNIT / RECEIVING carry their SKU brand text and brand id', () => {
  const brand = { brand_id: '7', brand_text: 'Wave Bose B0SE' };
  const docs = [
    buildSearchText('ORDER', { id: 1, order_id: 'ORD-1', sku: 'BOSE-WMS-III', ...brand }),
    buildSearchText('SERIAL_UNIT', { id: 2, serial_number: 'SN-1', sku: 'BOSE-WMS-III', ...brand }),
    buildSearchText('RECEIVING', {
      id: 3,
      line_skus: 'BOSE-WMS-III SONY-XM4',
      line_count: 2,
      distinct_sku_count: 2,
      // Every line's brand, aggregated by the loader.
      brand_id: 7,
      brand_text: 'Wave Bose B0SE Sony',
    }),
  ];
  for (const doc of docs) {
    assert.ok(doc.searchText.includes('Wave Bose B0SE'), `${doc.title}: brand text missing`);
    assert.equal(doc.facets.brandId, 7, `${doc.title}: brand id missing`);
  }
  assert.ok(docs[2].searchText.includes('Sony'), 'the second line brand is searchable too');

  const unbranded = buildSearchText('ORDER', { id: 4, order_id: 'ORD-4', sku: 'CABLE-1' });
  assert.equal(unbranded.facets.brandId, null);
});

test('LOCATION: the bin barcode leads search text; contents and state follow', () => {
  const doc = buildSearchText('LOCATION', {
    id: 5,
    barcode: 'BIN-A-12-03',
    name: 'A-12-03',
    display_name: 'Overflow A12',
    room: 'Warehouse A',
    row_label: '12',
    col_label: '03',
    zone_letter: 'A',
    bin_type: 'SHELF',
    bin_role: 'RESERVE',
    location_kind: 'BIN',
    is_active: true,
    locked_for_count: false,
    description: 'top shelf, needs a step ladder',
    content_skus: 'BOSE-901-IV SAM-S22',
    updated_at: '2026-09-10T00:00:00Z',
    created_at: '2026-04-09T00:00:00Z',
  });
  assert.ok(
    doc.searchText.startsWith('BIN-A-12-03'),
    'the printed/scanned barcode must lead the canonical text',
  );
  for (const needle of [
    'BIN-A-12-03',
    'A-12-03',
    'Overflow A12',
    'Warehouse A',
    'RESERVE',
    'BOSE-901-IV',
  ]) {
    assert.ok(doc.searchText.includes(needle), `searchText missing ${needle}`);
  }
  assert.equal(doc.title, 'Overflow A12', 'display_name wins the title');
  assert.equal(doc.subtitle, 'BIN-A-12-03 · Warehouse A · RESERVE');
  assert.equal(doc.facets.status, 'BIN');
  assert.equal(doc.facets.happenedAt?.toISOString(), '2026-09-10T00:00:00.000Z');
  assert.ok(!doc.searchText.includes('INACTIVE'));
  assert.ok(!doc.searchText.includes('LOCKED'));
});

test('LOCATION: a retired or count-locked bin stays findable and says so', () => {
  const doc = buildSearchText('LOCATION', {
    id: 6,
    barcode: 'BIN-B-01-01',
    name: 'B-01-01',
    location_kind: 'BIN',
    bin_role: 'PICK',
    is_active: false,
    locked_for_count: true,
  });
  assert.ok(doc.searchText.includes('BIN-B-01-01'));
  assert.ok(doc.searchText.includes('INACTIVE'), 'retired bin must read back as INACTIVE');
  assert.ok(doc.searchText.includes('LOCKED FOR COUNT'));
  assert.equal(doc.title, 'B-01-01', 'name carries the title when no nickname is set');
});

test('LOCATION: a barcode-only row still titles and indexes', () => {
  const doc = buildSearchText('LOCATION', { id: 7, barcode: 'BIN-Z-99' });
  assert.equal(doc.title, 'BIN-Z-99');
  assert.ok(doc.searchText.includes('BIN-Z-99'));
  assert.equal(buildSearchText('LOCATION', { id: 8 }).title, 'Bin #8');
});

test('WARRANTY_CLAIM: the claim number reaches search_text and leads it', () => {
  const doc = buildSearchText('WARRANTY_CLAIM', {
    id: 88,
    claim_number: 'WC-2026-00042',
    serial_number: 'SN-778899',
    sku: 'BOSE-SLR-BLK',
    product_title: 'Bose SoundLink Revolve',
    source_system: 'ebay',
    source_order_id: '12-34567-89012',
    source_tracking_number: '1Z999AA10123456784',
    zendesk_ticket_id: 4417,
    status: 'IN_REPAIR',
    denial_reason_code: null,
    denial_notes: null,
    notes: 'customer reports no power after 3 weeks',
    created_at: '2026-09-01T12:00:00Z',
    customer_name: 'Hana Ito',
    customer_email: 'hana@example.com',
    customer_phone: '555-0142',
  });
  // The claim number is what a caller quotes: it must be the FIRST token, so
  // no amount of prose can push it past MAX_SEARCH_TEXT.
  assert.ok(
    doc.searchText.startsWith('WC-2026-00042'),
    `claim number must lead search_text, got: ${doc.searchText.slice(0, 60)}`,
  );
  for (const needle of [
    'WC-2026-00042',
    'SN-778899',
    '12-34567-89012',
    '1Z999AA10123456784',
    '#4417',
    'Hana Ito',
    'hana@example.com',
    '555-0142',
    'no power after 3 weeks',
  ]) {
    assert.ok(doc.searchText.includes(needle), `searchText missing ${needle}`);
  }
  // Product leads the TITLE (repair precedent) so narrow rails do not crush an
  // identifier-shaped title to its last 8 characters.
  assert.equal(doc.title, 'Bose SoundLink Revolve');
  assert.equal(doc.subtitle, 'WC-2026-00042 · Hana Ito · IN_REPAIR');
  assert.equal(doc.facets.status, 'IN_REPAIR');
  assert.equal(doc.facets.sourcePlatform, 'ebay');
  assert.equal(doc.facets.serialNumber, 'SN-778899');
  assert.equal(doc.facets.trackingNumber, '1Z999AA10123456784');
  assert.equal(doc.facets.happenedAt?.toISOString(), '2026-09-01T12:00:00.000Z');
});

test('WARRANTY_CLAIM: a novel of denial notes cannot truncate the identifiers', () => {
  const doc = buildSearchText('WARRANTY_CLAIM', {
    id: 89,
    claim_number: 'WC-2026-00043',
    serial_number: 'SN-778900',
    source_order_id: '12-34567-89013',
    notes: 'n'.repeat(3000),
    denial_notes: 'd'.repeat(3000),
  });
  assert.ok(doc.searchText.length <= 2000);
  for (const needle of ['WC-2026-00043', 'SN-778900', '12-34567-89013']) {
    assert.ok(doc.searchText.includes(needle), `cap dropped high-selectivity ${needle}`);
  }
});

test('WARRANTY_CLAIM: falls back to the claim number, then "Claim #id"', () => {
  const numbered = buildSearchText('WARRANTY_CLAIM', { id: 90, claim_number: 'WC-2026-00044' });
  assert.equal(numbered.title, 'WC-2026-00044');
  const bare = buildSearchText('WARRANTY_CLAIM', { id: 91 });
  assert.equal(bare.title, 'Claim #91');
  assert.equal(bare.subtitle, null);
  assert.equal(bare.searchText, '');
});

test('SUPPORT_TICKET: the ticket number is searchable with and without the #', () => {
  const doc = buildSearchText('SUPPORT_TICKET', {
    id: 1234,
    provider: 'zendesk',
    external_ticket_id: '99871',
    subject_cache: 'Damaged on arrival — Bose 901',
    status_cache: 'open',
    created_at: '2026-08-30T09:00:00Z',
    updated_at: '2026-09-02T09:00:00Z',
  });
  // Operators read support_tickets.id as "the ticket number" and type it both
  // ways; the provider-native id is the one printed in Zendesk itself.
  for (const needle of ['#1234', '1234', '#99871', '99871', 'Damaged on arrival', 'zendesk']) {
    assert.ok(doc.searchText.includes(needle), `searchText missing ${needle}`);
  }
  assert.equal(doc.title, 'Damaged on arrival — Bose 901');
  assert.equal(doc.subtitle, '#1234 · open');
  assert.equal(doc.facets.status, 'open');
  assert.equal(doc.facets.sourcePlatform, 'zendesk');
  assert.equal(doc.facets.happenedAt?.toISOString(), '2026-09-02T09:00:00.000Z');
});

test('SUPPORT_TICKET: an unsubjected ticket still titles and indexes by number', () => {
  const doc = buildSearchText('SUPPORT_TICKET', { id: 7, provider: 'internal' });
  assert.equal(doc.title, 'Ticket #7');
  assert.equal(doc.subtitle, '#7');
  assert.ok(doc.searchText.includes('#7'));
  assert.equal(doc.facets.status, null);
  assert.equal(doc.facets.sourcePlatform, 'internal');
});

test('isSearchEntityType guards the discriminator set', () => {
  for (const t of SEARCH_ENTITY_TYPES) assert.equal(isSearchEntityType(t), true);
  assert.equal(isSearchEntityType('WALK_IN_ORDER'), false);
  assert.equal(isSearchEntityType('order'), false); // DB values are uppercase
});
