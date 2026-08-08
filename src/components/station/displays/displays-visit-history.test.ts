/**
 *   node --import tsx --test src/components/station/displays/displays-visit-history.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canVisitBack,
  canVisitForward,
  createVisitHistory,
  goVisitBack,
  goVisitForward,
  pushVisitFrame,
  visitFrameKey,
  visitFramesEqual,
} from './displays-visit-history';

describe('displays-visit-history', () => {
  it('keys nest stably regardless of key insertion order', () => {
    assert.equal(
      visitFrameKey({ tab: 'photos', nest: { photoAction: 'compare', claimMode: 'x' } }),
      visitFrameKey({ tab: 'photos', nest: { claimMode: 'x', photoAction: 'compare' } }),
    );
  });

  it('push clears future; back/forward round-trip', () => {
    let state = createVisitHistory({ tab: 'index' });
    state = pushVisitFrame(state, { tab: 'photos', nest: { photoAction: 'actions' } });
    state = pushVisitFrame(state, { tab: 'photos', nest: { photoAction: 'compare' } });
    assert.equal(state.past.length, 2);
    assert.equal(visitFrameKey(state.present), 'photos?photoAction=compare');
    assert.equal(canVisitForward(state), false);

    const back1 = goVisitBack(state);
    assert.ok(back1);
    assert.equal(visitFrameKey(back1.present), 'photos?photoAction=actions');
    assert.equal(canVisitForward(back1), true);

    const fwd = goVisitForward(back1);
    assert.ok(fwd);
    assert.ok(visitFramesEqual(fwd.present, state.present));

    // Divergent push clears forward.
    const diverged = pushVisitFrame(back1, { tab: 'ticket' });
    assert.equal(canVisitForward(diverged), false);
    assert.equal(canVisitBack(diverged), true);
  });

  it('equal push is a no-op', () => {
    const state = createVisitHistory({ tab: 'inventory' });
    const next = pushVisitFrame(state, { tab: 'inventory' });
    assert.equal(next, state);
  });
});
