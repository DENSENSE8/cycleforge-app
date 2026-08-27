import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveColumnResizeEdges } from './grid-column-resize-edges';

describe('resolveColumnResizeEdges', () => {
  it('gives every resizable column a trailing end grip', () => {
    const edges = resolveColumnResizeEdges(
      [
        { key: 'select' },
        { key: 'title', type: 'text' },
        { key: 'qty', type: 'number' },
        { key: 'condition', type: 'tag' },
      ],
      'title',
    );
    assert.deepEqual(edges.get('title'), ['end']);
    assert.equal(edges.has('select'), false);
    assert.equal(edges.has('qty'), false); // fixed-format number
    // First resizable after title (skipping qty) also gets the leading grip.
    assert.deepEqual(edges.get('condition'), ['start', 'end']);
  });

  it('Incoming-shaped: date after frozen title also gets a leading start grip', () => {
    const edges = resolveColumnResizeEdges(
      [
        { key: 'select' },
        { key: 'order', type: 'id' },
        { key: 'title', type: 'text' },
        { key: 'date', type: 'date' },
        { key: 'age', type: 'date' },
        { key: 'qty', type: 'number' },
      ],
      'title',
    );
    assert.deepEqual(edges.get('title'), ['end']);
    // id tracks are resizable (Sheets parity) — order sits before freeze edge.
    assert.deepEqual(edges.get('order'), ['end']);
    assert.deepEqual(edges.get('date'), ['start', 'end']);
    assert.deepEqual(edges.get('age'), ['end']); // not the first after freeze
    assert.equal(edges.has('qty'), false);
  });

  it('Catalog-shaped: sku (id) is resizable; qty stays fixed', () => {
    const edges = resolveColumnResizeEdges(
      [
        { key: 'select' },
        { key: 'title', type: 'text' },
        { key: 'sku', type: 'id' },
        { key: 'qty', type: 'number' },
      ],
      'title',
    );
    assert.deepEqual(edges.get('title'), ['end']);
    assert.deepEqual(edges.get('sku'), ['start', 'end']);
    assert.equal(edges.has('qty'), false);
  });

  it('skips non-resizable neighbors to find the first start candidate', () => {
    const edges = resolveColumnResizeEdges(
      [
        { key: 'title', type: 'text' },
        { key: 'qty', type: 'number' },
        { key: 'condition', type: 'tag' },
      ],
      'title',
    );
    assert.deepEqual(edges.get('title'), ['end']);
    assert.deepEqual(edges.get('condition'), ['start', 'end']);
  });

  it('returns end-only map when frozenEdgeKey is missing', () => {
    const edges = resolveColumnResizeEdges(
      [
        { key: 'title', type: 'text' },
        { key: 'date', type: 'date' },
      ],
      'missing',
    );
    assert.deepEqual(edges.get('title'), ['end']);
    assert.deepEqual(edges.get('date'), ['end']);
  });

  it('Receiving / Unbox History: locked order freeze → Product end-only (no left grip)', () => {
    // Frozen edge is order with an explicit resizable:false override (Receiving
    // locks identity tracks). Product is the only resizable track. Leading grip
    // must NOT mount — there is no overhanging frozen trailing grip to compensate.
    const edges = resolveColumnResizeEdges(
      [
        { key: 'select' },
        { key: 'order', type: 'id', resizable: false },
        { key: 'date', type: 'date', resizable: false },
        { key: 'title', type: 'text' },
        { key: 'status', type: 'tag', resizable: false },
        { key: 'qty', type: 'number' },
      ],
      'order',
    );
    assert.equal(edges.has('order'), false);
    assert.deepEqual(edges.get('title'), ['end']);
    assert.equal(edges.has('status'), false);
    assert.equal(edges.has('date'), false);
  });

  it('Orders / To Ship: Product is frozen edge + only resizable → end grip only', () => {
    const edges = resolveColumnResizeEdges(
      [
        { key: 'select', resizable: false },
        { key: 'order', type: 'id', resizable: false },
        { key: 'age', type: 'number', resizable: false },
        { key: 'title', type: 'text', resizable: true },
        { key: 'qty', type: 'number', resizable: false },
        { key: 'tracking', type: 'tracking', resizable: false },
      ],
      'title',
    );
    assert.deepEqual(edges.get('title'), ['end']);
    assert.equal(edges.has('order'), false);
    assert.equal(edges.has('age'), false);
    assert.equal(edges.has('tracking'), false);
  });
});
