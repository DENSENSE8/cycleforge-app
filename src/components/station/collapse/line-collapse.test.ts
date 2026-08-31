import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LINE_COLLAPSE_INITIAL,
  isLineExpanded,
  lineCollapseReducer,
  type LineCollapseState,
} from './line-collapse';

const ACTIVE = 7;
const SIBLING = 8;

function reduce(state: LineCollapseState, ...events: Parameters<typeof lineCollapseReducer>[1][]) {
  return events.reduce(lineCollapseReducer, state);
}

describe('line collapse — the default rule', () => {
  it('opens the line the operator is working and closes its siblings', () => {
    assert.equal(isLineExpanded(LINE_COLLAPSE_INITIAL, ACTIVE, ACTIVE), true);
    assert.equal(isLineExpanded(LINE_COLLAPSE_INITIAL, SIBLING, ACTIVE), false);
  });

  it('opens nothing when no line is active', () => {
    assert.equal(isLineExpanded(LINE_COLLAPSE_INITIAL, ACTIVE, null), false);
  });
});

describe('line collapse — pins', () => {
  it('a toggle on the ACTIVE line closes it (first press must not no-op)', () => {
    const next = reduce(LINE_COLLAPSE_INITIAL, { kind: 'toggle', lineId: ACTIVE, activeLineId: ACTIVE });
    assert.equal(isLineExpanded(next, ACTIVE, ACTIVE), false);
  });

  it('a toggle on a sibling opens it without closing the active line', () => {
    const next = reduce(LINE_COLLAPSE_INITIAL, { kind: 'toggle', lineId: SIBLING, activeLineId: ACTIVE });
    assert.equal(isLineExpanded(next, SIBLING, ACTIVE), true);
    assert.equal(isLineExpanded(next, ACTIVE, ACTIVE), true);
  });

  it('drops pins when the controller moves — a scan must never land on a line with no capture bar', () => {
    const pinnedShut = reduce(LINE_COLLAPSE_INITIAL, {
      kind: 'toggle',
      lineId: SIBLING,
      activeLineId: ACTIVE,
    });
    // Same pins, read against a NEW active line: the sibling is now the one
    // being worked, so the default rule decides it again.
    assert.equal(isLineExpanded(pinnedShut, SIBLING, SIBLING), true);
    assert.equal(isLineExpanded(pinnedShut, ACTIVE, SIBLING), false);
  });

  it('expand is idempotent — selecting an open line does not close it', () => {
    const next = reduce(LINE_COLLAPSE_INITIAL, { kind: 'expand', lineId: ACTIVE, activeLineId: ACTIVE });
    assert.equal(isLineExpanded(next, ACTIVE, ACTIVE), true);
    const again = reduce(next, { kind: 'expand', lineId: ACTIVE, activeLineId: ACTIVE });
    assert.equal(isLineExpanded(again, ACTIVE, ACTIVE), true);
  });

  it('expand re-opens a line the operator had pinned shut', () => {
    const shut = reduce(LINE_COLLAPSE_INITIAL, { kind: 'toggle', lineId: ACTIVE, activeLineId: ACTIVE });
    const open = reduce(shut, { kind: 'expand', lineId: ACTIVE, activeLineId: ACTIVE });
    assert.equal(isLineExpanded(open, ACTIVE, ACTIVE), true);
  });
});

describe('line collapse — Collapse all', () => {
  it('closes every line, the active one included', () => {
    const next = reduce(LINE_COLLAPSE_INITIAL, { kind: 'collapse-all', activeLineId: ACTIVE });
    assert.equal(isLineExpanded(next, ACTIVE, ACTIVE), false);
    assert.equal(isLineExpanded(next, SIBLING, ACTIVE), false);
  });

  it('clears pins rather than exempting a row the operator opened earlier', () => {
    const next = reduce(
      LINE_COLLAPSE_INITIAL,
      { kind: 'toggle', lineId: SIBLING, activeLineId: ACTIVE },
      { kind: 'collapse-all', activeLineId: ACTIVE },
    );
    assert.equal(isLineExpanded(next, SIBLING, ACTIVE), false);
  });

  it('expanding one line afterwards reveals only that line', () => {
    const next = reduce(
      LINE_COLLAPSE_INITIAL,
      { kind: 'collapse-all', activeLineId: ACTIVE },
      { kind: 'toggle', lineId: SIBLING, activeLineId: ACTIVE },
    );
    assert.equal(isLineExpanded(next, SIBLING, ACTIVE), true);
    assert.equal(isLineExpanded(next, ACTIVE, ACTIVE), false, 'the band gesture still holds for the rest');
  });
});
