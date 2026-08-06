import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  applyHistoryCommandFilterState,
  EMPTY_HISTORY_COMMAND_FILTER,
  isHistoryCommandFilterHot,
  isHistoryRefineFacetHot,
  readHistoryCommandFilterState,
  type HistorySortId,
} from './history-command-filter';

describe('HistoryCommandFilterState', () => {
  test('read defaults when params absent', () => {
    const state = readHistoryCommandFilterState(new URLSearchParams());
    assert.deepEqual(state, EMPTY_HISTORY_COMMAND_FILTER);
    const sort: HistorySortId = state.sort;
    assert.equal(sort, 'unboxed_newest');
    assert.equal(isHistoryCommandFilterHot(state), false);
  });

  test('apply writes hot filters and omits defaults', () => {
    const next = applyHistoryCommandFilterState(new URLSearchParams('foo=1'), {
      q: 'ABC',
      field: 'tracking',
      scope: 'unmatched',
      sort: 'scanned_newest',
      staffId: 7,
      weekOffset: 2,
    });
    assert.equal(next.get('foo'), '1');
    assert.equal(next.get('rh_q'), 'ABC');
    assert.equal(next.get('rh_field'), 'tracking');
    assert.equal(next.get('rh_scope'), 'unmatched');
    assert.equal(next.get('sort'), 'scanned_newest');
    assert.equal(next.get('staff'), '7');
    assert.equal(next.get('weekOffset'), '2');
  });

  test('apply clears to defaults by deleting params', () => {
    const seeded = new URLSearchParams(
      'rh_q=x&rh_field=sku&rh_scope=unmatched&sort=scanned_newest&staff=3&weekOffset=2',
    );
    const next = applyHistoryCommandFilterState(seeded, {
      q: '',
      field: 'all',
      scope: 'all',
      sort: 'unboxed_newest',
      staffId: null,
      weekOffset: 0,
    });
    assert.equal(next.get('rh_q'), null);
    assert.equal(next.get('rh_field'), null);
    assert.equal(next.get('rh_scope'), null);
    assert.equal(next.get('sort'), null);
    assert.equal(next.get('staff'), null);
    assert.equal(next.get('weekOffset'), null);
  });

  test('isHistoryCommandFilterHot includes staff scope week', () => {
    assert.equal(
      isHistoryCommandFilterHot({ ...EMPTY_HISTORY_COMMAND_FILTER, staffId: 3 }),
      true,
    );
    assert.equal(
      isHistoryCommandFilterHot({ ...EMPTY_HISTORY_COMMAND_FILTER, scope: 'unmatched' }),
      true,
    );
    assert.equal(
      isHistoryCommandFilterHot({ ...EMPTY_HISTORY_COMMAND_FILTER, weekOffset: 1 }),
      true,
    );
  });

  test('isHistoryRefineFacetHot is per-facet', () => {
    assert.equal(isHistoryRefineFacetHot('staff', EMPTY_HISTORY_COMMAND_FILTER), false);
    assert.equal(
      isHistoryRefineFacetHot('staff', { ...EMPTY_HISTORY_COMMAND_FILTER, staffId: 2 }),
      true,
    );
    assert.equal(
      isHistoryRefineFacetHot('source', { ...EMPTY_HISTORY_COMMAND_FILTER, scope: 'unmatched' }),
      true,
    );
    assert.equal(
      isHistoryRefineFacetHot('field', { ...EMPTY_HISTORY_COMMAND_FILTER, field: 'tracking' }),
      true,
    );
    assert.equal(
      isHistoryRefineFacetHot('week', { ...EMPTY_HISTORY_COMMAND_FILTER, weekOffset: 1 }),
      true,
    );
    assert.equal(
      isHistoryRefineFacetHot('week', { ...EMPTY_HISTORY_COMMAND_FILTER, staffId: 1 }),
      false,
    );
  });
});
