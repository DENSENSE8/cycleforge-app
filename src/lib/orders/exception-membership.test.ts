import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  exceptionHeldSql,
  isExceptionHeld,
  liveWorkingSetSql,
} from './exception-membership';

describe('isExceptionHeld', () => {
  it('a caged unpaired order is an exception', () => {
    assert.equal(isExceptionHeld({ releaseState: 'caged', skuCatalogId: null }), true);
  });

  it('pairing leaves the exception queue even if the cage stamp is stale', () => {
    assert.equal(isExceptionHeld({ releaseState: 'caged', skuCatalogId: 2425 }), false);
  });

  it('NULL release_state is live work, unpaired or not', () => {
    // Historical rows predate the cage; flooding exceptions with them is the
    // reason actionable stays caged ∩ unpaired, not "every unpaired order".
    assert.equal(isExceptionHeld({ releaseState: null, skuCatalogId: null }), false);
    assert.equal(isExceptionHeld({ releaseState: 'released', skuCatalogId: null }), false);
  });
});

describe('exceptionHeldSql', () => {
  it('qualifies columns with the caller alias', () => {
    assert.equal(
      exceptionHeldSql('o'),
      `(COALESCE(o.release_state, '') = 'caged' AND o.sku_catalog_id IS NULL)`,
    );
  });

  it('live working set is the negation — paired-but-caged lands on To-ship', () => {
    assert.equal(liveWorkingSetSql('o'), `NOT ${exceptionHeldSql('o')}`);
  });

  it('rejects a non-identifier alias rather than interpolating SQL', () => {
    assert.throws(() => exceptionHeldSql('o; drop'), /invalid SQL alias/);
  });
});
