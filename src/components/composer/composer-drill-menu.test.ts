/**
 * `+` drill menu — REQ-PLUS-01/02/03/08/09.
 *
 *   node --import tsx --test src/components/composer/composer-drill-menu.test.ts
 *
 * MOUNTED, not read. Every claim here is about behaviour ACROSS renders — a
 * page push that keeps the panel open, a back that pops without closing, a
 * close that resets the stack — which is exactly what reading the source
 * cannot see. `.test.ts` rather than `.test.tsx` on purpose: `run-unit-tests.mjs`
 * collects `*.test.ts` only, so a `.tsx` sibling would never run in `verify`.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h, type ReactElement } from 'react';
import type { ComposerDrillNode } from './ComposerDrillMenu';

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
g.MouseEvent = dom.window.MouseEvent;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout; the anchored popover refuses to place itself from a 0×0
// rect. Give the document a plausible on-screen box so the panel actually mounts.
const RECT = {
  x: 100,
  y: 100,
  top: 100,
  left: 100,
  bottom: 120,
  right: 200,
  width: 100,
  height: 20,
  toJSON: () => ({}),
} as DOMRect;
dom.window.Element.prototype.getBoundingClientRect = () => RECT;

let createRoot: typeof import('react-dom/client').createRoot;
let ComposerDrillMenu: typeof import('./ComposerDrillMenu').ComposerDrillMenu;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ ComposerDrillMenu } = await import('./ComposerDrillMenu'));
});

after(() => dom.window.close());

const doc = dom.window.document;

function mount(tree: ReactElement) {
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(tree);
  });
  return {
    host,
    render: (next: ReactElement) =>
      act(() => {
        root.render(next);
      }),
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });

const panel = () => doc.querySelector('[data-testid="composer-drill-menu"]');
const back = () => doc.querySelector('[data-testid="composer-drill-back"]');
const rows = () =>
  Array.from(panel()?.querySelectorAll('[role="menuitem"]') ?? []).map(
    (n) => n.textContent?.trim() ?? '',
  );

function tree(onFact: (id: string) => void): ComposerDrillNode[] {
  return [
    { type: 'action', id: 'this-item', label: 'This item', onSelect: () => onFact('this-item') },
    {
      type: 'submenu',
      id: 'what-happened',
      label: 'What happened',
      children: [
        { type: 'action', id: 'packed', label: 'Packed', onSelect: () => onFact('packed') },
        { type: 'action', id: 'tested', label: 'Tested', onSelect: () => onFact('tested') },
      ],
    },
    {
      type: 'submenu',
      id: 'photos',
      label: 'Photos',
      children: [
        { type: 'action', id: 'browse', label: 'Browse library', onSelect: () => onFact('browse') },
        { type: 'action', id: 'upload', label: 'Upload file', disabled: true, onSelect: () => onFact('upload') },
      ],
    },
  ];
}

/** Drives `open` the way the station host does, so close is observable. */
function mountMenu(nodes: ComposerDrillNode[]) {
  let open = false;
  const m = mount(h(ComposerDrillMenu, { nodes, open, onOpenChange: () => {} }));
  const set = (next: boolean) => {
    open = next;
    m.render(h(ComposerDrillMenu, { nodes, open, onOpenChange: (v: boolean) => set(v) }));
  };
  m.render(h(ComposerDrillMenu, { nodes, open, onOpenChange: (v: boolean) => set(v) }));
  return { ...m, isOpen: () => open, setOpen: set };
}

test('REQ-PLUS-01: the + opens one panel of rows — and no title over them', () => {
  const m = mountMenu(tree(() => {}));
  assert.equal(panel(), null, 'nothing floating before the operator asks for it');
  click(m.host.querySelector('[data-testid="composer-plus"]')!);
  assert.ok(m.isOpen(), 'the trigger reports open through the controlled prop');
  assert.ok(panel(), 'exactly one panel');
  assert.deepEqual(rows(), ['This item', 'What happened', 'Photos']);
  // Operator ruling 2026-08-30: a heading over a short list of verbs is a label
  // for a question nobody asked. The root page is rows and nothing else.
  assert.doesNotMatch(panel()!.textContent ?? '', /Add to message/);
  assert.equal(panel()!.children.length, rows().length, 'no header element at all');
  m.unmount();
});

test('REQ-PLUS-02: a submenu PUSHES into the same panel — root rows gone, back shown', () => {
  const m = mountMenu(tree(() => {}));
  m.setOpen(true);
  assert.equal(back(), null, 'the root page has nothing to go back to');
  click(panel()!.querySelectorAll('[role="menuitem"]')[1]!); // What happened
  assert.ok(panel(), 'REQ-PLUS-08 — the panel did not close to show the submenu');
  assert.ok(back(), 'a real, hittable back control');
  // A pushed page DOES get a header — it carries back, and says where you are.
  assert.match(panel()!.textContent ?? '', /What happened/);
  assert.deepEqual(rows(), ['Packed', 'Tested']);
  m.unmount();
});

test('REQ-PLUS-08: back pops one page and leaves the panel open', () => {
  const m = mountMenu(tree(() => {}));
  m.setOpen(true);
  click(panel()!.querySelectorAll('[role="menuitem"]')[1]!);
  click(back()!);
  assert.ok(panel(), 'still open');
  assert.equal(back(), null);
  assert.deepEqual(rows(), ['This item', 'What happened', 'Photos']);
  m.unmount();
});

test('REQ-PLUS-03: a leaf runs its handler and closes the whole menu', () => {
  const picked: string[] = [];
  const m = mountMenu(tree((id) => picked.push(id)));
  m.setOpen(true);
  click(panel()!.querySelectorAll('[role="menuitem"]')[1]!);
  click(panel()!.querySelectorAll('[role="menuitem"]')[0]!); // Packed
  assert.deepEqual(picked, ['packed']);
  assert.equal(m.isOpen(), false, 'the menu gets out of the way after it acts');
  m.unmount();
});

test('REQ-PLUS-09: reopening lands on the ROOT, never the page it was left on', () => {
  const m = mountMenu(tree(() => {}));
  m.setOpen(true);
  click(panel()!.querySelectorAll('[role="menuitem"]')[2]!); // Photos
  assert.deepEqual(rows(), ['Browse library', 'Upload file']);
  m.setOpen(false);
  m.setOpen(true);
  assert.deepEqual(rows(), ['This item', 'What happened', 'Photos'], 'stack reset on close');
  m.unmount();
});

test('a disabled leaf is inert — a blocked path is never a dead click', () => {
  const picked: string[] = [];
  const m = mountMenu(tree((id) => picked.push(id)));
  m.setOpen(true);
  click(panel()!.querySelectorAll('[role="menuitem"]')[2]!); // Photos
  const upload = panel()!.querySelectorAll('[role="menuitem"]')[1] as HTMLButtonElement;
  assert.equal(upload.disabled, true);
  click(upload);
  assert.deepEqual(picked, []);
  assert.ok(panel(), 'and it did not close the menu either');
  m.unmount();
});

test('an empty tree says so instead of opening a blank panel', () => {
  const m = mountMenu([]);
  m.setOpen(true);
  assert.match(panel()!.textContent ?? '', /Nothing to add yet/);
  assert.equal(
    (panel()!.querySelector('[role="menuitem"]') as HTMLButtonElement).disabled,
    true,
  );
  m.unmount();
});
