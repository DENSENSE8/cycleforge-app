/**
 * The Stack is MOUNTED on the desk rail — `RailStackBands` inside
 * `SidebarNavColumn`, over `stackModel`.
 *
 *   node --import tsx --test src/components/sidebar/sidebar-nav-column.stack.test.ts
 *
 * Mounted, not read. `RailStackBands` has its own render test and the fold has
 * its own unit test; neither can see the thing this file is about — the bands
 * being *wired into the column*. The column decides whether they render at all
 * (`everOpened`, the hover-peek face), which model they get, and what sits
 * above and below them, and none of that is visible from either file alone.
 *
 * `.test.ts`, not `.test.tsx`, and `createElement` rather than JSX:
 * `run-unit-tests.mjs` collects `*.test.ts` only, so a `.tsx` sibling would
 * never run in `verify`.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h, type ReactElement } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  // A real origin, not `about:blank` — the column's resize hook reads
  // `localStorage`, which jsdom only exposes on a non-opaque origin.
  url: 'https://localhost/',
  pretendToBeVisual: true,
});

/** jsdom ships no ResizeObserver; nothing under test measures, so an inert one does. */
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

/**
 * Install one jsdom global, by name.
 *
 * One property at a time rather than `Object.assign(globalThis, {…})`: on Node
 * 26 `navigator` is an accessor with no setter, so a bulk assign throws
 * `Cannot set property navigator of #<Object> which has only a getter` before a
 * single test runs and takes the whole file with it. `defineProperty` installs
 * jsdom's over the top of it — and it is a write, not a cast, so nothing here
 * has to lie about a type to `globalThis`. (Same helper as `ArrivalCard.test.ts`.)
 */
function installGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

Object.defineProperty(dom.window, 'ResizeObserver', {
  value: NoopResizeObserver,
  configurable: true,
  writable: true,
});

installGlobal('window', dom.window);
installGlobal('document', dom.window.document);
installGlobal('navigator', dom.window.navigator);
installGlobal('HTMLElement', dom.window.HTMLElement);
installGlobal('Element', dom.window.Element);
installGlobal('Node', dom.window.Node);
installGlobal('MouseEvent', dom.window.MouseEvent);
installGlobal('KeyboardEvent', dom.window.KeyboardEvent);
installGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
// The column paints through `motion.aside`, and framer drives its frame loop off
// the GLOBAL rAF — which jsdom only hangs on its own window.
installGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
installGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
installGlobal('ResizeObserver', NoopResizeObserver);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

// jsdom has no layout, so anything that measures itself reads a 0×0 rect. Give
// the document a plausible on-screen box — the same stub the composer
// drill-menu and Arrival Card tests mount under.
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

type AppRouterContextModule =
  typeof import('next/dist/shared/lib/app-router-context.shared-runtime');

let createRoot: typeof import('react-dom/client').createRoot;
let SidebarNavColumn: typeof import('./SidebarNavColumn').SidebarNavColumn;
/**
 * The column calls `useRouter()`, which throws outright when the app-router
 * context is unmounted. Mount the REAL provider with an inert router rather
 * than fake the module — this is the same context `next/navigation` reads.
 */
let AppRouterContext: AppRouterContextModule['AppRouterContext'];

/**
 * An inert router. Nothing in these tests clicks a Stack row: the shift is
 * empty (`armed: null` / `earlier: []` / `queues: []`), so the only band with a
 * control is Find, which never touches the router. It is here because
 * `useRouter()` must find something, not because a navigation is under test.
 * `hmrRefresh` is part of the dev-time surface of the interface — cheaper to
 * carry than to keep in step with.
 */
const router = {
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
  hmrRefresh: () => {},
} as AppRouterInstance;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  const ctx: AppRouterContextModule = await import(
    'next/dist/shared/lib/app-router-context.shared-runtime'
  );
  AppRouterContext = ctx.AppRouterContext;
  ({ SidebarNavColumn } = await import('./SidebarNavColumn'));
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
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/**
 * The column as `ResponsiveLayout` mounts it, open — the state the desk rail
 * actually stands in. `children` stands in for the spine's page map, so the
 * test can also see that mounting the Stack did not displace it.
 */
function mountColumn() {
  return mount(
    h(
      AppRouterContext.Provider,
      { value: router },
      h(SidebarNavColumn, {
        open: true,
        onOpenChange: () => {},
        children: h('div', { 'data-testid': 'spine-page-map' }, 'Pinned · Recents'),
      }),
    ),
  );
}

const bands = () => doc.querySelector('[data-testid="rail-stack-bands"]');

test('the Stack is mounted on the open column', () => {
  const m = mountColumn();
  const el = bands();
  assert.ok(el, 'RailStackBands is wired into the column, not merely importable');
  assert.ok(doc.body.contains(el), 'and it is in the document, not a detached tree');
  m.unmount();
});

test('the first band is NOW — the shift reads armed-first', () => {
  const m = mountColumn();
  const first = bands()?.querySelector('[data-stack-band]');
  assert.ok(first, 'the four bands paint even on an empty shift');
  assert.equal(first?.getAttribute('data-stack-band'), 'now');
  // The uppercase is CSS's job (`BAND_LABEL_CLASS`), so the DOM text stays
  // sentence-case for screen readers — fold the case rather than assert paint
  // from a jsdom that applies no stylesheet.
  assert.equal((first?.textContent ?? '').trim().toUpperCase(), 'NOW');
  m.unmount();
});

test('the Stack sits above the page map, and displaces no nav leaf', () => {
  const m = mountColumn();
  const stack = bands();
  const map = doc.querySelector('[data-testid="spine-page-map"]');
  assert.ok(stack, 'bands mounted');
  assert.ok(map, 'the spine still renders its own rows under them');
  const mapFollowsStack =
    stack && map
      ? Boolean(
          stack.compareDocumentPosition(map) &
            dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        )
      : false;
  assert.ok(mapFollowsStack, 'bands come before the page map — Stack first, map under it');
  m.unmount();
});
