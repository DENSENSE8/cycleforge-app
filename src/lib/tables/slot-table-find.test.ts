import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { looksLikeIdentifier } from '@/lib/search/search-hit';
import {
  slotTableFindHighlightId,
  slotTableQueryLooksLikeIdentifier,
  slotTableScrollItemMatches,
} from '@/lib/tables/slot-table-find';

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
      slotTableQueryLooksLikeIdentifier(sample),
      looksLikeIdentifier(sample),
      sample,
    );
  }
});

test('prose search does not highlight a row', () => {
  assert.equal(
    slotTableFindHighlightId({
      query: 'bose remote',
      paintedRowIds: ['1', '2', '3'],
    }),
    null,
  );
});

test('empty query does not highlight', () => {
  assert.equal(
    slotTableFindHighlightId({ query: '', paintedRowIds: ['1'] }),
    null,
  );
});

test('identifier paste highlights the first painted row', () => {
  assert.equal(
    slotTableFindHighlightId({
      query: '112-4984499-1990656',
      paintedRowIds: ['12941', '12941-line-2'],
    }),
    '12941',
  );
});

test('identifier with no painted rows highlights nothing', () => {
  assert.equal(
    slotTableFindHighlightId({
      query: '9300110990513565737132',
      paintedRowIds: [],
    }),
    null,
  );
});

test('grouped fold keys match scrollToKey by group key or row id', () => {
  assert.equal(
    slotTableScrollItemMatches('12941', { key: 'r:12941' }),
    true,
  );
  assert.equal(
    slotTableScrollItemMatches('111-2562571-1045803', {
      key: 'g:2026-09-09:111-2562571-1045803',
      groupKey: '111-2562571-1045803',
    }),
    true,
  );
  assert.equal(
    slotTableScrollItemMatches('12941', {
      key: 'g:2026-09-09:111-2562571-1045803',
      groupKey: '111-2562571-1045803',
      rowIds: ['12940', '12941'],
    }),
    true,
  );
  assert.equal(
    slotTableScrollItemMatches('12941', {
      key: 'g:2026-09-09:other',
      groupKey: 'other',
      rowIds: ['7'],
    }),
    false,
  );
});
