import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  csvCell,
  exportFilename,
  serializeRecords,
  serializeRows,
  tsvCell,
} from './serialize';

describe('csvCell — RFC 4180', () => {
  it('leaves an ordinary value alone', () => {
    assert.equal(csvCell('Bose Wave IV'), 'Bose Wave IV');
  });

  it('quotes a comma — a product title has them', () => {
    assert.equal(csvCell('Bose, Wave IV'), '"Bose, Wave IV"');
  });

  it('doubles an embedded quote', () => {
    assert.equal(csvCell('6" driver'), '"6"" driver"');
  });

  it('quotes a newline rather than inventing a row', () => {
    assert.equal(csvCell('line one\nline two'), '"line one\nline two"');
  });

  it('writes null and undefined as empty, never the words', () => {
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(undefined), '');
  });

  it('writes a boolean as true/false — the shape every importer reads', () => {
    assert.equal(csvCell(true), 'true');
    assert.equal(csvCell(false), 'false');
  });

  it('keeps a zero, which is a value and not a blank', () => {
    assert.equal(csvCell(0), '0');
  });
});

describe('tsvCell — the clipboard shape', () => {
  it('FLATTENS a tab instead of quoting it', () => {
    // A spreadsheet does not read quoted TSV off the clipboard, so a tab in a
    // value would silently become a new column.
    assert.equal(tsvCell('a\tb'), 'a b');
  });

  it('flattens newlines so a value cannot become a new row', () => {
    assert.equal(tsvCell('a\r\nb'), 'a b');
  });

  it('leaves a comma alone — it means nothing here', () => {
    assert.equal(tsvCell('Bose, Wave IV'), 'Bose, Wave IV');
  });
});

describe('serializeRows', () => {
  const header = ['SKU', 'Qty'];
  const rows = [
    ['ABC-1', 2],
    ['D,E', null],
  ];

  it('writes the header then the rows, CRLF for a CSV file', () => {
    assert.equal(serializeRows(header, rows, 'csv'), 'SKU,Qty\r\nABC-1,2\r\n"D,E",');
  });

  it('writes tabs and LF for the clipboard', () => {
    assert.equal(serializeRows(header, rows, 'tsv'), 'SKU\tQty\nABC-1\t2\nD,E\t');
  });

  it('defaults to CSV', () => {
    assert.equal(serializeRows(header, rows), serializeRows(header, rows, 'csv'));
  });

  it('writes a header-only file when there are no rows', () => {
    // The CONTROL is what refuses an empty export; the serializer is honest
    // about what it was handed.
    assert.equal(serializeRows(header, [], 'csv'), 'SKU,Qty');
  });

  it('escapes the header too — a field label can carry a comma', () => {
    assert.equal(serializeRows(['A,B'], [], 'csv'), '"A,B"');
  });

  it('takes any iterable, so a generator need not be materialized', () => {
    function* gen() {
      yield ['x', 1] as const;
    }
    assert.equal(serializeRows(header, gen(), 'csv'), 'SKU,Qty\r\nx,1');
  });
});

describe('serializeRecords', () => {
  it('maps keyed rows through the SAME serializer', () => {
    const rows = [{ sku: 'ABC-1', qty: 2 }];
    const columns = [
      { key: 'sku' as const, label: 'SKU' },
      { key: 'qty' as const, label: 'Qty' },
    ];
    assert.equal(serializeRecords(rows, columns, 'csv'), 'SKU,Qty\r\nABC-1,2');
  });

  it('quotes through the record path identically — one owner of quoting', () => {
    const rows = [{ title: 'Bose, Wave' }];
    const columns = [{ key: 'title' as const, label: 'Title' }];
    assert.equal(
      serializeRecords(rows, columns, 'csv'),
      serializeRows(['Title'], [['Bose, Wave']], 'csv'),
    );
  });
});

describe('exportFilename', () => {
  it('appends the format extension', () => {
    assert.equal(exportFilename('to-ship', 'csv'), 'to-ship.csv');
    assert.equal(exportFilename('to-ship', 'tsv'), 'to-ship.tsv');
  });

  it('REPLACES an extension the caller already supplied', () => {
    // Callers pass `export.csv` today; switching format must not yield
    // `export.csv.tsv`.
    assert.equal(exportFilename('export.csv', 'tsv'), 'export.tsv');
    assert.equal(exportFilename('export.CSV', 'csv'), 'export.csv');
  });

  it('leaves a dot that is not an extension alone', () => {
    assert.equal(exportFilename('2026.10.orders', 'csv'), '2026.10.orders.csv');
  });
});
