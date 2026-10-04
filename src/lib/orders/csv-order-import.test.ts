import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveSpreadsheetShipByDate } from '@/lib/orders/canonical-order';
import {
  applyCsvOrderCanonicalEdits,
  autoMapCsvOrderHeaders,
  classifyCsvOrderStagingRow,
  parseCsv,
  postCsvOrderImport,
  projectCsvOrderRow,
} from '@/lib/orders/csv-order-import';

describe('parseCsv', () => {
  it('parses headers and rows with quoted commas', () => {
    const text = 'Order,SKU,Name\n"A,1",SKU1,"Doe, Jane"\nB2,SKU2,Bob\n';
    const { headers, rows } = parseCsv(text);
    assert.deepEqual(headers, ['Order', 'SKU', 'Name']);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].Order, 'A,1');
    assert.equal(rows[0].Name, 'Doe, Jane');
    assert.equal(rows[1].SKU, 'SKU2');
  });

  it('returns empty for blank input', () => {
    assert.deepEqual(parseCsv(''), { headers: [], rows: [] });
  });
});

describe('autoMapCsvOrderHeaders', () => {
  it('maps common aliases', () => {
    const mapping = autoMapCsvOrderHeaders([
      'Order ID',
      'SKU',
      'Item Number',
      'Qty',
      'Buyer',
      'Tracking',
      'Channel',
    ]);
    assert.equal(mapping.order_number, 'Order ID');
    assert.equal(mapping.sku, 'SKU');
    assert.equal(mapping.item_number, 'Item Number');
    assert.equal(mapping.quantity, 'Qty');
    assert.equal(mapping.customer_name, 'Buyer');
    assert.equal(mapping.tracking_number, 'Tracking');
    assert.equal(mapping.platform, 'Channel');
  });

  it('sends "Item Number" to item_number, NOT sku', () => {
    // It moved off the sku aliases when item_number gained a field: an ASIN /
    // listing id resolves through sku_platform_ids.platform_item_id, a path the
    // sku lookup cannot reach, so landing it in `sku` guaranteed a catalog miss.
    const mapping = autoMapCsvOrderHeaders(['Order Number', 'Item Number']);
    assert.equal(mapping.item_number, 'Item Number');
    assert.equal(mapping.sku, undefined);
  });

  it('no header is claimed by two canonical fields', () => {
    const headers = [
      'Order Number', 'SKU', 'Item Number', 'Quantity',
      'Buyer Name', 'Tracking', 'Platform', 'ASIN', 'Item No',
    ];
    const mapping = autoMapCsvOrderHeaders(headers);
    const claimed = Object.values(mapping);
    assert.equal(new Set(claimed).size, claimed.length);
  });

  it('maps the real Amazon order-list export', () => {
    const mapping = autoMapCsvOrderHeaders([
      'Platform', 'Order Number', 'Buyer Name', 'Item title', 'USAV SKU',
      'Quantity', 'Ship by date', 'Item Number', 'Tracking', 'Condition',
      'Note', 'Assigne',
    ]);
    assert.equal(mapping.order_number, 'Order Number');
    assert.equal(mapping.item_number, 'Item Number');
    assert.equal(mapping.item_title, 'Item title');
    assert.equal(mapping.platform, 'Platform');
    assert.equal(mapping.customer_name, 'Buyer Name');
    assert.equal(mapping.tracking_number, 'Tracking');
    assert.equal(mapping.condition, 'Condition');
    assert.equal(mapping.ship_by_date, 'Ship by date');
    assert.equal(mapping.note, 'Note');
    // "USAV SKU" is tenant-specific and matches no alias — mapped by hand, and
    // deliberately NOT auto-claimed, or a blank column would gate every row.
    assert.equal(mapping.sku, undefined);
    // 10 of the file's 12 columns bind; only "USAV SKU" and "Assigne" (which
    // has no canonical destination) fall through.
    assert.equal(Object.keys(mapping).length, 10);
  });
});

describe('classifyCsvOrderStagingRow', () => {
  // Platform column present in these fixtures so each test pins ONLY the SKU /
  // order-number gate it is about — the platform-acknowledgment rule has its
  // own describe below.
  const mapping = { order_number: 'Order', sku: 'SKU', platform: 'Platform' };

  it('marks ready when order number and mapped SKU are present', () => {
    const { status, missing } = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: 'S1', Platform: 'ebay' },
      mapping,
    );
    assert.equal(status, 'ready');
    assert.deepEqual(missing, []);
  });

  it('requires order number', () => {
    const { status, missing } = classifyCsvOrderStagingRow(
      { Order: '', SKU: 'S1', Platform: 'ebay' },
      mapping,
    );
    assert.equal(status, 'action_required');
    assert.ok(missing.includes('order_number'));
  });

  it('requires SKU only when SKU column is mapped', () => {
    const blankSku = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: '', Platform: 'ebay' },
      mapping,
    );
    assert.equal(blankSku.status, 'action_required');
    assert.ok(blankSku.missing.includes('sku'));

    const noSkuMap = classifyCsvOrderStagingRow(
      { Order: 'O1', Platform: 'ebay' },
      { order_number: 'Order', platform: 'Platform' },
    );
    assert.equal(noSkuMap.status, 'ready');
  });

  it('an item number satisfies the SKU gate — the row names its product', () => {
    // The Amazon export fills the ASIN and leaves the seller SKU blank. Without
    // this, mapping the SKU column at all would put every row in Action
    // required over an identifier the row does carry.
    const withItem = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: '', Item: 'B07JJYMMHZ', Platform: 'amazon' },
      { order_number: 'Order', sku: 'SKU', item_number: 'Item', platform: 'Platform' },
    );
    assert.equal(withItem.status, 'ready');
    assert.deepEqual(withItem.missing, []);

    // Neither identifier ⇒ still Action required.
    const withNeither = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: '', Item: '', Platform: 'amazon' },
      { order_number: 'Order', sku: 'SKU', item_number: 'Item', platform: 'Platform' },
    );
    assert.equal(withNeither.status, 'action_required');
    assert.ok(withNeither.missing.includes('sku'));
  });

  it('an item TITLE also satisfies the SKU gate', () => {
    // The same file's eBay rows carry neither SKU nor ASIN; the writer resolves
    // those against the catalog by product_title, so the row is importable.
    const byTitle = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: '', Item: '', Title: 'Bose Wave Music System IV', Platform: 'ebay' },
      {
        order_number: 'Order',
        sku: 'SKU',
        item_number: 'Item',
        item_title: 'Title',
        platform: 'Platform',
      },
    );
    assert.equal(byTitle.status, 'ready');
  });
});

describe('classifyCsvOrderStagingRow — platform acknowledgment', () => {
  it('an Amazon-shaped order number is ready with NO platform column at all', () => {
    const { status, missing } = classifyCsvOrderStagingRow(
      { Order: '111-1234567-1234567' },
      { order_number: 'Order' },
    );
    assert.equal(status, 'ready');
    assert.deepEqual(missing, []);
  });

  it('an eBay-shaped order number is ready with a mapped but blank platform', () => {
    const { status } = classifyCsvOrderStagingRow(
      { Order: '03-15100-78272', Platform: '' },
      { order_number: 'Order', platform: 'Platform' },
    );
    assert.equal(status, 'ready');
  });

  it('an unknown-shaped id with blank platform is action_required, missing platform', () => {
    const { status, missing } = classifyCsvOrderStagingRow(
      { Order: 'CFLOOP-abc123', Platform: '' },
      { order_number: 'Order', platform: 'Platform' },
    );
    assert.equal(status, 'action_required');
    assert.deepEqual(missing, ['platform']);
  });

  it('an unknown-shaped id with a platform value stays ready', () => {
    const { status } = classifyCsvOrderStagingRow(
      { Order: 'CFLOOP-abc123', Platform: 'ecwid' },
      { order_number: 'Order', platform: 'Platform' },
    );
    assert.equal(status, 'ready');
  });

  it('a missing order number does not ALSO complain about platform', () => {
    const { missing } = classifyCsvOrderStagingRow(
      { Order: '' },
      { order_number: 'Order' },
    );
    assert.deepEqual(missing, ['order_number']);
  });
});

describe('parcel + assignee columns (Order Intake & Acknowledgment)', () => {
  it('maps the weight / dimension / assignee aliases', () => {
    const mapping = autoMapCsvOrderHeaders([
      'Order Number', 'Weight', 'Length', 'Width', 'Height', 'Tester', 'Packer',
    ]);
    assert.equal(mapping.weight_oz, 'Weight');
    assert.equal(mapping.dim_l, 'Length');
    assert.equal(mapping.dim_w, 'Width');
    assert.equal(mapping.dim_h, 'Height');
    assert.equal(mapping.assignee_tech, 'Tester');
    assert.equal(mapping.assignee_packer, 'Packer');
  });

  it('projects the new keys through the mapping', () => {
    const projected = projectCsvOrderRow(
      { Order: '111-1234567-1234567', Weight: '18', Length: '12', Width: '9', Height: '4' },
      {
        order_number: 'Order',
        weight_oz: 'Weight',
        dim_l: 'Length',
        dim_w: 'Width',
        dim_h: 'Height',
      },
    );
    assert.equal(projected.weight_oz, '18');
    assert.equal(projected.dim_l, '12');
    assert.equal(projected.dim_w, '9');
    assert.equal(projected.dim_h, '4');
  });
});

describe('the four columns that used to be dropped', () => {
  const mapping = {
    order_number: 'Order Number',
    item_title: 'Item title',
    condition: 'Condition',
    ship_by_date: 'Ship by date',
    note: 'Note',
  };

  it('projects item title, condition, ship-by and note', () => {
    const projected = projectCsvOrderRow(
      {
        'Order Number': '112-2425073-6778624',
        'Item title': 'BOSE Solo 5 TV Soundbar',
        Condition: 'USED',
        'Ship by date': '8/19/2026',
        Note: 'VN Team — Ajax bought label from AMZ',
      },
      mapping,
    );
    assert.equal(projected.item_title, 'BOSE Solo 5 TV Soundbar');
    assert.equal(projected.condition, 'USED');
    assert.equal(projected.ship_by_date, '8/19/2026');
    assert.equal(projected.note, 'VN Team — Ajax bought label from AMZ');
  });

  it('resolves a M/D/YYYY ship-by to the END of that warehouse day', () => {
    // Not UTC midnight (which is the PREVIOUS afternoon in the warehouse zone)
    // and not "today" when blank — the shared spreadsheet rule.
    const resolved = resolveSpreadsheetShipByDate('8/19/2026');
    assert.equal(resolved?.toISOString(), '2026-08-20T06:59:59.999Z');
    assert.equal(resolveSpreadsheetShipByDate(''), null);
  });
});

describe('project + apply edits', () => {
  it('round-trips canonical edits onto raw headers', () => {
    // Amazon-shaped order number: the classify below checks ONLY the SKU fix,
    // not the platform-acknowledgment rule.
    const mapping = { order_number: 'Order', sku: 'SKU' };
    const row = { Order: '111-1234567-1234567', SKU: '' };
    const projected = projectCsvOrderRow(row, mapping);
    assert.equal(projected.order_number, '111-1234567-1234567');
    assert.equal(projected.sku, '');

    const next = applyCsvOrderCanonicalEdits(row, mapping, { sku: ' FIXED ' });
    assert.equal(next.SKU, 'FIXED');
    assert.equal(classifyCsvOrderStagingRow(next, mapping).status, 'ready');
  });
});

describe('postCsvOrderImport', () => {
  it('preserves inserted order ids returned by the import API', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          inserted: 1,
          insertedOrderIds: [42],
          updated: 0,
          skipped: 0,
          errors: [],
          resolvedExceptions: 2,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )) as typeof fetch;

    try {
      const result = await postCsvOrderImport({ rows: [], mapping: {} });
      assert.deepEqual(result, {
        ok: true,
        result: { inserted: 1, insertedOrderIds: [42], updated: 0, skipped: 0, errors: [], resolvedExceptions: 2 },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
