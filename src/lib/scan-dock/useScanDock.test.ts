/**
 * The regression this file exists for: `useScanDock` used to list `onSubmit`
 * and `rightContent` in its effect dep array. Both get a fresh identity on
 * every render at the natural call site (an inline arrow, inline JSX), so an
 * ordinary re-render unregistered and re-registered against a module-singleton
 * last-in-wins stack — churn on the scan path at best, and at worst a
 * background surface stealing the dock from the bench the operator is at.
 *
 * Mounted DOM, not file text: the invariant is about what React's scheduler
 * does with the deps, which no static read can answer.
 */
import { describe, it, beforeEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
  __resetScanDockForTests,
  getActiveScanDockPolicy,
  getScanDockContentVersion,
  subscribeScanDock,
} from './store';

let dom: JSDOM;

before(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    pretendToBeVisual: true,
  });
  const g = globalThis as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.navigator = dom.window.navigator;
  g.HTMLElement = dom.window.HTMLElement;
  g.Element = dom.window.Element;
  g.Node = dom.window.Node;
  g.IS_REACT_ACT_ENVIRONMENT = true;
});

after(() => {
  dom.window.close();
});

type Harness = {
  render: (props: { railArmed?: boolean; placeholder?: string }) => void;
  unmount: () => void;
  submits: string[];
};

async function mount(): Promise<Harness> {
  const React = (await import('react')).default;
  const { act } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { useScanDock } = await import('./useScanDock');

  const submits: string[] = [];

  function Publisher({ railArmed = false, placeholder = 'Scan' }: {
    railArmed?: boolean;
    placeholder?: string;
  }) {
    // Exactly the natural call site: a brand-new arrow and a brand-new element
    // on every render.
    useScanDock({
      id: 'receiving:unbox',
      placeholder,
      onSubmit: (v) => submits.push(v),
      rightContent: React.createElement('span', null, railArmed ? 'armed' : 'idle'),
    });
    return null;
  }

  const host = document.getElementById('root')!;
  const root = createRoot(host);

  return {
    render(props) {
      act(() => {
        root.render(React.createElement(Publisher, props));
      });
    },
    unmount() {
      act(() => root.unmount());
    },
    submits,
  };
}

describe('useScanDock', () => {
  beforeEach(() => {
    __resetScanDockForTests();
  });

  it('re-rendering with new inline callbacks does NOT re-register', async () => {
    let registrations = 0;
    subscribeScanDock(() => { registrations += 1; });

    const h = await mount();
    h.render({});
    assert.equal(registrations, 1, 'mount publishes exactly once');
    const first = getActiveScanDockPolicy();
    assert.equal(first?.id, 'receiving:unbox');

    // Three renders with a fresh arrow and fresh JSX each time.
    h.render({ railArmed: true });
    h.render({ railArmed: false });
    h.render({ railArmed: true });

    assert.equal(
      registrations,
      1,
      'a re-render must not touch the ownership stack — a re-push is how a background surface steals the dock',
    );
    assert.equal(
      getActiveScanDockPolicy(),
      first,
      'the registered policy object must be the same one, not a replacement',
    );

    h.unmount();
  });

  it('the dock still sees the LATEST callback after those re-renders', async () => {
    const h = await mount();
    h.render({});
    h.render({ railArmed: true });
    h.render({ railArmed: false });

    getActiveScanDockPolicy()?.handlers.current.onSubmit('1Z-LATEST');
    assert.deepEqual(h.submits, ['1Z-LATEST']);

    h.unmount();
  });

  it('a changed rail repaints through the content channel, not registration', async () => {
    let registrations = 0;
    subscribeScanDock(() => { registrations += 1; });

    const h = await mount();
    h.render({});
    const versionAfterMount = getScanDockContentVersion();

    h.render({ railArmed: true });
    h.render({ railArmed: false });

    assert.equal(registrations, 1);
    assert.ok(
      getScanDockContentVersion() > versionAfterMount,
      'the rail changed, so the dock must be told to re-read it',
    );

    h.unmount();
  });

  it('a changed STABLE field does re-register — that is what the stack is for', async () => {
    let registrations = 0;
    subscribeScanDock(() => { registrations += 1; });

    const h = await mount();
    h.render({ placeholder: 'Scan tracking' });
    assert.equal(registrations, 1);

    h.render({ placeholder: 'Scan PO #' });
    // release + publish
    assert.equal(registrations, 3);
    assert.equal(getActiveScanDockPolicy()?.placeholder, 'Scan PO #');

    h.unmount();
  });

  it('unmounting releases the dock', async () => {
    const h = await mount();
    h.render({});
    assert.ok(getActiveScanDockPolicy());
    h.unmount();
    assert.equal(getActiveScanDockPolicy(), null);
  });
});
