import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { handleSidebarNavigationKeyDown } from './sidebar-keyboard-navigation';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const globals = globalThis as unknown as Record<string, unknown>;
globals.window = dom.window;
globals.document = dom.window.document;
globals.navigator = dom.window.navigator;
globals.HTMLElement = dom.window.HTMLElement;
globals.Element = dom.window.Element;
globals.Node = dom.window.Node;
globals.KeyboardEvent = dom.window.KeyboardEvent;
globals.IS_REACT_ACT_ENVIRONMENT = true;

let container: dom.window.HTMLDivElement;
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

function press(element: Element, key: string) {
  act(() => {
    element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

test('arrow keys walk and clamp; Home and End jump to the visible bounds', () => {
  act(() => {
    root.render(
      h(
        'nav',
        { onKeyDown: handleSidebarNavigationKeyDown },
        ['Chat', 'Tasks', 'Sales'].map((label) =>
          h('button', { key: label, type: 'button', 'data-sidebar-nav-item': '' }, label),
        ),
      ),
    );
  });
  const rows = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-sidebar-nav-item]'));
  rows[0]!.focus();
  press(rows[0]!, 'ArrowDown');
  assert.equal(dom.window.document.activeElement, rows[1]);
  press(rows[1]!, 'End');
  assert.equal(dom.window.document.activeElement, rows[2]);
  press(rows[2]!, 'ArrowDown');
  assert.equal(dom.window.document.activeElement, rows[2], 'the list clamps instead of wrapping');
  press(rows[2]!, 'Home');
  assert.equal(dom.window.document.activeElement, rows[0]);
});

test('Right opens and enters a group; Left returns and collapses it', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return h(
      'nav',
      { onKeyDown: handleSidebarNavigationKeyDown },
      h(
        'button',
        {
          type: 'button',
          'data-sidebar-nav-item': '',
          'aria-expanded': open,
          'aria-controls': 'sales-children',
          onClick: () => setOpen((value) => !value),
        },
        'Sales',
      ),
      open
        ? h(
            'div',
            { id: 'sales-children' },
            h('a', { href: '/orders', 'data-sidebar-nav-item': '' }, 'Orders'),
          )
        : null,
    );
  }

  act(() => root.render(h(Harness)));
  const trigger = container.querySelector<HTMLButtonElement>('button')!;
  trigger.focus();
  press(trigger, 'ArrowRight');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  press(trigger, 'ArrowRight');
  const child = container.querySelector<HTMLAnchorElement>('a')!;
  assert.equal(dom.window.document.activeElement, child);
  press(child, 'ArrowLeft');
  assert.equal(dom.window.document.activeElement, trigger);
  press(trigger, 'ArrowLeft');
  assert.equal(trigger.getAttribute('aria-expanded'), 'false');
});
