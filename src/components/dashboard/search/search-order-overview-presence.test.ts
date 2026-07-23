import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isSearchOrderFactEmpty,
  isShipByBeforeCreated,
} from '@/components/dashboard/search/search-order-overview-presence';

describe('isShipByBeforeCreated', () => {
  it('flags ship-by before created', () => {
    assert.equal(
      isShipByBeforeCreated('2026-06-17T07:00:00.000Z', '2026-06-18T17:22:31.000Z'),
      true,
    );
  });

  it('passes when ship-by is on or after created', () => {
    assert.equal(
      isShipByBeforeCreated('2026-06-19T00:00:00.000Z', '2026-06-18T17:22:31.000Z'),
      false,
    );
  });

  it('ignores missing or unparseable dates', () => {
    assert.equal(isShipByBeforeCreated(null, '2026-06-18T17:22:31.000Z'), false);
    assert.equal(isShipByBeforeCreated('2026-06-17T07:00:00.000Z', undefined), false);
    assert.equal(isShipByBeforeCreated('not-a-date', '2026-06-18T17:22:31.000Z'), false);
  });
});

describe('isSearchOrderFactEmpty', () => {
  it('treats null, empty, and blank strings as empty', () => {
    assert.equal(isSearchOrderFactEmpty(null), true);
    assert.equal(isSearchOrderFactEmpty(undefined), true);
    assert.equal(isSearchOrderFactEmpty(''), true);
    assert.equal(isSearchOrderFactEmpty('  '), true);
  });

  it('treats real strings and numbers as present', () => {
    assert.equal(isSearchOrderFactEmpty('USPS'), false);
    assert.equal(isSearchOrderFactEmpty(1), false);
  });
});
