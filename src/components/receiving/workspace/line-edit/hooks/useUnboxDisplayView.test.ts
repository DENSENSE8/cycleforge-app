import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseUnboxDisplayParam,
  shouldClearDisplayOnLineChange,
} from './useUnboxDisplayView';
import { UNBOX_SIDE_TAB_ORDER } from '../unbox-side-tabs';

describe('parseUnboxDisplayParam', () => {
  it('accepts every real side tab', () => {
    for (const tab of UNBOX_SIDE_TAB_ORDER) {
      assert.equal(parseUnboxDisplayParam(tab), tab);
    }
  });

  it('treats absence as closed', () => {
    assert.equal(parseUnboxDisplayParam(null), null);
    assert.equal(parseUnboxDisplayParam(''), null);
  });

  it('rejects a bogus value rather than painting an empty column', () => {
    assert.equal(parseUnboxDisplayParam('not-a-tab'), null);
    assert.equal(parseUnboxDisplayParam('Listings'), null, 'case-sensitive — ids are lowercase');
  });

  it('rejects `overview` — the carton owns the centre, it is not a display', () => {
    assert.equal(parseUnboxDisplayParam('overview'), null);
  });

  it('rejects the browse-tab vocabulary, so `?display=` cannot shadow `?unboxview=`', () => {
    for (const browseTab of ['recent', 'queue', 'viewed']) {
      assert.equal(parseUnboxDisplayParam(browseTab), null);
    }
  });
});

describe('shouldClearDisplayOnLineChange', () => {
  it('clears on a genuine sibling-line switch while open', () => {
    assert.equal(shouldClearDisplayOnLineChange(11, 22, true), true);
  });

  it('stays put when the column is closed', () => {
    assert.equal(shouldClearDisplayOnLineChange(11, 22, false), false);
  });

  it('keeps a deep link open when prev line is null (mount / resolve)', () => {
    // The whole point of the param: `?display=po-note` must survive arrival.
    assert.equal(shouldClearDisplayOnLineChange(null, 22, true), false);
  });

  it('keeps open when the line id is unchanged', () => {
    assert.equal(shouldClearDisplayOnLineChange(22, 22, true), false);
  });

  it('keeps open when the current line becomes null', () => {
    assert.equal(shouldClearDisplayOnLineChange(22, null, true), false);
  });
});
