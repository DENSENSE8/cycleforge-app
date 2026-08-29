import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_COLUMN_FORMAT,
  SHEET_FILL_SWATCH_KEYS,
  SHEET_TEXT_SWATCH_KEYS,
  applyColumnFormatAlign,
  columnFormatClass,
  isEmptyColumnFormat,
  isSheetFillSwatch,
  isSheetTextSwatch,
  type ColumnFormat,
} from './column-formats';

function format(partial: Partial<ColumnFormat>): ColumnFormat {
  return { ...EMPTY_COLUMN_FORMAT, ...partial };
}

test('an unformatted column emits no classes at all', () => {
  // The DOM of an unformatted grid must be byte-identical to what it was before
  // this feature existed — that is what keeps the border constraint diffable.
  assert.equal(columnFormatClass(undefined), '');
  assert.equal(columnFormatClass(EMPTY_COLUMN_FORMAT), '');
});

test('marks resolve to their type classes', () => {
  assert.equal(columnFormatClass(format({ bold: true })), 'font-semibold');
  assert.equal(columnFormatClass(format({ italic: true })), 'italic');
  assert.equal(columnFormatClass(format({ strike: true })), 'line-through');
  assert.equal(
    columnFormatClass(format({ bold: true, italic: true, strike: true })),
    'font-semibold italic line-through',
  );
});

test('colours resolve through the token vocabulary, never a literal', () => {
  const cls = columnFormatClass(format({ textColor: 'danger', fillColor: 'warning' }));
  assert.ok(cls.includes('text-text-danger'));
  assert.ok(cls.includes('bg-surface-warning'));
  assert.ok(!/#[0-9a-f]{3,8}/i.test(cls), 'no hex may reach the class string');
});

test('an unknown colour key is ignored rather than emitted', () => {
  // The API rejects these, but a row written before a swatch was renamed must
  // degrade to "no colour", never to a class that does not exist.
  assert.equal(columnFormatClass(format({ textColor: 'chartreuse' })), '');
  assert.equal(columnFormatClass(format({ fillColor: 'chartreuse' })), '');
});

test('fill "none" contributes nothing', () => {
  assert.equal(columnFormatClass(format({ fillColor: 'none' })), '');
});

test('swatch guards accept exactly their own vocabulary', () => {
  for (const key of SHEET_TEXT_SWATCH_KEYS) assert.ok(isSheetTextSwatch(key));
  for (const key of SHEET_FILL_SWATCH_KEYS) assert.ok(isSheetFillSwatch(key));
  assert.ok(!isSheetTextSwatch('#ff0000'));
  assert.ok(!isSheetFillSwatch(null));
  assert.ok(!isSheetTextSwatch(undefined));
});

test('isEmptyColumnFormat treats fill "none" as empty', () => {
  assert.ok(isEmptyColumnFormat(EMPTY_COLUMN_FORMAT));
  assert.ok(isEmptyColumnFormat(format({ fillColor: 'none' })));
  assert.ok(!isEmptyColumnFormat(format({ bold: true })));
  assert.ok(!isEmptyColumnFormat(format({ align: 'center' })));
});

test('align override layers over the derived value', () => {
  const columns = [
    { key: 'order', align: 'left' as const },
    { key: 'amount', align: 'right' as const },
  ];
  const next = applyColumnFormatAlign(columns, {
    amount: format({ align: 'center' }),
  });
  assert.equal(next[0]!.align, 'left', 'untouched column keeps its derived align');
  assert.equal(next[1]!.align, 'center');
});

test('align returns the SAME array when nothing overrides', () => {
  // Identity matters: this runs inside the descriptor memo, and a fresh array
  // every render would rebuild the TanStack column list on every render.
  const columns = [{ key: 'order', align: 'left' as const }];
  assert.equal(applyColumnFormatAlign(columns, undefined), columns);
  assert.equal(applyColumnFormatAlign(columns, {}), columns);
  assert.equal(
    applyColumnFormatAlign(columns, { order: format({ bold: true }) }),
    columns,
    'a format with no align must not churn the array',
  );
  assert.equal(
    applyColumnFormatAlign(columns, { order: format({ align: 'left' }) }),
    columns,
    'an override equal to the derived value must not churn the array',
  );
});
