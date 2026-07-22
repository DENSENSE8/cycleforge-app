import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldWidenEmptyDateFolder } from '@/components/photos/photo-library-grid/useDateFolders';

test('shouldWidenEmptyDateFolder never widens while unsettled (loading)', () => {
  assert.equal(
    shouldWidenEmptyDateFolder({
      isSettled: false,
      anchor: '2026-07-21',
      photoCount: 0,
      level: 'day',
    }),
    null,
  );
});

test('shouldWidenEmptyDateFolder widens empty settled day → week', () => {
  assert.equal(
    shouldWidenEmptyDateFolder({
      isSettled: true,
      anchor: '2026-07-21',
      photoCount: 0,
      level: 'day',
    }),
    'week',
  );
});

test('shouldWidenEmptyDateFolder widens empty settled week → month', () => {
  assert.equal(
    shouldWidenEmptyDateFolder({
      isSettled: true,
      anchor: '2026-07-20',
      photoCount: 0,
      level: 'week',
    }),
    'month',
  );
});

test('shouldWidenEmptyDateFolder does not widen when photos exist or entity leaf', () => {
  assert.equal(
    shouldWidenEmptyDateFolder({
      isSettled: true,
      anchor: '2026-07-21',
      photoCount: 3,
      level: 'day',
    }),
    null,
  );
  assert.equal(
    shouldWidenEmptyDateFolder({
      isSettled: true,
      anchor: '2026-07-21',
      photoCount: 0,
      level: 'day',
      poRef: '14-1',
    }),
    null,
  );
  assert.equal(
    shouldWidenEmptyDateFolder({
      isSettled: true,
      photoCount: 0,
      level: 'root',
    }),
    null,
  );
});
