/** Deferred hover activation — the FIRST interaction must still work. */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h, type ReactElement } from 'react';

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
g.IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no layout:
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
let HoverTooltip: typeof import('./HoverTooltip').HoverTooltip;
let CopyChipHoverMenu: typeof import('./CopyChipHoverMenu').CopyChipHoverMenu;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ HoverTooltip } = await import('./HoverTooltip'));
  ({ CopyChipHoverMenu } = await import('./CopyChipHoverMenu'));
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

/**
 * React synthesises `mouseenter` / `mouseleave` from delegated `mouseover` /
 * `mouseout`, so the test drives the events a real pointer emits — not the
 * props — and the wiring is under test rather than assumed.
 */
function pointerEnter(el: Element) {
  act(() => {
    el.dispatchEvent(
      new dom.window.MouseEvent('mouseover', { bubbles: true, relatedTarget: null }),
    );
  });
}

function pointerLeave(el: Element) {
  act(() => {
    el.dispatchEvent(
      new dom.window.MouseEvent('mouseout', {
        bubbles: true,
        relatedTarget: doc.body,
      }),
    );
  });
}

const sleep = (ms: number) =>
  act(async () => {
    await new Promise((r) => dom.window.setTimeout(r, ms));
  });

function tooltips() {
  return Array.from(doc.querySelectorAll('[role="tooltip"]'));
}

function tooltipText() {
  return tooltips().map((n) => n.textContent).join('|');
}

// --- HoverTooltip -----------------------------------------------------------

const tip = (props: Record<string, unknown> = {}) =>
  h(
    HoverTooltip,
    { label: 'Received 2 days ago', className: 'trig', ...props } as never,
    h('b', null, 'RCV'),
  );

test('the trigger paints alone — no tooltip machinery before a pointer arrives', () => {
  const m = mount(tip());
  const trigger = m.host.querySelector('span.trig');
  assert.ok(trigger, 'the wrapper span is still the trigger');
  assert.equal(trigger.innerHTML, '<b>RCV</b>', 'children render unchanged');
  assert.equal(trigger.getAttribute('tabindex'), '0', 'focusable trigger keeps its tab stop');
  assert.equal(tooltips().length, 0, 'the bubble was never in the DOM before opening');
  m.unmount();
});

test('the FIRST pointer enter shows the label', () => {
  const m = mount(tip());
  const trigger = m.host.querySelector('span.trig')!;
  pointerEnter(trigger);
  assert.equal(tooltips().length, 1, 'first hover opens — the interaction is carried into the mount');
  assert.match(tooltipText(), /Received 2 days ago/);
  const bubble = tooltips()[0] as HTMLElement;
  assert.equal(bubble.style.visibility, 'visible', 'positioned, not parked off-screen');
  m.unmount();
});

test('the FIRST focus shows the label — keyboard is not a second-class path', () => {
  const m = mount(tip());
  const trigger = m.host.querySelector('span.trig') as HTMLElement;
  act(() => {
    trigger.focus();
  });
  assert.equal(tooltips().length, 1);
  assert.match(tooltipText(), /Received 2 days ago/);
  act(() => {
    trigger.blur();
  });
  assert.equal(tooltips().length, 0, 'blur dismisses');
  m.unmount();
});

test('arming changes nothing about the trigger element — no layout shift, no a11y move', () => {
  const m = mount(tip());
  const trigger = m.host.querySelector('span.trig')!;
  const before = trigger.outerHTML;
  pointerEnter(trigger);
  pointerLeave(trigger);
  // The engine is mounted for good now; the trigger must be byte-identical to the pre-hover trigger.
  assert.equal(m.host.querySelector('span.trig')!.outerHTML, before);
  m.unmount();
});

test('pointer leave hides the bubble, and a second hover reopens it', () => {
  const m = mount(tip());
  const trigger = m.host.querySelector('span.trig')!;
  pointerEnter(trigger);
  assert.equal(tooltips().length, 1);
  pointerLeave(trigger);
  assert.equal(tooltips().length, 0);
  pointerEnter(trigger);
  assert.equal(tooltips().length, 1, 'the kept-mounted engine still answers');
  m.unmount();
});

test('enter then leave inside one tick never opens behind the operator', () => {
  const m = mount(tip());
  const trigger = m.host.querySelector('span.trig')!;
  // Both events land before React commits the arming render, so the engine
  // mounts with no live intent. A destructive/ignored intent would either open
  // a bubble nobody is pointing at or lose the interaction entirely.
  act(() => {
    trigger.dispatchEvent(
      new dom.window.MouseEvent('mouseover', { bubbles: true, relatedTarget: null }),
    );
    trigger.dispatchEvent(
      new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: doc.body }),
    );
  });
  assert.equal(tooltips().length, 0);
  m.unmount();
});

test('openDelayMs: a cross-hover leaves no pending timer and nothing open', async () => {
  const m = mount(tip({ openDelayMs: 40 }));
  const trigger = m.host.querySelector('span.trig')!;
  pointerEnter(trigger);
  assert.equal(tooltips().length, 0, 'the dwell has not elapsed');
  pointerLeave(trigger);
  await sleep(120);
  assert.equal(tooltips().length, 0, 'the cancelled dwell never fires');
  // …and the delay still works when the operator stays.
  pointerEnter(trigger);
  await sleep(120);
  assert.equal(tooltips().length, 1);
  m.unmount();
});

test('disabled never arms, and disabling mid-hover tears the bubble down', () => {
  const m = mount(tip({ disabled: true }));
  const trigger = m.host.querySelector('span.trig')!;
  pointerEnter(trigger);
  assert.equal(tooltips().length, 0, 'a suppressed tooltip does not even pay for its engine');

  const live = mount(tip());
  const liveTrigger = live.host.querySelector('span.trig')!;
  pointerEnter(liveTrigger);
  assert.equal(tooltips().length, 1);
  live.render(tip({ disabled: true }));
  assert.equal(tooltips().length, 0, 'a sibling surface taking the hover face wins immediately');
  live.unmount();
  m.unmount();
});

test('asChild keeps the handlers on the child element and still opens first hover', () => {
  const m = mount(
    h(
      HoverTooltip,
      { label: 'Copy order id', asChild: true } as never,
      h('button', { type: 'button', className: 'trig' }, 'ORD'),
    ),
  );
  const trigger = m.host.querySelector('button.trig');
  assert.ok(trigger, 'no wrapper span was introduced');
  assert.equal(tooltips().length, 0);
  pointerEnter(trigger);
  assert.match(tooltipText(), /Copy order id/);
  m.unmount();
});

// --- CopyChipHoverMenu ------------------------------------------------------

function menuPanels() {
  return Array.from(doc.querySelectorAll('[role="menu"], [aria-label="Order actions"]'));
}

const ITEMS = [
  { id: 'copy', label: 'Copy link', onSelect: () => {} },
  { id: 'open', label: 'Open listing', onSelect: () => {} },
];

test('the chip menu paints its chip alone until the first hover, then opens on it', () => {
  const m = mount(
    h(
      CopyChipHoverMenu,
      { items: ITEMS, menuLabel: 'Order actions', className: 'chipgroup' } as never,
      h('span', null, '08-1234'),
    ),
  );
  const trigger = m.host.querySelector('div.chipgroup');
  assert.ok(trigger, 'the chip group div is the trigger');
  assert.equal(trigger.textContent, '08-1234');
  assert.equal(menuPanels().length, 0, 'no portal, no registry subscription, before the reach');

  pointerEnter(trigger);
  const panels = menuPanels();
  assert.equal(panels.length, 1, 'FIRST hover opens the menu');
  assert.match(panels[0].textContent ?? '', /Copy link/);
  assert.match(panels[0].textContent ?? '', /Open listing/);
  m.unmount();
});

test('the chip menu closes after the hand-off window and reopens on the next hover', async () => {
  const m = mount(
    h(
      CopyChipHoverMenu,
      { items: ITEMS, menuLabel: 'Order actions', className: 'chipgroup' } as never,
      h('span', null, '08-1234'),
    ),
  );
  const trigger = m.host.querySelector('div.chipgroup')!;
  pointerEnter(trigger);
  assert.equal(menuPanels().length, 1);
  pointerLeave(trigger);
  assert.equal(menuPanels().length, 1, 'the seam-crossing window is still open');
  await sleep(260);
  assert.equal(menuPanels().length, 0, 'closed once the window lapsed');
  pointerEnter(trigger);
  assert.equal(menuPanels().length, 1, 'the kept-mounted engine still answers');
  m.unmount();
});

test('one hover surface at a time — opening the next chip evicts the first', () => {
  const chip = (cls: string) =>
    h(
      CopyChipHoverMenu,
      { items: ITEMS, menuLabel: 'Order actions', className: cls } as never,
      h('span', null, cls),
    );
  const m = mount(h('div', null, chip('chip-a'), chip('chip-b')));
  const a = m.host.querySelector('div.chip-a')!;
  const b = m.host.querySelector('div.chip-b')!;

  pointerEnter(a);
  assert.equal(menuPanels().length, 1);
  // Straight across to the next chip, no leave in between — the registry, not a mouseleave, is what closes the first.
  pointerEnter(b);
  const panels = menuPanels();
  assert.equal(panels.length, 1, 'exactly one panel is painted');
  assert.match(panels[0].textContent ?? '', /Copy link/);
  m.unmount();
});

test('a chip menu with no items never arms', () => {
  const m = mount(
    h(
      CopyChipHoverMenu,
      { items: [], menuLabel: 'Order actions', className: 'chipgroup' } as never,
      h('span', null, '08-1234'),
    ),
  );
  const trigger = m.host.querySelector('div.chipgroup')!;
  pointerEnter(trigger);
  assert.equal(menuPanels().length, 0);
  m.unmount();
});

test('onOpenChange reports the open, and does not report a close that never happened', () => {
  const seen: boolean[] = [];
  const m = mount(
    h(
      CopyChipHoverMenu,
      {
        items: ITEMS,
        menuLabel: 'Order actions',
        className: 'chipgroup',
        onOpenChange: (open: boolean) => seen.push(open),
      } as never,
      h('span', null, '08-1234'),
    ),
  );
  const trigger = m.host.querySelector('div.chipgroup')!;
  assert.deepEqual(seen, [], 'a chip nobody touched reports nothing');
  pointerEnter(trigger);
  assert.deepEqual(seen, [true], 'exactly one open — never a spurious false first');
  m.unmount();
});
