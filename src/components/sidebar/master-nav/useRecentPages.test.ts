import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isCurrentRecentRef, recentsAsMasterNavRows } from './useRecentPages';

describe('isCurrentRecentRef', () => {
  it('drops the active page so the menu is past destinations only', () => {
    assert.equal(
      isCurrentRecentRef({ pageId: 'outbound', childId: null }, 'outbound', null),
      true,
    );
    assert.equal(
      isCurrentRecentRef({ pageId: 'unbox', childId: null }, 'outbound', null),
      false,
    );
  });

  it('drops the active page even when a stale child id is stored', () => {
    assert.equal(
      isCurrentRecentRef({ pageId: 'outbound', childId: 'orders' }, 'outbound', null),
      true,
    );
  });

  it('treats shipping aliases as the same destination', () => {
    assert.equal(
      isCurrentRecentRef(
        { pageId: 'outbound', childId: null },
        'unknown',
        null,
        '/shipping/orders',
      ),
      true,
    );
  });
});

describe('recentsAsMasterNavRows', () => {
  it('keeps one MasterNav L1 page even when desk children were stored', () => {
    const rows = recentsAsMasterNavRows(
      [
        { pageId: 'outbound', childId: 'orders' },
        { pageId: 'incoming', childId: null },
        { pageId: 'outbound', childId: 'shipped' },
        { pageId: 'scan-out', childId: null },
      ],
      'receive',
      null,
    );
    assert.deepEqual(
      rows.map((r) => r.pageId),
      ['outbound', 'incoming', 'scan-out'],
    );
  });
});
