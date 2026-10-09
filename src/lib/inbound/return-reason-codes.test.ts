import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readReturnReason } from './return-reason-codes';

describe('readReturnReason', () => {
  it('reads Amazon report codes in every prefix form as words, keeping the code', () => {
    assert.deepEqual(readReturnReason('CR-MISSING_PARTS'), { label: 'Missing parts / accessories', code: 'CR-MISSING_PARTS' });
    assert.deepEqual(readReturnReason('AMZ-PG-BAD-DESC'), { label: 'Not as described', code: 'AMZ-PG-BAD-DESC' });
    assert.deepEqual(readReturnReason('UNWANTED_ITEM'), { label: 'Changed mind / no longer needed', code: 'UNWANTED_ITEM' });
    assert.deepEqual(readReturnReason('  CR-SWITCHEROO '), { label: 'Wrong item sent', code: 'CR-SWITCHEROO' });
  });

  it('reads eBay Post-Order ReturnReasonEnum codes as words, keeping the code', () => {
    assert.deepEqual(readReturnReason('NOT_AS_DESCRIBED'), { label: 'Not as described', code: 'NOT_AS_DESCRIBED' });
    assert.deepEqual(readReturnReason('DEFECTIVE_ITEM'), { label: "Defective / doesn't work", code: 'DEFECTIVE_ITEM' });
    assert.deepEqual(readReturnReason('WRONG_SIZE'), { label: 'Wrong size', code: 'WRONG_SIZE' });
    assert.deepEqual(readReturnReason('NO_LONGER_NEED_ITEM'), { label: 'Changed mind / no longer needed', code: 'NO_LONGER_NEED_ITEM' });
    assert.deepEqual(readReturnReason('ORDERED_ACCIDENTALLY'), { label: 'Ordered by mistake', code: 'ORDERED_ACCIDENTALLY' });
    assert.deepEqual(readReturnReason('MISSING_PARTS'), { label: 'Missing parts / accessories', code: 'MISSING_PARTS' });
    assert.deepEqual(readReturnReason('ARRIVED_DAMAGED'), { label: 'Arrived damaged', code: 'ARRIVED_DAMAGED' });
  });

  it('a bare eBay code word is a code only because it is a known one', () => {
    assert.deepEqual(readReturnReason('OTHER'), { label: 'Other', code: 'OTHER' });
    assert.deepEqual(readReturnReason('CUSTOMIZED'), { label: 'Customized — failed authentication', code: 'CUSTOMIZED' });
    assert.deepEqual(readReturnReason('RANDOMWORD'), { label: 'RANDOMWORD', code: null });
  });

  it('an unknown code stays the code — no guessed meaning', () => {
    assert.deepEqual(readReturnReason('CR-SOMETHING_NEW'), { label: 'CR-SOMETHING_NEW', code: null });
  });

  it('hand-entered words and free text pass through untouched', () => {
    assert.deepEqual(readReturnReason('Damaged in transit — screen cracked'), { label: 'Damaged in transit — screen cracked', code: null });
    assert.deepEqual(readReturnReason('top-tube dented'), { label: 'top-tube dented', code: null });
    assert.deepEqual(readReturnReason('Changed mind · RMA RMA-531799-3'), { label: 'Changed mind · RMA RMA-531799-3', code: null });
  });

  it('a carton fallback keeps its RMA tail after a translated code', () => {
    assert.deepEqual(readReturnReason('CR-DEFECTIVE · RMA R-1'), { label: "Defective / doesn't work · RMA R-1", code: 'CR-DEFECTIVE' });
  });

  it('blank is no reason', () => {
    assert.equal(readReturnReason(''), null);
    assert.equal(readReturnReason('   '), null);
    assert.equal(readReturnReason(null), null);
  });
});
