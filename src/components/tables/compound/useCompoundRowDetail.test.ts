/**
 * Callers: node:test. No API. User: make DATA_TABLE_ENGINE_CONTRACT green.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COMPOUND_ROW_DETAIL_EXPANDED_PX,
  COMPOUND_ROW_PX,
} from '@/components/tables/compound/compound-row-chrome';
import {
  compoundRowDetailEstimatePx,
  compoundRowDetailIdFromItemKey,
} from './useCompoundRowDetail';

describe('compoundRowDetailEstimatePx', () => {
  it('unwraps r: keys and stays idle when closed', () => {
    assert.equal(compoundRowDetailIdFromItemKey('r:13924'), '13924');
    assert.equal(compoundRowDetailEstimatePx('r:13924', COMPOUND_ROW_PX), COMPOUND_ROW_PX);
  });

  it('expanded height is 96 when the idle box is 48', () => {
    assert.equal(COMPOUND_ROW_DETAIL_EXPANDED_PX, 96);
  });
});
