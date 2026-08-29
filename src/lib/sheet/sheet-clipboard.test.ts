import assert from 'node:assert/strict';
import test from 'node:test';

import { escapeTsvCell, sheetCopyToastMessage, toSheetTsv } from './sheet-clipboard';

interface Row {
  order: string;
  title: string;
  amount: number | null;
}

const ROWS: Row[] = [
  { order: '09-69683', title: 'Bose Wave Music System', amount: 0 },
  { order: '97-37260', title: 'Bose UFS-20 Floor Stands', amount: null },
];

const COLUMNS = [
  { key: 'order', label: 'Order', copyValue: (r: Row) => r.order },
  { key: 'title', label: 'Item', copyValue: (r: Row) => r.title },
  { key: 'amount', label: 'Amount', copyValue: (r: Row) => r.amount },
];

test('serialises header + rows tab-separated', () => {
  const tsv = toSheetTsv(ROWS, COLUMNS);
  assert.equal(
    tsv,
    [
      'Order\tItem\tAmount',
      '09-69683\tBose Wave Music System\t0',
      '97-37260\tBose UFS-20 Floor Stands\t',
    ].join('\n'),
  );
});

test('a tab or newline inside a value cannot forge a cell or a row', () => {
  // The one way a copy silently corrupts the operator's sheet.
  assert.equal(escapeTsvCell('a\tb'), 'a b');
  assert.equal(escapeTsvCell('a\nb'), 'a b');
  assert.equal(escapeTsvCell('a\r\nb'), 'a b');
  const tsv = toSheetTsv([{ order: 'x\ty', title: 'p\nq', amount: 1 }], COLUMNS);
  assert.equal(tsv.split('\n').length, 2, 'still exactly header + one row');
  assert.equal(tsv.split('\n')[1]!.split('\t').length, 3, 'still exactly three cells');
});

test('null and undefined become empty cells, not the string "null"', () => {
  assert.equal(escapeTsvCell(null), '');
  assert.equal(escapeTsvCell(undefined), '');
});

test('zero is copied as 0, not dropped as falsy', () => {
  assert.equal(escapeTsvCell(0), '0');
});

test('a column with no copyValue yields an empty cell rather than throwing', () => {
  const tsv = toSheetTsv(ROWS, [{ key: 'photo', label: 'Photo' }]);
  assert.equal(tsv, 'Photo\n\n');
});

test('no columns yields nothing to paste', () => {
  assert.equal(toSheetTsv(ROWS, []), '');
});

test('label falls back to key when a column heads with a glyph', () => {
  assert.equal(toSheetTsv([], [{ key: 'flag' }]), 'flag');
});

test('toast message pluralises', () => {
  assert.equal(sheetCopyToastMessage(1), 'Copied 1 row');
  assert.equal(sheetCopyToastMessage(38), 'Copied 38 rows');
  assert.equal(sheetCopyToastMessage(0), 'Copied 0 rows');
});
