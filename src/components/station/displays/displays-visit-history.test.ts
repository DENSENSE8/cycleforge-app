/**
 *   node --import tsx --test src/components/station/displays/displays-visit-history.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canVisitBack,
  canVisitForward,
  createVisitHistory,
  goLeafRootBack,
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

  it('same-tab nest updates replace present — Back from leaf root reaches index', () => {
    let state = createVisitHistory({ tab: 'index' });
    state = pushVisitFrame(state, { tab: 'photos', nest: { photoAction: 'actions' } });
    // Compare is breadcrumb depth, not a visit frame.
    state = pushVisitFrame(state, { tab: 'photos', nest: { photoAction: 'compare' } });
    assert.equal(state.past.length, 1, 'nest-only must not grow past');
    assert.equal(visitFrameKey(state.past[0]!), 'index');
    assert.equal(visitFrameKey(state.present), 'photos?photoAction=compare');

    // Nested Back → actions list (still same leaf).
    state = pushVisitFrame(state, { tab: 'photos', nest: { photoAction: 'actions' } });
    assert.equal(state.past.length, 1);
    assert.equal(visitFrameKey(state.present), 'photos?photoAction=actions');

    const back = goVisitBack(state);
    assert.ok(back);
    assert.equal(visitFrameKey(back.present), 'index');
    assert.equal(canVisitForward(back), true);
  });

  it('leaf → leaf replaces present — Back from Units reaches index, not Photos', () => {
    let state = createVisitHistory({ tab: 'index' });
    state = pushVisitFrame(state, { tab: 'photos', nest: { photoAction: 'actions' } });
    // Cockpit / topic jump Photos → Units must not stack Photos under Back.
    state = pushVisitFrame(state, { tab: 'units', nest: { unitsAction: 'actions' } });
    assert.equal(state.past.length, 1, 'leaf→leaf must not grow past');
    assert.equal(visitFrameKey(state.past[0]!), 'index');
    assert.equal(visitFrameKey(state.present), 'units?unitsAction=actions');
    assert.equal(canVisitForward(state), false);

    const back1 = goVisitBack(state);
    assert.ok(back1);
    assert.equal(visitFrameKey(back1.present), 'index');
    assert.equal(canVisitForward(back1), true);

    const fwd = goVisitForward(back1);
    assert.ok(fwd);
    assert.ok(visitFramesEqual(fwd.present, state.present));

    // Divergent leaf after Back-to-index still clears forward.
    const diverged = pushVisitFrame(back1, { tab: 'inventory' });
    assert.equal(canVisitForward(diverged), false);
    assert.equal(canVisitBack(diverged), true);
    assert.equal(visitFrameKey(diverged.past[0]!), 'index');
  });

  it('equal push is a no-op', () => {
    const state = createVisitHistory({ tab: 'inventory' });
    const next = pushVisitFrame(state, { tab: 'inventory' });
    assert.equal(next, state);
  });

  it('leaf-root Back from Inventory (empty past) lands on Displays index', () => {
    const state = createVisitHistory({ tab: 'inventory' });
    const back = goLeafRootBack(state);
    assert.equal(back.present.tab, 'index');
    assert.equal(canVisitForward(back), true);
    assert.equal(back.future[0]!.tab, 'inventory');
  });

  it('leaf-root Back from Inventory skips a prior Ticket leaf and lands on index', () => {
    const state = {
      past: [{ tab: 'ticket' as const }],
      present: { tab: 'inventory' },
      future: [] as const,
    };
    const back = goLeafRootBack(state);
    assert.equal(back.present.tab, 'index');
    assert.notEqual(back.present.tab, 'ticket');
    assert.equal(back.future[0]!.tab, 'inventory');
  });

  it('leaf-root Back with Index in past still uses visit Back (Forward restores)', () => {
    let state = createVisitHistory({ tab: 'index' });
    state = pushVisitFrame(state, { tab: 'inventory' });
    const back = goLeafRootBack(state);
    assert.equal(back.present.tab, 'index');
    assert.equal(canVisitForward(back), true);
    const fwd = goVisitForward(back);
    assert.ok(fwd);
    assert.equal(fwd.present.tab, 'inventory');
  });
});
