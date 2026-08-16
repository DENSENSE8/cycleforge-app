import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyUnboxDeskParam,
  applyUnboxOpenReceivingParams,
  isUnboxDesk,
  pickReceivingLineForDeepLink,
  shouldAutoOpenUnboxMru,
  shouldRestoreOpenReceiving,
} from '@/lib/receiving/unbox-selection-url';

describe('applyUnboxOpenReceivingParams', () => {
  it('sets openReceivingId + lineId and strips recvId', () => {
    const params = new URLSearchParams('unboxview=queue&recvId=9&ticketView=1');
    applyUnboxOpenReceivingParams(params, { receivingId: 42, lineId: 7 });
    assert.equal(params.get('openReceivingId'), '42');
    assert.equal(params.get('lineId'), '7');
    assert.equal(params.get('recvId'), null);
    assert.equal(params.get('unboxview'), 'queue');
    assert.equal(params.get('ticketView'), '1');
  });

  it('omits lineId when not provided', () => {
    const params = new URLSearchParams('lineId=99');
    applyUnboxOpenReceivingParams(params, { receivingId: 3 });
    assert.equal(params.get('openReceivingId'), '3');
    assert.equal(params.get('lineId'), null);
  });

  it('clears openReceivingId, lineId, and recvId on null', () => {
    const params = new URLSearchParams(
      'openReceivingId=42&lineId=7&recvId=9&unboxview=history',
    );
    applyUnboxOpenReceivingParams(params, null);
    assert.equal(params.get('openReceivingId'), null);
    assert.equal(params.get('lineId'), null);
    assert.equal(params.get('recvId'), null);
    assert.equal(params.get('unboxview'), 'history');
  });

  it('clears when receivingId is invalid', () => {
    const params = new URLSearchParams('openReceivingId=1&lineId=2');
    applyUnboxOpenReceivingParams(params, { receivingId: 0, lineId: 5 });
    assert.equal(params.get('openReceivingId'), null);
    assert.equal(params.get('lineId'), null);
  });
});

describe('pickReceivingLineForDeepLink', () => {
  const rows = [{ id: 10 }, { id: 20 }, { id: 30 }];

  it('prefers matching lineId', () => {
    assert.equal(pickReceivingLineForDeepLink(rows, '20')?.id, 20);
  });

  it('falls back to first row when lineId missing or unmatched', () => {
    assert.equal(pickReceivingLineForDeepLink(rows, null)?.id, 10);
    assert.equal(pickReceivingLineForDeepLink(rows, '999')?.id, 10);
  });

  it('returns undefined for empty rows', () => {
    assert.equal(pickReceivingLineForDeepLink([], '20'), undefined);
  });
});

describe('shouldRestoreOpenReceiving', () => {
  it('restores a valid id on the Unbox surface', () => {
    assert.equal(shouldRestoreOpenReceiving(true, '123'), true);
  });

  it('does NOT restore off the Unbox surface (the Incoming click-to-open regression)', () => {
    // A stale ?openReceivingId= that rode a mode switch onto /incoming (or any
    // non-Unbox surface) must not dispatchSelectLine and pop the details panel.
    assert.equal(shouldRestoreOpenReceiving(false, '123'), false);
  });

  it('does not restore a missing or non-numeric id even on Unbox', () => {
    assert.equal(shouldRestoreOpenReceiving(true, null), false);
    assert.equal(shouldRestoreOpenReceiving(true, ''), false);
    assert.equal(shouldRestoreOpenReceiving(true, 'abc'), false);
  });
});

describe('unboxdesk + station-first MRU gate', () => {
  it('applyUnboxDeskParam sets and clears unboxdesk=1', () => {
    const params = new URLSearchParams('unboxview=viewed');
    applyUnboxDeskParam(params, true);
    assert.equal(params.get('unboxdesk'), '1');
    assert.equal(isUnboxDesk(params), true);
    applyUnboxDeskParam(params, false);
    assert.equal(params.get('unboxdesk'), null);
    assert.equal(isUnboxDesk(params), false);
  });

  it('shouldAutoOpenUnboxMru only on bare station Unbox', () => {
    assert.equal(shouldAutoOpenUnboxMru(true, new URLSearchParams()), true);
    assert.equal(
      shouldAutoOpenUnboxMru(true, new URLSearchParams('unboxdesk=1')),
      false,
    );
    assert.equal(
      shouldAutoOpenUnboxMru(true, new URLSearchParams('openReceivingId=9')),
      false,
    );
    assert.equal(shouldAutoOpenUnboxMru(false, new URLSearchParams()), false);
  });
});
