import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autoMapCatalogImportHeaders,
  catalogImportLookupSkus,
  cleanedCatalogCsv,
  planCatalogImport,
  type CatalogImportContext,
} from './catalog-import';

const CONTEXT: CatalogImportContext = {
  catalogTitles: new Map([
    ['00052', 'Bose Lifestyle 20 Music Center'],
    ['36', 'Silver Metalic Permanent Markers 36 Packs'],
    ['00185', 'Bose Lifestyle System'],
  ]),
  mirrorItemIds: new Map([['01113', '5623409000001876359']]),
};

test('a retired [OLD] row is dropped whatever its SKU, and never counts toward the catalog', () => {
  const plan = planCatalogImport(
    [
      { sku: '', title: '[OLD] - Bose Wave Music System III - Limited-Edition Blue' },
      { sku: '00777', title: '[old] - Retired adapter' },
    ],
    CONTEXT,
  );
  assert.deepEqual(plan.rows.map((r) => r.outcome), ['old', 'old']);
  assert.equal(plan.summary.old, 2);
  assert.equal(plan.summary.new, 0);
});

test('a 1–4 digit SKU gets its zeros back unless it exists as written; longer or mixed SKUs are untouched', () => {
  const plan = planCatalogImport(
    [
      { sku: '1113', title: 'BOSE DT20V-1.8C-DC 20V 1.8A power adapter' },
      { sku: '36', title: 'Silver Metalic Permanent Markers 36 Packs' },
      { sku: '7', title: 'Seven' },
      { sku: '12345', title: 'Five digits' },
      { sku: '123456', title: 'Six digits' },
      { sku: '00148-P-10', title: 'Cable' },
    ],
    CONTEXT,
  );
  assert.deepEqual(
    plan.rows.map((r) => [r.rawSku, r.sku, r.padded]),
    [
      ['1113', '01113', true],
      ['36', '36', false],
      ['7', '00007', true],
      ['12345', '12345', false],
      ['123456', '123456', false],
      ['00148-P-10', '00148-P-10', false],
    ],
  );
  assert.equal(plan.summary.padded, 2);
  assert.ok(catalogImportLookupSkus([{ sku: '52' }]).includes('00052'), 'the planner looks the padded form up');
});

test('the catalog title governs: same name (any spacing or case) is present, a different one is a conflict, never new', () => {
  const plan = planCatalogImport(
    [
      { sku: '52', title: '  bose lifestyle 20   MUSIC center ' },
      { sku: '185', title: 'DVD Drive IDE for Bose Lifestyle 18 28 38 48' },
    ],
    CONTEXT,
  );
  assert.deepEqual(plan.rows.map((r) => [r.sku, r.outcome, r.catalogTitle]), [
    ['00052', 'present', 'Bose Lifestyle 20 Music Center'],
    ['00185', 'title_differs', 'Bose Lifestyle System'],
  ]);
});

test('a SKU twice in one file (also once zero-stripped) is added once; the later row is a duplicate', () => {
  const plan = planCatalogImport(
    [
      { sku: '01026', title: 'USAV RCA to HDMI Converter Kit' },
      { sku: '1026', title: 'USAV RCA to HDMI Converter Kit' },
    ],
    CONTEXT,
  );
  assert.deepEqual(plan.rows.map((r) => r.outcome), ['new', 'duplicate']);
});

test('a row with no SKU or no title is reported, never added', () => {
  const plan = planCatalogImport(
    [
      { sku: '', title: 'shipping and handling' },
      { sku: '00999', title: '   ' },
    ],
    CONTEXT,
  );
  assert.deepEqual(plan.rows.map((r) => r.outcome), ['no_sku', 'no_title']);
});

test("the Zoho item id is the row's real id, else the mirror's — never a spreadsheet's scientific notation", () => {
  const plan = planCatalogImport(
    [
      { sku: '1113', title: 'Adapter', zohoItemId: '5.62341E+18' },
      { sku: '00900', title: 'Speaker', zohoItemId: '5623409000001858252' },
      { sku: '00901', title: 'Remote', zohoItemId: '' },
    ],
    CONTEXT,
  );
  assert.deepEqual(plan.rows.map((r) => r.zohoItemId), ['5623409000001876359', '5623409000001858252', null]);
});

test('the cleaned file drops [OLD] rows, writes the padded SKU and the real item id, and keeps every other column', () => {
  const headers = ['ITEM_ID', 'Name', 'SKU', 'Stock On Hand'];
  const raw = [
    { ITEM_ID: '5.62341E+18', Name: 'Adapter, 20V', SKU: '1113', 'Stock On Hand': "'-1,102.00" },
    { ITEM_ID: '5.62341E+18', Name: '[OLD] - Retired', SKU: '', 'Stock On Hand': '0' },
  ];
  const plan = planCatalogImport(
    raw.map((r) => ({ sku: r.SKU, title: r.Name, zohoItemId: r.ITEM_ID })),
    CONTEXT,
  );
  assert.equal(
    cleanedCatalogCsv(headers, raw, { sku: 'SKU', zohoItemId: 'ITEM_ID' }, plan),
    `ITEM_ID,Name,SKU,Stock On Hand\r\n5623409000001876359,"Adapter, 20V",01113,"'-1,102.00"\r\n`,
  );
});

test('a Zoho Items export binds by header name; the name column outranks a description column', () => {
  assert.deepEqual(autoMapCatalogImportHeaders(['Description', 'ITEM_ID', 'Item Name', 'SKU', 'UPC', 'Stock On Hand']), {
    sku: 'SKU',
    title: 'Item Name',
    zohoItemId: 'ITEM_ID',
    upc: 'UPC',
  });
  assert.deepEqual(autoMapCatalogImportHeaders(['Product Title', 'Name', 'SKU']).title, 'Name');
});
