import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  nextAutoCreateFromEmptyTrackingFlag,
  shouldAutoCreateFromEmptyTrackingSeed,
} from './claim-empty-seed-create';

const base = {
  open: true,
  mode: 'link' as const,
  seededQuery: '1Z999AA10123456784',
  ticketQuery: '1Z999AA10123456784',
  searchLoading: false,
  searchError: null as string | null,
  resultCount: 0,
  hasSelectedTicket: false,
  alreadyFlippedKey: null as string | null,
  flipKey: '42:1Z999AA10123456784',
};

describe('shouldAutoCreateFromEmptyTrackingSeed', () => {
  it('flips when seeded tracking search settles empty', () => {
    assert.equal(shouldAutoCreateFromEmptyTrackingSeed(base), true);
  });

  it('does not flip when already flipped for this key', () => {
    assert.equal(
      shouldAutoCreateFromEmptyTrackingSeed({
        ...base,
        alreadyFlippedKey: base.flipKey,
      }),
      false,
    );
  });

  it('does not flip with hits, loading, error, or edited query', () => {
    assert.equal(shouldAutoCreateFromEmptyTrackingSeed({ ...base, resultCount: 2 }), false);
    assert.equal(shouldAutoCreateFromEmptyTrackingSeed({ ...base, searchLoading: true }), false);
    assert.equal(
      shouldAutoCreateFromEmptyTrackingSeed({ ...base, searchError: 'network' }),
      false,
    );
    assert.equal(
      shouldAutoCreateFromEmptyTrackingSeed({ ...base, ticketQuery: '#4821' }),
      false,
    );
    assert.equal(shouldAutoCreateFromEmptyTrackingSeed({ ...base, seededQuery: '' }), false);
    assert.equal(shouldAutoCreateFromEmptyTrackingSeed({ ...base, mode: 'create' }), false);
  });
});

describe('nextAutoCreateFromEmptyTrackingFlag', () => {
  it('sets true only on empty-seed flip', () => {
    assert.equal(
      nextAutoCreateFromEmptyTrackingFlag({ prev: false, event: 'empty-seed-flip' }),
      true,
    );
    assert.equal(
      nextAutoCreateFromEmptyTrackingFlag({ prev: true, event: 'empty-seed-flip' }),
      true,
    );
  });

  it('clears on mode change and close/reopen', () => {
    assert.equal(
      nextAutoCreateFromEmptyTrackingFlag({ prev: true, event: 'mode-change' }),
      false,
    );
    assert.equal(nextAutoCreateFromEmptyTrackingFlag({ prev: true, event: 'closed' }), false);
    assert.equal(nextAutoCreateFromEmptyTrackingFlag({ prev: false, event: 'closed' }), false);
  });
});
