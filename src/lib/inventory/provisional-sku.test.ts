import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  checkMergeAllowed,
  isProvisionalSku,
  planProvisionalMerge,
  provisionalSkuForBarcode,
  provisionalSkuForSourceRef,
} from './provisional-sku';

describe('provisionalSkuForBarcode', () => {
  it('resolves the same key however the gun punctuates the read', () => {
    // The unique index is on the normalised barcode; if these diverged, two
    // operators scanning one box would hold half the count each.
    const spaced = provisionalSkuForBarcode(' 0 12345 67890 5 ');
    assert.equal(spaced, 'TMP-012345678905');
    assert.equal(provisionalSkuForBarcode('012345-678905'), 'TMP-012345678905');
    assert.equal(provisionalSkuForBarcode('012345678905'), spaced);
  });

  it('refuses a read with nothing usable in it', () => {
    assert.equal(provisionalSkuForBarcode('   '), null);
    assert.equal(provisionalSkuForBarcode('---'), null);
  });
});

describe('provisionalSkuForSourceRef', () => {
  it('resolves a re-run or double tap to the same placeholder', () => {
    const sku = provisionalSkuForSourceRef('00000000-0000-0000-0000-000000000001', 'c04-bin-sheet-2026-09-24:C-04-15-1');
    assert.match(sku ?? '', /^TMP-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    assert.equal(provisionalSkuForSourceRef('00000000-0000-0000-0000-000000000001', '  C04-BIN-SHEET-2026-09-24:c-04-15-1 '), sku);
  });

  it('keeps sibling keys apart and out of the barcode keyspace', () => {
    const skus = new Set<string | null>();
    for (let i = 0; i < 2000; i += 1) skus.add(provisionalSkuForSourceRef('00000000-0000-0000-0000-000000000001', `sheet:C-04-${i}`));
    assert.equal(skus.size, 2000);
    // Barcode normalisation strips hyphens, so no barcode can mint this shape.
    const minted = provisionalSkuForSourceRef('00000000-0000-0000-0000-000000000001', 'sheet:C-04-1') ?? '';
    assert.notEqual(provisionalSkuForBarcode(minted.slice('TMP-'.length)), minted);
    // sku_catalog.sku is globally unique: the QA rehearsal and the real org
    // must not mint the same string for the same import key.
    assert.notEqual(provisionalSkuForSourceRef('00000000-0000-0000-0000-000000000002', 'sheet:C-04-1'), minted);
  });

  it('refuses an empty key', () => {
    assert.equal(provisionalSkuForSourceRef('00000000-0000-0000-0000-000000000001', '   '), null);
  });
});

describe('isProvisionalSku', () => {
  it('separates placeholders from real catalog SKUs', () => {
    assert.equal(isProvisionalSku('TMP-012345678905'), true);
    assert.equal(isProvisionalSku('BOSE-WAVE-III'), false);
    assert.equal(isProvisionalSku(null), false);
  });
});

describe('planProvisionalMerge', () => {
  it('adds where the target is already stocked and re-keys where it is not', () => {
    // bin_contents is UNIQUE(location_id, sku): bin 1 cannot hold two rows for
    // the same SKU, so that one must SUM. Bin 2 has no target row, so the
    // provisional row keeps its identity and only changes its sku.
    const plan = planProvisionalMerge(
      [
        { locationId: 1, qty: 4 },
        { locationId: 2, qty: 7 },
      ],
      [{ locationId: 1, qty: 10 }],
    );

    assert.deepEqual(plan.folds, [
      { locationId: 1, provisionalQty: 4, targetQty: 10, mergedQty: 14 },
    ]);
    assert.deepEqual(plan.rekeys, [{ locationId: 2, qty: 7 }]);
    assert.equal(plan.qtyMoved, 11);
    assert.equal(plan.binRowsMoved, 2);
  });

  it('drops emptied rows instead of creating zero-qty rows under the real SKU', () => {
    const plan = planProvisionalMerge(
      [
        { locationId: 1, qty: 0 },
        { locationId: 2, qty: 3 },
      ],
      [],
    );

    assert.deepEqual(plan.rekeys, [{ locationId: 2, qty: 3 }]);
    assert.equal(plan.qtyMoved, 3);
    assert.equal(plan.binRowsMoved, 1);
  });

  it('moves nothing when the placeholder never held stock', () => {
    const plan = planProvisionalMerge([], [{ locationId: 1, qty: 5 }]);
    assert.equal(plan.qtyMoved, 0);
    assert.equal(plan.binRowsMoved, 0);
    assert.deepEqual(plan.folds, []);
    assert.deepEqual(plan.rekeys, []);
  });
});

describe('checkMergeAllowed', () => {
  it('allows a placeholder into a real SKU', () => {
    assert.deepEqual(checkMergeAllowed('TMP-012345678905', 'BOSE-WAVE-III'), { ok: true });
  });

  it('refuses chaining one placeholder into another', () => {
    // TMP→TMP builds a chain whose reconciliation is unspecified.
    assert.deepEqual(checkMergeAllowed('TMP-111', 'TMP-222'), {
      ok: false,
      reason: 'target-is-provisional',
    });
  });

  it('refuses merging a real SKU as if it were a placeholder', () => {
    assert.deepEqual(checkMergeAllowed('BOSE-WAVE-III', 'BOSE-WAVE-IV'), {
      ok: false,
      reason: 'not-provisional',
    });
  });

  it('refuses a no-op and a missing side', () => {
    assert.deepEqual(checkMergeAllowed('TMP-111', 'TMP-111'), { ok: false, reason: 'same-sku' });
    assert.deepEqual(checkMergeAllowed('TMP-111', '  '), { ok: false, reason: 'missing-sku' });
  });
});
