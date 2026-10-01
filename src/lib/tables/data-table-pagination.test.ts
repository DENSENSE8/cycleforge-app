import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { singleBand, type GroupedRenderOrder } from '@/lib/group-rows';
import {
  DATA_TABLE_PAGE_SIZE,
  formatDataTableCount,
  isDataTablePageSize,
  pageGroupedRenderOrder,
  pageIndexForRowId,
  selectAllVisibleIds,
} from '@/lib/tables/data-table-pagination';

interface Row {
  id: number;
  order: string;
}

const row = (id: number, order: string): Row => ({ id, order });

function nSingletons(count: number): GroupedRenderOrder<Row> {
  return singleBand(
    Array.from({ length: count }, (_, i) => row(i + 1, `o${i + 1}`)),
    (r) => r.order,
  );
}

test('96 rows at size 100 stay on one page — not a short fold-packed page', () => {
  const page = pageGroupedRenderOrder(nSingletons(96), 0, 100);
  assert.equal(page.pageCount, 1);
  assert.equal(page.shown, 96);
  assert.equal(page.total, 96);
});

test('93 rows fit on one page at the default 100', () => {
  const page = pageGroupedRenderOrder(nSingletons(93), 0);
  assert.equal(page.pageCount, 1);
  assert.equal(page.shown, 93);
});

test('100 rows fill exactly one page', () => {
  const page = pageGroupedRenderOrder(nSingletons(DATA_TABLE_PAGE_SIZE), 0);
  assert.equal(page.pageCount, 1);
  assert.equal(page.shown, 100);
});

test('101 rows paginate — page 0 is 100, page 1 is the remainder', () => {
  const first = pageGroupedRenderOrder(nSingletons(101), 0);
  assert.equal(first.pageCount, 2);
  assert.equal(first.shown, 100);
  const second = pageGroupedRenderOrder(nSingletons(101), 1);
  assert.equal(second.shown, 1);
  assert.equal(second.order[0]?.[1][0]?.rows[0]?.id, 101);
});

test('a fold that would overflow is split so the page fills to size', () => {
  const order: GroupedRenderOrder<Row> = [
    [
      '',
      [
        { key: 'A', rows: [row(1, 'A'), row(2, 'A'), row(3, 'A')] },
        { key: 'B', rows: Array.from({ length: 98 }, (_, i) => row(10 + i, 'B')) },
      ],
    ],
  ];
  const first = pageGroupedRenderOrder(order, 0, 100);
  assert.equal(first.shown, 100);
  assert.equal(first.pageCount, 2);
  const second = pageGroupedRenderOrder(order, 1, 100);
  assert.equal(second.shown, 1);
});

test('page size 20 of 96 is five pages of 20/20/20/20/16', () => {
  const first = pageGroupedRenderOrder(nSingletons(96), 0, 20);
  assert.equal(first.pageCount, 5);
  assert.equal(first.shown, 20);
  assert.equal(pageGroupedRenderOrder(nSingletons(96), 4, 20).shown, 16);
});

test('only 20, 50, 100, 200 are legal page sizes', () => {
  assert.equal(isDataTablePageSize(20), true);
  assert.equal(isDataTablePageSize(50), true);
  assert.equal(isDataTablePageSize(100), true);
  assert.equal(isDataTablePageSize(200), true);
  assert.equal(isDataTablePageSize(25), false);
  assert.equal(isDataTablePageSize(45), false);
});

test('select all / unselect all operate on the visible page only', () => {
  assert.deepEqual([...selectAllVisibleIds('all', [1, 2, 3])].sort((a, b) => a - b), [1, 2, 3]);
  assert.deepEqual([...selectAllVisibleIds('none', [1, 2, 3])], []);
});

test('pageIndexForRowId jumps to the page that holds the row', () => {
  const order = nSingletons(101);
  const idOf = (r: Row) => String(r.id);
  assert.equal(pageIndexForRowId(order, 100, '1', idOf), 0);
  assert.equal(pageIndexForRowId(order, 100, '100', idOf), 0);
  assert.equal(pageIndexForRowId(order, 100, '101', idOf), 1);
  assert.equal(pageIndexForRowId(order, 100, 'missing', idOf), null);
});

test('one page prints N rows — never N of N from a second counter', () => {
  assert.equal(formatDataTableCount(9, 9), '9 rows');
  assert.equal(formatDataTableCount(1, 1), '1 row');
  assert.equal(formatDataTableCount(5), '5 rows');
});

test('a slice prints shown of total', () => {
  assert.equal(formatDataTableCount(200, 500), '200 of 500');
  assert.equal(formatDataTableCount(5, 9), '5 of 9');
});
