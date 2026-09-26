/** The phone top bar's page-action seam — `MobileActionSlot`. */

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

// DYNAMIC ON PURPOSE — the one exception the static-import rule names for tests:
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

/** The scan CTA's accessible name off the scan surface. */
const SCAN_LABEL = 'Go to scan';

const scanCtas = (host: Element) =>
  host.querySelectorAll(`header button[aria-label="${SCAN_LABEL}"]`).length;

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
  assert.deepEqual(barButtons(m.host), ['Open menu', SCAN_LABEL]);
  assert.equal(scanCtas(m.host), 1);
  m.unmount();
});

test("a page's verb reaches the host bar, and paints LEFT of scan", () => {
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  // DOM order is the geometry: the action precedes scan, so scan keeps the
  // top-right corner it has owned since 2026-08-21.
  assert.deepEqual(barButtons(m.host), ['Open menu', 'Add order', SCAN_LABEL]);
  assert.equal(scanCtas(m.host), 1, 'a page action must never be a second scan CTA');
  m.unmount();
});

test('the page title stays on the left while the action sits on the right', () => {
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  const header = m.host.querySelector('header')!;
  const title = header.querySelector('h1')!;
  // `/m/work` is the legacy path for Order management — use the title map's
  // answer rather than pinning the retired short label.
  assert.equal(title.textContent, 'Order management');
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
  assert.deepEqual(barButtons(m.host), ['Open menu', SCAN_LABEL]);
  m.unmount();
});

test('last writer wins — a route swap replaces the verb, never stacks it', () => {
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  m.render(h(PageWithAction, { label: 'Sync' }));
  assert.deepEqual(barButtons(m.host), ['Open menu', 'Sync', SCAN_LABEL]);
  m.unmount();
});

test('the right cluster is flush square cells: bar height, no radius, no hit pseudo', () => {
  // Operator 2026-09-24: the corners are square boxes flush to the bar's top,
  // bottom and edge. The cell is the 44px touch floor itself, so a page action
  // that re-grew a soft 32px pill (or a pseudo hit region) would break the bar.
  const m = mountShell(h(PageWithAction, { label: 'Add order' }));
  const header = m.host.querySelector('header')!;
  const action = header.querySelector('button[aria-label="Add order"]')!;
  const scan = header.querySelector(`button[aria-label="${SCAN_LABEL}"]`)!;
  const menu = header.querySelector('button[aria-label="Open menu"]')!;
  for (const el of [action, scan, menu]) {
    const cls = el.getAttribute('class') ?? '';
    assert.match(cls, /\bh-11\b/, '44px cell = bar height');
    assert.match(cls, /\brounded-none\b/, 'square corner');
    assert.doesNotMatch(cls, /before:-inset/, 'no pseudo hit region');
  }
  assert.match(scan.getAttribute('class') ?? '', /\bw-11\b/, 'scan is a square box');
  assert.match(menu.getAttribute('class') ?? '', /\bw-11\b/, 'menu is a square box');
  assert.doesNotMatch(header.getAttribute('class') ?? '', /\b(p|px|py)-\d/, 'bar has no padding');
  m.unmount();
});
