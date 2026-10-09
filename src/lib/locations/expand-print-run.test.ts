import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expandRangePrintRun, MAX_RUN_LABELS, type ExpandRangeRunInput } from './expand-print-run';

const base: ExpandRangeRunInput = {
  zone: 'C',
  aisle: 3,
  bays: { from: 1, through: 6, parity: 'all' },
  levels: { from: 1, through: 2, parity: 'all' },
  positions: null,
};

function codes(input: ExpandRangeRunInput): string[] {
  const plan = expandRangePrintRun(input);
  return plan.status === 'ok' ? plan.rows.map((row) => row.code) : [];
}

describe('expandRangePrintRun', () => {
  it('odd bays only, with no position, prints bay-level faces in bay then level order', () => {
    assert.deepEqual(codes({ ...base, bays: { from: 1, through: 6, parity: 'odd' } }), [
      'C-03-01-1-00',
      'C-03-01-2-00',
      'C-03-03-1-00',
      'C-03-03-2-00',
      'C-03-05-1-00',
      'C-03-05-2-00',
    ]);
  });

  it('even bays × odd levels is the cross of both filters', () => {
    assert.deepEqual(
      codes({ ...base, bays: { from: 1, through: 4, parity: 'even' }, levels: { from: 1, through: 5, parity: 'odd' } }),
      ['C-03-02-1-00', 'C-03-02-3-00', 'C-03-02-5-00', 'C-03-04-1-00', 'C-03-04-3-00', 'C-03-04-5-00'],
    );
  });

  it('a position range lands on every face; a reversed range reads ascending', () => {
    assert.deepEqual(
      codes({ ...base, bays: { from: 2, through: 2, parity: 'all' }, levels: { from: 1, through: 1, parity: 'all' }, positions: { from: 3, through: 1 } }),
      ['C-03-02-1-01', 'C-03-02-1-02', 'C-03-02-1-03'],
    );
  });

  it('a parity that keeps nothing, or an out-of-range end, is empty — never a guess', () => {
    assert.deepEqual(expandRangePrintRun({ ...base, bays: { from: 2, through: 2, parity: 'odd' } }), { status: 'empty' });
    assert.deepEqual(expandRangePrintRun({ ...base, bays: { from: 0, through: 4, parity: 'all' } }), { status: 'empty' });
    assert.deepEqual(expandRangePrintRun({ ...base, zone: '7' }), { status: 'empty' });
  });

  it('refuses a run over the cap with its count instead of planning it', () => {
    const plan = expandRangePrintRun({ ...base, bays: { from: 1, through: 99, parity: 'all' }, levels: { from: 1, through: 10, parity: 'all' } });
    assert.deepEqual(plan, { status: 'too_many', count: 990 });
    assert.ok(990 > MAX_RUN_LABELS);
  });
});
