import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectVisibleMilestones } from './select-visible-milestones';

function m(at: string | null, key: string) {
  return { key, at };
}

describe('selectVisibleMilestones', () => {
  const path = [
    m(null, 'tested'),
    m(null, 'packed'),
    m(null, 'scanned_out'),
  ];

  it('shows only the first queue when nothing is stamped', () => {
    assert.deepEqual(
      selectVisibleMilestones(path).map((x) => x.key),
      ['tested'],
    );
  });

  it('shows stamped stages plus the true next queue', () => {
    const milestones = [m('2026-01-01', 'tested'), m(null, 'packed'), m(null, 'scanned_out')];
    assert.deepEqual(
      selectVisibleMilestones(milestones).map((x) => x.key),
      ['tested', 'packed'],
    );
  });

  it('omits a skipped early stage when later stages are stamped', () => {
    const milestones = [m(null, 'tested'), m('2026-05-25', 'packed'), m('2026-07-01', 'scanned_out')];
    assert.deepEqual(
      selectVisibleMilestones(milestones).map((x) => x.key),
      ['packed', 'scanned_out'],
    );
  });

  it('keeps every stamped stage when the path is complete', () => {
    const milestones = [
      m('2026-01-01', 'tested'),
      m('2026-05-25', 'packed'),
      m('2026-07-01', 'scanned_out'),
    ];
    assert.deepEqual(
      selectVisibleMilestones(milestones).map((x) => x.key),
      ['tested', 'packed', 'scanned_out'],
    );
  });

  it('treats the legacy "1" sentinel as unstamped', () => {
    const milestones = [m('1', 'tested'), m('2026-05-25', 'packed'), m(null, 'scanned_out')];
    assert.deepEqual(
      selectVisibleMilestones(milestones).map((x) => x.key),
      ['packed', 'scanned_out'],
    );
  });

  it('skips an unstamped early stage and still shows the next queue', () => {
    const milestones = [m(null, 'tested'), m('2026-05-25', 'packed'), m(null, 'scanned_out')];
    assert.deepEqual(
      selectVisibleMilestones(milestones).map((x) => x.key),
      ['packed', 'scanned_out'],
    );
  });
});
