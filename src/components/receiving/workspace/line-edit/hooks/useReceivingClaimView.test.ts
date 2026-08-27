import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldClearClaimViewOnLineChange } from './useReceivingClaimView';

describe('shouldClearClaimViewOnLineChange', () => {
  it('clears on genuine sibling-line switch while open', () => {
    assert.equal(shouldClearClaimViewOnLineChange(11, 22, true), true);
  });

  it('keeps closed when claim view is off', () => {
    assert.equal(shouldClearClaimViewOnLineChange(11, 22, false), false);
  });

  it('keeps open when prev line is null (mount / deep-link resolve)', () => {
    assert.equal(shouldClearClaimViewOnLineChange(null, 22, true), false);
  });

  it('keeps open when line id is unchanged', () => {
    assert.equal(shouldClearClaimViewOnLineChange(22, 22, true), false);
  });

  it('keeps open when current line becomes null', () => {
    assert.equal(shouldClearClaimViewOnLineChange(22, null, true), false);
  });
});
