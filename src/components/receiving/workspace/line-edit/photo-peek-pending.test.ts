import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mergePeekCards, type PeekCard } from './photo-peek-pending';

describe('mergePeekCards', () => {
  const real: PeekCard[] = [
    { id: '9', imgUrl: 'https://example.com/a.jpg', alt: 'A' },
    { id: '8', imgUrl: 'https://example.com/b.jpg', alt: 'B' },
  ];

  it('returns real cards when nothing in flight', () => {
    assert.deepEqual(mergePeekCards(real, 0, 1), real);
  });

  it('returns real cards for invalid in-flight / receiving id', () => {
    assert.deepEqual(mergePeekCards(real, -1, 10), real);
    assert.deepEqual(mergePeekCards(real, 2, NaN), real);
  });

  it('prepends placeholders ahead of committed photos', () => {
    const merged = mergePeekCards(real, 2, 7);
    assert.equal(merged.length, 4);
    assert.equal(merged[0]?.pending, true);
    assert.equal(merged[1]?.pending, true);
    assert.equal(merged[0]?.id, 'pending:7:0');
    assert.equal(merged[1]?.id, 'pending:7:1');
    assert.equal(merged[2]?.id, '9');
    assert.equal(merged[3]?.id, '8');
  });

  it('builds absolute in-flight placeholder ids for a bare merge', () => {
    const cards = mergePeekCards([], 3, 42);
    assert.equal(cards.length, 3);
    assert.deepEqual(
      cards.map((c) => c.id),
      ['pending:42:0', 'pending:42:1', 'pending:42:2'],
    );
    for (const c of cards) {
      assert.equal(c.pending, true);
      assert.equal(c.imgUrl, '');
    }
  });
});
