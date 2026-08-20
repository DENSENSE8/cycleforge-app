import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveSpreadsheetShipByDate } from '@/lib/orders/canonical-order';
import {
  applyCsvOrderCanonicalEdits,
  autoMapCsvOrderHeaders,
  classifyCsvOrderStagingRow,
  parseCsv,
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
  const mapping = { order_number: 'Order', sku: 'SKU' };

  it('marks ready when order number and mapped SKU are present', () => {
    const { status, missing } = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: 'S1' },
      mapping,
    );
    assert.equal(status, 'ready');
    assert.deepEqual(missing, []);
  });

  it('requires order number', () => {
    const { status, missing } = classifyCsvOrderStagingRow(
      { Order: '', SKU: 'S1' },
      mapping,
    );
    assert.equal(status, 'action_required');
    assert.ok(missing.includes('order_number'));
  });

  it('requires SKU only when SKU column is mapped', () => {
    const blankSku = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: '' },
      mapping,
    );
    assert.equal(blankSku.status, 'action_required');
    assert.ok(blankSku.missing.includes('sku'));

    const noSkuMap = classifyCsvOrderStagingRow(
      { Order: 'O1' },
      { order_number: 'Order' },
    );
    assert.equal(noSkuMap.status, 'ready');
  });

  it('an item number satisfies the SKU gate — the row names its product', () => {
    // The Amazon export fills the ASIN and leaves the seller SKU blank. Without
    // this, mapping the SKU column at all would put every row in Action
    // required over an identifier the row does carry.
    const withItem = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: '', Item: 'B07JJYMMHZ' },
      { order_number: 'Order', sku: 'SKU', item_number: 'Item' },
    );
    assert.equal(withItem.status, 'ready');
    assert.deepEqual(withItem.missing, []);

    // Neither identifier ⇒ still Action required.
    const withNeither = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: '', Item: '' },
      { order_number: 'Order', sku: 'SKU', item_number: 'Item' },
    );
    assert.equal(withNeither.status, 'action_required');
    assert.ok(withNeither.missing.includes('sku'));
  });

  it('an item TITLE also satisfies the SKU gate', () => {
    // The same file's eBay rows carry neither SKU nor ASIN; the writer resolves
    // those against the catalog by product_title, so the row is importable.
    const byTitle = classifyCsvOrderStagingRow(
      { Order: 'O1', SKU: '', Item: '', Title: 'Bose Wave Music System IV' },
      { order_number: 'Order', sku: 'SKU', item_number: 'Item', item_title: 'Title' },
    );
    assert.equal(byTitle.status, 'ready');
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
    const mapping = { order_number: 'Order', sku: 'SKU' };
    const row = { Order: 'O1', SKU: '' };
    const projected = projectCsvOrderRow(row, mapping);
    assert.equal(projected.order_number, 'O1');
    assert.equal(projected.sku, '');

    const next = applyCsvOrderCanonicalEdits(row, mapping, { sku: ' FIXED ' });
    assert.equal(next.SKU, 'FIXED');
    assert.equal(classifyCsvOrderStagingRow(next, mapping).status, 'ready');
  });
});
