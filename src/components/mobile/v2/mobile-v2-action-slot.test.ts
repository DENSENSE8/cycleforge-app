/** The phone top bar's page-action seam — `MobileActionSlot`. */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h, useMemo, type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactDomClient from 'react-dom/client';
import type * as TopBarModule from '../v2/MobileV2TopBar';
import type * as SearchContextModule from '../v2/MobileV2SearchContext';
import type * as ActionSlotModule from './MobileV2ActionSlot';
import type * as NextClientContext from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import type * as NextRouterContext from 'next/dist/shared/lib/app-router-context.shared-runtime';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost:3050/m/work',
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

// DYNAMIC ON PURPOSE — the one exception the static-import rule names for tests:
let createRoot: typeof ReactDomClient.createRoot;
let MobileV2TopBar: typeof TopBarModule.MobileV2TopBar;
let MobileV2SearchProvider: typeof SearchContextModule.MobileV2SearchProvider;
let MobileActionSlotProvider: typeof ActionSlotModule.MobileActionSlotProvider;
let MobileActionSlotRegistrar: typeof ActionSlotModule.MobileActionSlotRegistrar;
let MobileTopBarAction: typeof ActionSlotModule.MobileTopBarAction;
let PathnameContext: typeof NextClientContext.PathnameContext;
let SearchParamsContext: typeof NextClientContext.SearchParamsContext;
let AppRouterContext: typeof NextRouterContext.AppRouterContext;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ MobileV2TopBar } = await import('../v2/MobileV2TopBar'));
  ({ MobileV2SearchProvider } = await import('../v2/MobileV2SearchContext'));
  ({ MobileActionSlotProvider, MobileActionSlotRegistrar, MobileTopBarAction } = await import(
    './MobileV2ActionSlot'
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  const tree = (body: ReactElement | null) =>
    h(
      QueryClientProvider,
      { client: queryClient },
      h(
        AppRouterContext.Provider,
        { value: router },
        h(
          PathnameContext.Provider,
          { value: pathname },
          h(
            SearchParamsContext.Provider,
            { value: new URLSearchParams() },
            h(
              MobileV2SearchProvider,
              null,
              h(MobileActionSlotProvider, null, h(MobileV2TopBar), body),
            ),
          ),
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
      queryClient.clear();
      host.remove();
    },
  };
}

/** Every button in the bar, in DOM order — which is left-to-right order. */
const barButtons = (host: Element) =>
  Array.from(host.querySelectorAll('header button')).map(
    (b) => b.getAttribute('aria-label') ?? (b.textContent ?? '').trim(),
  );

/** A page that registers one memoized action — the documented call shape. */
function PageWithAction({ label }: { label: string }) {
  const action = useMemo(
    () => h(MobileTopBarAction, { onClick: () => {}, 'aria-label': label }, label),
    [label],
  );
  return h(MobileActionSlotRegistrar, null, action);
}

test('with no page action the top bar keeps the application switcher and scanner', () => {
  const m = mountShell(null);
  assert.deepEqual(barButtons(m.host), ['Open applications', 'Search orders', 'Go to scan']);
  m.unmount();
});

test("a page's verb reaches the host bar before the permanent scan seat", () => {
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  assert.deepEqual(barButtons(m.host), [
    'Open applications',
    'Search orders',
    'Add order',
    'Go to scan',
  ]);
  m.unmount();
});

test('the page title stays on the left while the action sits on the right', () => {
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  const header = m.host.querySelector('header')!;
  const title = header.querySelector('h1')!;
  // `/m/work` is the legacy allocation queue — use the title map's answer.
  assert.equal(title.textContent, 'Allocate');
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
  assert.deepEqual(barButtons(m.host), ['Open applications', 'Search orders', 'Go to scan']);
  m.unmount();
});

test('last writer wins — a route swap replaces the verb, never stacks it', () => {
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  m.render(h(PageWithAction, { label: 'Sync' }));
  assert.deepEqual(barButtons(m.host), [
    'Open applications',
    'Search orders',
    'Sync',
    'Go to scan',
  ]);
  m.unmount();
});

test('V2 keeps 44px touch targets while normal chrome uses rounded faces', () => {
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  const header = m.host.querySelector('header')!;
  const action = header.querySelector('button[aria-label="Add order"]')!;
  const menu = header.querySelector('button[aria-label="Open applications"]')!;
  const search = header.querySelector('button[aria-label="Search orders"]')!;
  const scan = header.querySelector('button[aria-label="Go to scan"]')!;
  for (const el of [action, menu, search, scan]) {
    const cls = el.getAttribute('class') ?? '';
    assert.match(cls, /\bh-11\b/, '44px cell = bar height');
    assert.doesNotMatch(cls, /\brounded-none\b/, 'normal chrome is not square');
    assert.doesNotMatch(cls, /before:-inset/, 'no pseudo hit region');
  }
  assert.match(menu.getAttribute('class') ?? '', /\bw-11\b/, 'switcher has a 44px box');
  assert.match(scan.getAttribute('class') ?? '', /\bw-11\b/, 'scanner has a 44px box');
  m.unmount();
});

test('search replaces the header and back restores the all-in-one bar', () => {
  const m = mountShell(null);
  const trigger = m.host.querySelector('button[aria-label="Search orders"]') as HTMLElement;
  act(() => trigger.click());
  const input = m.host.querySelector('input[aria-label="Search fulfillment orders"]');
  assert.ok(input, 'the focused contextual search field replaces normal chrome');
  assert.deepEqual(barButtons(m.host), ['Close order search', 'Paste a list']);

  const close = m.host.querySelector('button[aria-label="Close order search"]') as HTMLElement;
  act(() => close.click());
  assert.deepEqual(barButtons(m.host), ['Open applications', 'Search orders', 'Go to scan']);
  m.unmount();
});

test('Customers owns contextual search immediately right of the application switcher', () => {
  const m = mountShell(null, '/m/customers');
  assert.deepEqual(barButtons(m.host), ['Open applications', 'Search customers', 'Go to scan']);

  const trigger = m.host.querySelector('button[aria-label="Search customers"]') as HTMLElement;
  act(() => trigger.click());
  assert.ok(m.host.querySelector('input[aria-label="Search customers"]'));
  assert.deepEqual(barButtons(m.host), ['Close customer search', 'Paste a list']);
  m.unmount();
});
