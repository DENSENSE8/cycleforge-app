import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSpineOpenSectionIds } from './useSpineSectionCollapse';

describe('parseSpineOpenSectionIds', () => {
  it('treats missing storage as all folded', () => {
    assert.equal(parseSpineOpenSectionIds(null), null);
  });

  it('reads only string ids', () => {
    assert.deepEqual(parseSpineOpenSectionIds(JSON.stringify(['inbound', 2, 'floor'])), [
      'inbound',
      'floor',
    ]);
  });

  it('rejects junk so the hook keeps the collapsed default', () => {
    assert.equal(parseSpineOpenSectionIds('{'), null);
    assert.equal(parseSpineOpenSectionIds('{}'), null);
  });
});
