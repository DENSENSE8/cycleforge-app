/**
 *   npx tsx --test src/utils/to-ship-oos-stage.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyToShipStageAfterOutOfStock } from '@/utils/dashboard-search-state';

describe('applyToShipStageAfterOutOfStock', () => {
  it('moves Tested to Pending and keeps other refines', () => {
    const tested = new URLSearchParams('stage=tested&late=1');
    assert.equal(applyToShipStageAfterOutOfStock(tested), true);
    assert.equal(tested.get('stage'), 'pending');
    assert.equal(tested.get('late'), '1');
  });

  it('drops a Tested lane refine so the hold is not hidden', () => {
    const lane = new URLSearchParams('ustatus=TESTED');
    assert.equal(applyToShipStageAfterOutOfStock(lane), true);
    assert.equal(lane.get('ustatus'), null);
  });

  it('leaves packed and the unfiltered list alone', () => {
    const packed = new URLSearchParams('stage=packed');
    assert.equal(applyToShipStageAfterOutOfStock(packed), false);
    assert.equal(packed.get('stage'), 'packed');

    const all = new URLSearchParams();
    assert.equal(applyToShipStageAfterOutOfStock(all), false);
  });
});
