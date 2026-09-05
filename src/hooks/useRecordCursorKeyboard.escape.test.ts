/**
 * Escape precedence — overlay → LIVE SELECTION → record cursor.
 *
 *   npx tsx --test src/hooks/useRecordCursorKeyboard.escape.test.ts
 *
 * This hook is a CAPTURE-phase ambient owner: when it claims Escape it calls
 * `stopPropagation`, so nothing downstream ever runs. That is why a desk with
 * rows checked and no panel open used to eat Escape for a no-op — the key was
 * consumed by `close()` on nothing while a live selection sat on screen.
 *
 * The fix is a bail, not a reorder of listeners: with a selection live this
 * handler must return WITHOUT `preventDefault`, leaving the key for
 * `useTableSelectMode`. Asserted on a real KeyboardEvent through a real mount —
 * the guarantee is about propagation, and no source grep can see that.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h } from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

let createRoot: typeof import('react-dom/client').createRoot;
let useRecordCursorKeyboard: typeof import('./useRecordCursorKeyboard').useRecordCursorKeyboard;
let publishRecordCursor: typeof import('@/lib/record-cursor/store').publishRecordCursor;
let liveness: typeof import('@/lib/selection/selection-liveness');

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
let closed = 0;
let release: () => void;

function Probe() {
  useRecordCursorKeyboard({ enabled: true, scope: 'record' });
  return null;
}

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ useRecordCursorKeyboard } = await import('./useRecordCursorKeyboard'));
  ({ publishRecordCursor } = await import('@/lib/record-cursor/store'));
  liveness = await import('@/lib/selection/selection-liveness');

  // A surface with an OPEN record: `close` present is the case that used to
  // swallow Escape unconditionally.
  release = publishRecordCursor({
    surfaceId: 'test-grid',
    scope: 'record',
    priority: 1,
    cursor: { scope: 'record', position: 1, total: 3, prev: null, next: null, first: null },
    open: () => {},
    close: () => {
      closed += 1;
    },
  });

  container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(h(Probe)));
});

after(() => {
  release?.();
  act(() => root.unmount());
  container.remove();
});

beforeEach(() => {
  closed = 0;
  liveness.resetLiveSelectionForTest();
});

const escape = () => {
  const e = new dom.window.KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    dom.window.document.body.dispatchEvent(e);
  });
  return e;
};

describe('Escape precedence', () => {
  it('with NO selection the record cursor still owns Escape and closes the record', () => {
    const e = escape();
    assert.equal(closed, 1, 'the open record must still close');
    assert.equal(e.defaultPrevented, true, 'and the key is consumed');
  });

  it('with a LIVE selection it yields — no close, and the key stays available', () => {
    liveness.setLiveSelectionCount('orders', 2);
    const e = escape();
    assert.equal(closed, 0, 'the record plane must not close first');
    // The whole point: not consumed, so `useTableSelectMode` gets to clear.
    assert.equal(e.defaultPrevented, false, 'must not preventDefault when yielding');
  });

  it('once the selection clears, the NEXT Escape closes the record', () => {
    // Nothing is unreachable — the record plane is one press further down.
    liveness.setLiveSelectionCount('orders', 2);
    escape();
    assert.equal(closed, 0);
    liveness.setLiveSelectionCount('orders', 0);
    escape();
    assert.equal(closed, 1);
  });
});
