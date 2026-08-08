import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  readLiveSearchParams,
  resolveOptimisticParam,
  resolveOptimisticParams,
  shouldClearOptimisticParam,
  shouldClearOptimisticParams,
} from './optimistic-url-param';

describe('resolveOptimisticParam', () => {
  it('follows the URL when there is no pending write', () => {
    assert.equal(resolveOptimisticParam(null, undefined), null);
    assert.equal(resolveOptimisticParam('index', undefined), 'index');
    assert.equal(resolveOptimisticParam(42, undefined), 42);
  });

  it('paints the pending value before searchParams catch up', () => {
    assert.equal(resolveOptimisticParam(null, 'index'), 'index');
    assert.equal(
      resolveOptimisticParam('photos', null),
      null,
      'pending close unmounts immediately while URL still has a leaf',
    );
  });
});

describe('shouldClearOptimisticParam', () => {
  it('clears pending only when the URL matches the write', () => {
    assert.equal(shouldClearOptimisticParam(null, 'index'), false);
    assert.equal(shouldClearOptimisticParam('index', 'index'), true);
    assert.equal(shouldClearOptimisticParam(null, undefined), false);
  });

  it('keeps pending across an intermediate URL hop (index → leaf race)', () => {
    assert.equal(
      shouldClearOptimisticParam('index', 'photos'),
      false,
      'first replace landing on index must not drop a pending photos write',
    );
    assert.equal(resolveOptimisticParam('index', 'photos'), 'photos');
    assert.equal(shouldClearOptimisticParam('photos', 'photos'), true);
  });

  it('honours a custom equals for object snapshots', () => {
    type Snap = { display: string | null };
    const eq = (a: Snap, b: Snap) => a.display === b.display;
    const pending = { display: 'photos' as string | null };
    assert.equal(
      shouldClearOptimisticParam({ display: 'index' }, pending, eq),
      false,
    );
    assert.equal(
      shouldClearOptimisticParam({ display: 'photos' }, pending, eq),
      true,
    );
  });
});

describe('resolveOptimisticParams', () => {
  type Snap = { taskId: string | null; watchOpen: boolean };

  it('follows the URL when there is no pending write', () => {
    const url: Snap = { taskId: 'a', watchOpen: false };
    assert.deepEqual(resolveOptimisticParams(url, undefined), url);
  });

  it('overlays only keys present in pending', () => {
    const url: Snap = { taskId: 'a', watchOpen: false };
    assert.deepEqual(resolveOptimisticParams(url, { watchOpen: true }), {
      taskId: 'a',
      watchOpen: true,
    });
    assert.deepEqual(
      resolveOptimisticParams(url, { taskId: null, watchOpen: true }),
      { taskId: null, watchOpen: true },
      'full mutual-exclusion snap paints both sides',
    );
  });
});

describe('shouldClearOptimisticParams', () => {
  type Snap = { taskId: string | null; watchOpen: boolean };

  it('clears only when every pending key matches the URL', () => {
    const url: Snap = { taskId: 'a', watchOpen: false };
    assert.equal(
      shouldClearOptimisticParams(url, { taskId: 'a' }),
      true,
      'task-only pending clears when task matches (watch ignored)',
    );
    assert.equal(shouldClearOptimisticParams(url, { taskId: 'b' }), false);
    assert.equal(
      shouldClearOptimisticParams(url, { taskId: 'a', watchOpen: true }),
      false,
      'watch mismatch keeps the compound pending',
    );
    assert.equal(
      shouldClearOptimisticParams(
        { taskId: 'a', watchOpen: true },
        { taskId: 'a', watchOpen: true },
      ),
      true,
    );
  });

  it('does not clear an empty or absent pending', () => {
    const url: Snap = { taskId: null, watchOpen: false };
    assert.equal(shouldClearOptimisticParams(url, undefined), false);
    assert.equal(shouldClearOptimisticParams(url, {}), false);
  });
});

describe('readLiveSearchParams', () => {
  it('parses a fallback query string when window is unavailable-shaped', () => {
    const params = readLiveSearchParams('open=7&q=foo');
    assert.equal(params.get('open'), '7');
    assert.equal(params.get('q'), 'foo');
  });

  it('accepts a leading ? on the fallback', () => {
    const params = readLiveSearchParams('?open=9');
    assert.equal(params.get('open'), '9');
  });
});
