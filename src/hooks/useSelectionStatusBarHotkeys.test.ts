import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
});
// `navigator` is a getter-only global in Node 26 — assigning it throws, and
// nothing here reads it.
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  KeyboardEvent: dom.window.KeyboardEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
});

import { registerScanTarget } from '@/lib/scan-hotkey/store';
import { useSelectionStatusBarHotkeys } from './useSelectionStatusBarHotkeys';

let container: HTMLDivElement;
let root: Root;

before(() => {
  container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
});

after(() => {
  act(() => root.unmount());
  container.remove();
});

/** Mount the hook with two lettered verbs and report what it fired. */
function mount() {
  const fired: string[] = [];
  function Harness() {
    useSelectionStatusBarHotkeys([
      { key: 'ship-by', hotkey: 'b', onClick: () => fired.push('ship-by') },
      { key: 'print', hotkey: 'p', onClick: () => fired.push('print') },
    ]);
    return null;
  }
  act(() => root.render(h(Harness)));
  return fired;
}

function press(key: string, init: { metaKey?: boolean } = {}) {
  act(() => {
    dom.window.document.body.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key, bubbles: true, ...init }),
    );
  });
}

/** A mounted scan bar — what `hasScanTarget()` reads. */
function armScanner(): () => void {
  return registerScanTarget({ focus: () => {}, armNext: () => {} });
}

describe('selection status-bar hotkeys', () => {
  it('fires a lettered verb when nothing suppresses it', () => {
    const fired = mount();
    press('b');
    assert.deepEqual(fired, ['ship-by']);
  });

  it('does NOT fire on a chord — ⌘C must stay native copy', () => {
    const fired = mount();
    press('p', { metaKey: true });
    assert.deepEqual(fired, []);
  });

  it('goes INERT while a scanner is armed', () => {
    // The bug: this listener is on `window` in CAPTURE phase and fires single
    // letters whenever a selection exists. A wedge scan of `SKU-1129` on a
    // station with rows checked was Ship-by, then Product labels, then
    // Shipping labels — verbs run by a gesture nobody thinks of as typing.
    const fired = mount();
    const disarm = armScanner();
    press('b');
    press('p');
    assert.deepEqual(fired, [], 'a scan must fire no verbs');
    disarm();
  });

  it('comes back the moment the scan bar unmounts', () => {
    const fired = mount();
    const disarm = armScanner();
    press('b');
    assert.deepEqual(fired, []);
    disarm();
    press('b');
    assert.deepEqual(fired, ['ship-by'], 'the guard is armed-only, never sticky');
  });

  it('drops every character of a wedge payload, not just the bound ones', () => {
    const fired = mount();
    const disarm = armScanner();
    for (const ch of 'SKU-1129B-P') press(ch);
    assert.deepEqual(fired, []);
    disarm();
  });
});
