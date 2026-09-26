import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createElement, StrictMode, act } from 'react';

/** The hook decides `AnimatePresence mode` / `initial` / stacking on a station overlay, so the value it returns on the MOUNT render is what… */
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.IS_REACT_ACT_ENVIRONMENT = true;

// Imported after the DOM globals above exist, not hoisted above them.
let createRoot: typeof import('react-dom/client').createRoot;
let useOverlaySwapHardCut: typeof import('./use-overlay-swap-hard-cut').useOverlaySwapHardCut;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ useOverlaySwapHardCut } = await import('./use-overlay-swap-hard-cut'));
});

after(() => dom.window.close());

/** Every value the hook returned, one entry per render pass (double-invoke included). */
function mountProbe(strict: boolean) {
  const seen: boolean[] = [];
  function Probe({ open }: { open: boolean }) {
    seen.push(useOverlaySwapHardCut(open));
    return null;
  }
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  const render = (open: boolean) => {
    const tree = createElement(Probe, { open });
    act(() => {
      root.render(strict ? createElement(StrictMode, null, tree) : tree);
    });
  };
  return { seen, render, unmount: () => act(() => root.unmount()) };
}

test('an overlay that mounts already open never hard-cuts on the first render', () => {
  const probe = mountProbe(false);
  probe.render(true);
  assert.deepEqual(
    probe.seen,
    [false],
    'the mount render is the one hydration compares against the server — a `true` here is z-index 101 over the server`s 100',
  );
  probe.unmount();
});

test('StrictMode`s double-invoke cannot move the mount answer', () => {
  const probe = mountProbe(true);
  probe.render(true);
  assert.ok(probe.seen.length >= 2, 'StrictMode should have run the body more than once');
  assert.deepEqual(
    new Set(probe.seen),
    new Set([false]),
    'every pass of the mount render must agree — the old shape answered false then true',
  );
  probe.unmount();
});

test('an entity swap inside an open overlay hard-cuts', () => {
  const probe = mountProbe(false);
  probe.render(true); // first open — fade
  probe.render(true); // carton B while the overlay stays open — cover-replace
  assert.deepEqual(probe.seen, [false, true]);
  probe.unmount();
});

test('close then reopen fades again', () => {
  const probe = mountProbe(false);
  probe.render(true);
  probe.render(true);
  probe.render(false); // back to browse
  probe.render(true); // a fresh open, not a swap
  assert.deepEqual(probe.seen, [false, true, false, false]);
  probe.unmount();
});
