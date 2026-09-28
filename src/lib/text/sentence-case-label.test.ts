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

  it('keeps acronym tokens upper-case while sentence-casing words', () => {
    assert.equal(sentenceCaseLabel('FBA'), 'FBA');
    assert.equal(sentenceCaseLabel('AWAITING_FBA_PREP'), 'Awaiting FBA prep');
    assert.equal(sentenceCaseLabel('NEW'), 'New');
  });

  it('leaves hyphenated codes alone', () => {
    assert.equal(sentenceCaseLabel('ECWID-RS'), 'ECWID-RS');
  });
});
