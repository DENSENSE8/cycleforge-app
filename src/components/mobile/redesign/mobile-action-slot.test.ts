/**
 * The phone top bar's page-action seam — `MobileActionSlot`.
 *
 *   node --import tsx --test src/components/mobile/redesign/mobile-action-slot.test.ts
 *
 * MOUNTED, and it has to be: registration happens in an effect, so
 * `renderToStaticMarkup` (the convention for this folder's pure faces) can
 * never observe it. The claim under test is state across renders — a page deep
 * inside `children` reaching the host-owned bar — not a string in a file.
 *
 * `.test.ts`, not `.test.tsx`: `run-unit-tests.mjs` collects `*.test.ts` only.
 *
 * What this defends, in order of how badly it bites:
 *   1. SCAN keeps the corner (ruling 2026-08-21). A page action paints to its
 *      LEFT, and never as a second scan CTA.
 *   2. A page's verb actually reaches the bar — the whole point; the `actions`
 *      prop this replaced was unreachable for its entire life.
 *   3. The action LEAVES with its page. A stale verb in the corner is worse
 *      than none: "Add order" surviving onto Picks is a wrong tap, not a
 *      cosmetic bug.
 *   4. One action, not a cluster (SURFACE_LAW §5, 390px).
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h, useMemo, type ReactElement } from 'react';
import type * as ReactDomClient from 'react-dom/client';
import type * as TopBarModule from './MobileTopBar';
import type * as ActionSlotModule from './MobileActionSlot';
import type * as NextClientContext from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type * as NextRouterContext from 'next/dist/shared/lib/app-router-context.shared-runtime';

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

// DYNAMIC ON PURPOSE — the one exception the static-import rule names for
// tests: these modules must not evaluate until the JSDOM globals above are
// installed. `react-dom/client` reads `window`/`document` at module scope, and
// `MobileTopBar` pulls in the DS primitives behind it, so a static import
// hoists above the global assignment and the mount fails with `document is not
// defined`. Types come from the top-level `import type` namespaces, so the
// dependency graph is still declared statically.
let createRoot: typeof ReactDomClient.createRoot;
let MobileTopBar: typeof TopBarModule.MobileTopBar;
let MobileActionSlotProvider: typeof ActionSlotModule.MobileActionSlotProvider;
let MobileActionSlotRegistrar: typeof ActionSlotModule.MobileActionSlotRegistrar;
let MobileTopBarAction: typeof ActionSlotModule.MobileTopBarAction;
let PathnameContext: typeof NextClientContext.PathnameContext;
let SearchParamsContext: typeof NextClientContext.SearchParamsContext;
let AppRouterContext: typeof NextRouterContext.AppRouterContext;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ MobileTopBar } = await import('./MobileTopBar'));
  ({ MobileActionSlotProvider, MobileActionSlotRegistrar, MobileTopBarAction } = await import(
    './MobileActionSlot'
  ));
  ({ PathnameContext, SearchParamsContext } = await import(
    'next/dist/shared/lib/hooks-client-context.shared-runtime'
  ));
  ({ AppRouterContext } = await import(
    'next/dist/shared/lib/app-router-context.shared-runtime'
  ));
});

after(() => dom.window.close());

const doc = dom.window.document;

const router = {
  push: () => {},
  replace: () => {},
  back: () => {},
  forward: () => {},
  refresh: () => {},
  prefetch: () => {},
} as never;

/**
 * The shell's shape, minimally: the provider wraps the BAR and the PAGE, which
 * is the arrangement that makes the seam work at all.
 */
function mountShell(page: ReactElement | null, pathname = '/m/work') {
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const root = createRoot(host);
  const tree = (body: ReactElement | null) =>
    h(
      AppRouterContext.Provider,
      { value: router },
      h(
        PathnameContext.Provider,
        { value: pathname },
        h(
          SearchParamsContext.Provider,
          { value: new URLSearchParams() },
          h(MobileActionSlotProvider, null, h(MobileTopBar, { onMenu: () => {} }), body),
        ),
      ),
    );
  act(() => {
    root.render(tree(page));
  });
  return {
    host,
    render: (next: ReactElement | null) => act(() => root.render(tree(next))),
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/** Every button in the bar, in DOM order — which is left-to-right order. */
const barButtons = (host: Element) =>
  Array.from(host.querySelectorAll('header button')).map(
    (b) => b.getAttribute('aria-label') ?? (b.textContent ?? '').trim(),
  );

const scanCtas = (host: Element) =>
  host.querySelectorAll('header button[aria-label="Go to scan"]').length;

/** A page that registers one memoized action — the documented call shape. */
function PageWithAction({ label }: { label: string }) {
  const action = useMemo(
    () => h(MobileTopBarAction, { onClick: () => {}, 'aria-label': label }, label),
    [label],
  );
  return h(MobileActionSlotRegistrar, null, action);
}

test('with no page action the right cluster is SCAN alone', () => {
  const m = mountShell(null);
  assert.deepEqual(barButtons(m.host), ['Open menu', 'Go to scan']);
  assert.equal(scanCtas(m.host), 1);
  m.unmount();
});

test("a page's verb reaches the host bar, and paints LEFT of scan", () => {
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  // DOM order is the geometry: the action precedes scan, so scan keeps the
  // top-right corner it has owned since 2026-08-21.
  assert.deepEqual(barButtons(m.host), ['Open menu', 'Add order', 'Go to scan']);
  assert.equal(scanCtas(m.host), 1, 'a page action must never be a second scan CTA');
  m.unmount();
});

test('the page title stays on the left while the action sits on the right', () => {
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  const header = m.host.querySelector('header')!;
  const title = header.querySelector('h1')!;
  // `/m/work` is Orders — the title map's answer, not a retyped string.
  assert.equal(title.textContent, 'Orders');
  const action = header.querySelector('button[aria-label="Add order"]')!;
  assert.ok(
    title.compareDocumentPosition(action) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
    'the action must come after the title',
  );
  m.unmount();
});

test('the action LEAVES with its page — no stale verb in the corner', () => {
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  assert.ok(barButtons(m.host).includes('Add order'));
  // Route swap to a page that registers nothing (e.g. Picks).
  m.render(null);
  assert.deepEqual(barButtons(m.host), ['Open menu', 'Go to scan']);
  m.unmount();
});

test('last writer wins — a route swap replaces the verb, never stacks it', () => {
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  m.render(h(PageWithAction, { label: 'Sync' }));
  assert.deepEqual(barButtons(m.host), ['Open menu', 'Sync', 'Go to scan']);
  m.unmount();
});

test('the pair is one control ladder: the action paints at scan height', () => {
  // The regression this defends is measured: painting the full 44px hit target
  // instead of 32px is what once made this bar 60px tall. `MobileTopBarAction`
  // locks the face so a page cannot re-tallen the chrome.
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  const header = m.host.querySelector('header')!;
  const action = header.querySelector('button[aria-label="Add order"]')!;
  const scan = header.querySelector('button[aria-label="Go to scan"]')!;
  for (const el of [action, scan]) {
    const cls = el.getAttribute('class') ?? '';
    assert.match(cls, /\bh-8\b/, '32px painted control');
    assert.match(cls, /before:-inset-1\.5/, '44px hit region via the pseudo-element');
  }
  m.unmount();
});
