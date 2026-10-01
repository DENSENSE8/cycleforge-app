import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { looksLikeIdentifier } from '@/lib/search/search-hit';
import {
  dataTableFindHighlightId,
  dataTableQueryLooksLikeIdentifier,
  dataTableScrollItemMatches,
} from '@/lib/tables/data-table-find';

test('identifier heuristic agrees with looksLikeIdentifier on operator pastes', () => {
  const samples = [
    '112-4984499-1990656',
    '9300110990513565737132',
    '024644912010195BC',
    '00624',
    'R-52232',
    'REP-3365',
    '5008',
    'bose remote',
    'must ship today',
    '',
    '   ',
  ];
  for (const sample of samples) {
    assert.equal(
      dataTableQueryLooksLikeIdentifier(sample),
      looksLikeIdentifier(sample),
      sample,
    );
  }
});

test('prose search does not highlight a row', () => {
  assert.equal(
    dataTableFindHighlightId({
      query: 'bose remote',
      paintedRowIds: ['1', '2', '3'],
    }),
    null,
  );
});

test('empty query does not highlight', () => {
  assert.equal(
    dataTableFindHighlightId({ query: '', paintedRowIds: ['1'] }),
    null,
  );
});

test('identifier paste highlights the first painted row', () => {
  assert.equal(
    dataTableFindHighlightId({
      query: '112-4984499-1990656',
      paintedRowIds: ['12941', '12941-line-2'],
    }),
    '12941',
  );
});

test('identifier with no painted rows highlights nothing', () => {
  assert.equal(
    dataTableFindHighlightId({
      query: '9300110990513565737132',
      paintedRowIds: [],
    }),
    null,
  );
});

test('grouped fold keys match scrollToKey by group key or row id', () => {
  assert.equal(
    dataTableScrollItemMatches('12941', { key: 'r:12941' }),
    true,
  );
  assert.equal(
    dataTableScrollItemMatches('111-2562571-1045803', {
      key: 'g:2026-09-09:111-2562571-1045803',
      groupKey: '111-2562571-1045803',
    }),
    true,
  );
  assert.equal(
    dataTableScrollItemMatches('12941', {
      key: 'g:2026-09-09:111-2562571-1045803',
      groupKey: '111-2562571-1045803',
      rowIds: ['12940', '12941'],
    }),
    true,
  );
  assert.equal(
    dataTableScrollItemMatches('12941', {
      key: 'g:2026-09-09:other',
      groupKey: 'other',
      rowIds: ['7'],
    }),
    false,
  );
});
