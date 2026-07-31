import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePoListSearch } from './po-list-search';

test('parsePoListSearch accepts carton QR handles with optional # prefix', () => {
  assert.deepEqual(parsePoListSearch('R-50292'), {
    needle: 'R-50292',
    receivingId: 50292,
  });
  assert.deepEqual(parsePoListSearch('#R-50292'), {
    needle: 'R-50292',
    receivingId: 50292,
  });
  assert.deepEqual(parsePoListSearch('  #RCV-9  '), {
    needle: 'RCV-9',
    receivingId: 9,
  });
  assert.deepEqual(parsePoListSearch('r-12'), {
    needle: 'r-12',
    receivingId: 12,
  });
});

test('parsePoListSearch leaves PO / tracking needles as free-text', () => {
  assert.deepEqual(parsePoListSearch('PO-1234'), {
    needle: 'PO-1234',
    receivingId: null,
  });
  assert.deepEqual(parsePoListSearch('1Z999AA10123456784'), {
    needle: '1Z999AA10123456784',
    receivingId: null,
  });
  assert.deepEqual(parsePoListSearch('R-'), {
    needle: 'R-',
    receivingId: null,
  });
});
