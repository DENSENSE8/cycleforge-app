/**
 * The desk Field is MOUNTED — `DeskComposerAskLane` over `deskFieldPlacement`.
 *
 *   node --import tsx --test src/components/composer/desk-composer-ask-lane.test.ts
 *
 * `desk-field.test.ts` already pins the decision as data. What it cannot see is
 * the wiring: that the lane reads the live route, that a stood-down placement
 * puts NOTHING in the document rather than an empty shell, and that the
 * placeholder the placement chose is the one the operator actually reads off the
 * textarea. All three only exist across a real render.
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
  // A real origin, not `about:blank` — the composer mode hook reads
  // `sessionStorage`, which jsdom only exposes on a non-opaque origin.
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
 * Install one jsdom global, by name. One property at a time rather than
 * `Object.assign(globalThis, {…})`: on Node 26 `navigator` is an accessor with
 * no setter, so a bulk assign throws before a single test runs and takes the
 * whole file with it. (Same helper as `sidebar-nav-column.stack.test.ts`.)
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
installGlobal('HTMLTextAreaElement', dom.window.HTMLTextAreaElement);
installGlobal('Element', dom.window.Element);
installGlobal('Node', dom.window.Node);
installGlobal('MouseEvent', dom.window.MouseEvent);
installGlobal('KeyboardEvent', dom.window.KeyboardEvent);
installGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
installGlobal('matchMedia', dom.window.matchMedia.bind(dom.window));
// The dock paints through `motion.div`, and framer drives its frame loop off the
// GLOBAL rAF — which jsdom only hangs on its own window.
installGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
installGlobal('cancelAnimationFrame', dom.window.cancelAnimationFrame.bind(dom.window));
installGlobal('ResizeObserver', NoopResizeObserver);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

// jsdom has no layout, so anything that measures itself reads a 0×0 rect. Give
// the document a plausible on-screen box — the same stub the composer
// drill-menu test mounts under.
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
type HooksClientContextModule =
  typeof import('next/dist/shared/lib/hooks-client-context.shared-runtime');

let createRoot: typeof import('react-dom/client').createRoot;
let DeskComposerAskLane: typeof import('./DeskComposerAskLane').DeskComposerAskLane;

/**
 * The REAL navigation contexts, not a faked `next/navigation` module. The lane
 * calls `usePathname()` and the mouth it mounts calls `useRouter()` /
 * `useSearchParams()`; these three providers are the same contexts those hooks
 * read, so supplying a route here exercises the production path instead of a
 * parallel one. `useRouter()` throws outright when its context is unmounted.
 */
let AppRouterContext: AppRouterContextModule['AppRouterContext'];
let PathnameContext: HooksClientContextModule['PathnameContext'];
let SearchParamsContext: HooksClientContextModule['SearchParamsContext'];

/**
 * An inert router. Nothing here navigates — the lane never calls `replace`, and
 * no test touches a mode face. It is present because `useRouter()` must find
 * something, not because a navigation is under test.
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
  const appCtx: AppRouterContextModule = await import(
    'next/dist/shared/lib/app-router-context.shared-runtime'
  );
  AppRouterContext = appCtx.AppRouterContext;
  const hooksCtx: HooksClientContextModule = await import(
    'next/dist/shared/lib/hooks-client-context.shared-runtime'
  );
  PathnameContext = hooksCtx.PathnameContext;
  SearchParamsContext = hooksCtx.SearchParamsContext;
  ({ DeskComposerAskLane } = await import('./DeskComposerAskLane'));
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

/** The lane on one route, under the navigation contexts the shell gives it. */
function mountLane(pathname: string, stationMouths = 0) {
  return mount(
    h(
      AppRouterContext.Provider,
      { value: router },
      h(
        SearchParamsContext.Provider,
        { value: new URLSearchParams() },
        h(
          PathnameContext.Provider,
          { value: pathname },
          h(DeskComposerAskLane, { stationMouths }),
        ),
      ),
    ),
  );
}

const lane = () => doc.querySelector('[data-testid="desk-composer-ask-lane"]');

test('the orders desk gets one field, and it names where a paste lands', () => {
  const m = mountLane('/shipping/orders');
  const el = lane();
  assert.ok(el, 'the desk mouth mounts on a desk route');
  assert.ok(doc.body.contains(el), 'and it is in the document, not a detached tree');

  const textareas = el!.querySelectorAll('textarea');
  assert.equal(textareas.length, 1, 'one mouth means one textarea');
  assert.equal(
    textareas[0]!.getAttribute('placeholder'),
    'Paste a CSV or a screenshot of orders to stage them',
    'the placeholder is the destination in words, not "Search…"',
  );
  m.unmount();
});

test('the mouth is present without the composer sitting in a mode that asks for it', () => {
  // The lane used to render only while the composer mode was `ask`, which left
  // desk routes with no field at all until the operator found the mode first.
  const m = mountLane('/shipping/orders');
  const host = lane()?.querySelector('[data-testid="station-composer-host"]');
  assert.ok(host, 'the field IS StationComposerHost — no forked shell');
  // Faces off, ring kept: the dumb-mouth face. Never `showModeRow={false}`.
  assert.ok(
    host!.querySelector('[data-composer-mode-faces="false"]'),
    'Unbox | Ticket are hidden',
  );
  assert.ok(
    host!.querySelector('[data-testid="composer-procedure-ring"]'),
    'and the bottom-right context ring is still there',
  );
  m.unmount();
});

test('the phone scan shell carries its own Field, so the desk lane renders nothing', () => {
  const m = mountLane('/m/scan');
  assert.equal(lane(), null, 'not a stood-down shell — nothing at all');
  assert.equal(m.host.innerHTML, '', 'and no empty wrapper left behind either');
  assert.equal(doc.querySelectorAll('textarea').length, 0, 'no second place to type');
  m.unmount();
});

test("a station's own mouth on screen stands the desk field down", () => {
  const m = mountLane('/receiving/unbox', 1);
  assert.equal(lane(), null, 'one screen gets one mouth');
  m.unmount();
});
