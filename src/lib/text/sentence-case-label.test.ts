import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sentenceCaseLabel } from './sentence-case-label';

describe('sentenceCaseLabel', () => {
  it('keeps mixed-case brands and authored sentence case', () => {
    assert.equal(sentenceCaseLabel('eBay'), 'eBay');
    assert.equal(sentenceCaseLabel('Purchase order'), 'Purchase order');
  });

  it('sentence-cases shouting labels', () => {
    assert.equal(sentenceCaseLabel('RETURN'), 'Return');
    assert.equal(sentenceCaseLabel('CUSTOM FLOW'), 'Custom flow');
  });

  it('leaves hyphenated codes alone', () => {
    assert.equal(sentenceCaseLabel('ECWID-RS'), 'ECWID-RS');
  });
});
