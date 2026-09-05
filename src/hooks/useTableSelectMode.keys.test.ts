/**
 * ⌘A selects every visible row; Escape clears — on the SHARED hook, so every
 * selectable table in the product answers the same two keys.
 *
 *   npx tsx --test src/hooks/useTableSelectMode.keys.test.ts
 *
 * `selectEvery` shipped with "⌘A" in its docblock and zero callers, and `clear`
 * was reachable only from the header's Clear. The capability existed; the
 * gesture did not. Operator 2026-09-04: shift-click and the other industry
 * standard selection actions.
 *
 * Mounted, because the question is what the LISTENER does with a real
 * KeyboardEvent — the guards live in `suppressTableKey`, and a source grep
 * cannot tell you whether the binding is reached.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
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
g.KeyboardEvent = dom.window.KeyboardEvent;
g.Event = dom.window.Event;
g.CustomEvent = dom.window.CustomEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

type Row = { id: number };
const ROWS: Row[] = [{ id: 1 }, { id: 2 }, { id: 3 }];

let createRoot: typeof import('react-dom/client').createRoot;
let useTableSelectMode: typeof import('./useTableSelectMode').useTableSelectMode;
let container: HTMLElement;
let root: ReturnType<typeof createRoot>;
let latest: { selectedIds: ReadonlySet<number>; toggle: (id: number, extend?: boolean) => void };

function Probe() {
  latest = useTableSelectMode<Row>({
    scope: 'keys-test',
    selectMode: true,
    rows: ROWS,
    getId: (r) => r.id,
  });
  return null;
}

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ useTableSelectMode } = await import('./useTableSelectMode'));
  container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(h(Probe)));
});

after(() => {
  act(() => root.unmount());
  container.remove();
});

const press = (init: Record<string, unknown>) => {
  const e = new dom.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => {
    dom.window.document.body.dispatchEvent(e);
  });
  return e;
};

describe('useTableSelectMode standard selection keys', () => {
  it('⌘A checks every visible row', () => {
    const e = press({ key: 'a', metaKey: true });
    assert.equal(e.defaultPrevented, true, 'must stop the browser selecting page text');
    assert.deepEqual([...latest.selectedIds].sort(), [1, 2, 3]);
  });

  it('Escape clears a live selection', () => {
    const e = press({ key: 'Escape' });
    assert.equal(e.defaultPrevented, true);
    assert.equal(latest.selectedIds.size, 0);
  });

  it('Escape with nothing checked is NOT ours — it must reach the overlay behind it', () => {
    const e = press({ key: 'Escape' });
    assert.equal(e.defaultPrevented, false);
  });

  it('Ctrl+A works too — the same gesture on a Windows floor terminal', () => {
    press({ key: 'a', ctrlKey: true });
    assert.equal(latest.selectedIds.size, 3);
    press({ key: 'Escape' });
  });

  it('shift-click still extends from the anchor', () => {
    // The range walk is the gesture these two keys sit beside; it runs through
    // `toggle(id, extend)` and the anchor in `selection-anchor`.
    act(() => latest.toggle(1));
    act(() => latest.toggle(3, true));
    assert.deepEqual([...latest.selectedIds].sort(), [1, 2, 3]);
    press({ key: 'Escape' });
  });

  it('a bare "a" does nothing — only the chord selects all', () => {
    press({ key: 'a' });
    assert.equal(latest.selectedIds.size, 0);
  });
});
