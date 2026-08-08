/**
 * node --import tsx --test src/lib/receiving/zoho-po-stamp.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isZohoPoStampStale,
  normalizeZohoLastModified,
  readZohoPoLastModified,
} from './zoho-po-stamp';

describe('normalizeZohoLastModified', () => {
  it('returns null for empty', () => {
    assert.equal(normalizeZohoLastModified(null), null);
    assert.equal(normalizeZohoLastModified(''), null);
    assert.equal(normalizeZohoLastModified('   '), null);
  });

  it('normalizes offset timestamps to the same ISO instant', () => {
    const a = normalizeZohoLastModified('2026-05-21T15:38:12-0700');
    const b = normalizeZohoLastModified('2026-05-21T22:38:12.000Z');
    assert.ok(a);
    assert.equal(a, b);
  });
});

describe('isZohoPoStampStale', () => {
  it('allows save when base is missing (no trusted pull)', () => {
    assert.equal(isZohoPoStampStale(null, '2026-05-21T15:38:12-0700'), false);
    assert.equal(isZohoPoStampStale('', '2026-05-21T15:38:12-0700'), false);
  });

  it('blocks when live is missing but base was set', () => {
    assert.equal(isZohoPoStampStale('2026-05-21T15:38:12-0700', null), true);
  });

  it('allows when base and live match (offset vs Z)', () => {
    assert.equal(
      isZohoPoStampStale('2026-05-21T15:38:12-0700', '2026-05-21T22:38:12.000Z'),
      false,
    );
  });

  it('blocks when live differs from base', () => {
    assert.equal(
      isZohoPoStampStale('2026-05-21T15:38:12-0700', '2026-05-22T10:00:00-0700'),
      true,
    );
  });
});

describe('readZohoPoLastModified', () => {
  it('reads last_modified_time from a Zoho PO shape', () => {
    assert.equal(
      readZohoPoLastModified({ last_modified_time: '2026-05-21T15:38:12-0700' }),
      normalizeZohoLastModified('2026-05-21T15:38:12-0700'),
    );
    assert.equal(readZohoPoLastModified(null), null);
  });
});
