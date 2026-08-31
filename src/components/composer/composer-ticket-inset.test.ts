/**
 * Ticket composer chrome — the channel toggle on the action bar (right of `+`)
 * and the Cc / attached-context rows above the draft.
 * REQ-CHAN-01/02/03, REQ-CC-01/02/04, REQ-PLUS-04 (chip).
 *
 *   node --import tsx --test src/components/composer/composer-ticket-inset.test.ts
 *
 * MOUNTED. The claim under test is that the channel is READABLE without opening
 * anything and that the audience row appears and disappears with it — state
 * across renders, not a string in a file. `.test.ts` rather than `.test.tsx`
 * because `run-unit-tests.mjs` collects `*.test.ts` only.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h, type ReactElement } from 'react';
// STATIC, not dynamic. tsx compiles this file to CJS, so a `await import(…)`
// here would load @tanstack/react-query's ESM build while `src/**` loads its
// CJS build — two module instances, two React contexts, and a provider the
// component under test cannot see (the classic dual-package hazard).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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

const RECT = {
  x: 0, y: 0, top: 0, left: 0, bottom: 20, right: 100, width: 100, height: 20,
  toJSON: () => ({}),
} as DOMRect;
dom.window.Element.prototype.getBoundingClientRect = () => RECT;

// The agent roster is the CC type-ahead pool. Serve it locally — this test is
// about what the strip does with the answer, not about the endpoint.
g.fetch = async () =>
  new dom.window.Response(JSON.stringify({ agents: [{ email: 'agent@co.com' }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

let createRoot: typeof import('react-dom/client').createRoot;
let ComposerTicketInsetChrome: typeof import('./ComposerTicketInsetChrome').ComposerTicketInsetChrome;
let ComposerTicketChannelToggle: typeof import('./ComposerTicketChannelToggle').ComposerTicketChannelToggle;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ ComposerTicketInsetChrome } = await import('./ComposerTicketInsetChrome'));
  ({ ComposerTicketChannelToggle } = await import('./ComposerTicketChannelToggle'));
});

after(() => dom.window.close());

const doc = dom.window.document;

function mount(tree: ReactElement) {
  const host = doc.createElement('div');
  doc.body.appendChild(host);
  const root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrap = (node: ReactElement) => h(QueryClientProvider, { client }, node);
  act(() => {
    root.render(wrap(tree));
  });
  return {
    host,
    render: (next: ReactElement) => act(() => root.render(wrap(next))),
    unmount: () => {
      act(() => root.unmount());
      client.clear();
      host.remove();
    },
  };
}

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });

const q = (id: string) => doc.querySelector(`[data-testid="${id}"]`);
const channelFace = (label: 'Internal' | 'Public') =>
  Array.from(q('composer-ticket-channel')!.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').includes(label),
  )!;
const all = (id: string) => Array.from(doc.querySelectorAll(`[data-testid="${id}"]`));

type InsetState = {
  isPublic: boolean;
  ccs: string[];
  ccDraft: string;
};

/** Mounts the chrome as a controlled surface, the way LineNotesCard drives it. */
function mountInset(initial: Partial<InsetState> = {}) {
  const state: InsetState = { isPublic: false, ccs: [], ccDraft: '', ...initial };
  let render = (_: InsetState) => {};
  // The dock puts these in two slots of ONE shell — top rows and action bar.
  // Mounted together here for the same reason: the channel drives the Cc row.
  const node = () =>
    h(
      'div',
      null,
      h(ComposerTicketInsetChrome, {
      isPublic: state.isPublic,
      ccs: state.ccs,
      onCcsChange: (next: string[]) => {
        state.ccs = next;
        render(state);
      },
      ccDraft: state.ccDraft,
      onCcDraftChange: (next: string) => {
        state.ccDraft = next;
        render(state);
      },
      ticketId: null,
      }),
      h(ComposerTicketChannelToggle, {
        isPublic: state.isPublic,
        onIsPublicChange: (v: boolean) => {
          state.isPublic = v;
          render(state);
        },
      }),
    );
  const m = mount(node());
  render = () => m.render(node());
  return { ...m, state };
}

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

function pressEnter(input: HTMLInputElement) {
  act(() => {
    input.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
}

test('REQ-CHAN-01: the channel is on screen and Internal by default — no menu to open', () => {
  const m = mountInset();
  const channel = q('composer-ticket-channel');
  assert.ok(channel, 'the channel sits on the action bar, not behind +');
  assert.equal(channel.getAttribute('data-composer-channel'), 'internal');
  assert.match(channel.textContent ?? '', /Internal/);
  assert.match(channel.textContent ?? '', /Public/);
  // Internal with nothing staged: no rows above the field at all.
  assert.equal(q('composer-ticket-inset'), null, 'no empty rule stealing draft height');
  m.unmount();
});

test('REQ-CHAN-02/REQ-CC-04: the Cc row belongs to Public and only to Public', () => {
  const m = mountInset();
  assert.equal(q('composer-ticket-cc-strip'), null, 'an internal note has no audience to name');
  click(channelFace('Public'));
  assert.equal(
    q('composer-ticket-channel')!.getAttribute('data-composer-channel'),
    'public',
  );
  assert.ok(q('composer-ticket-cc-strip'), 'REQ-CHAN-02 — one tap from Ticket');
  assert.ok(q('composer-ticket-cc-input'));
  // The Cc row lands at the TOP of the composer, never on the action bar.
  assert.ok(q('composer-ticket-inset')!.contains(q('composer-ticket-cc-strip')!));
  m.unmount();
});

test('REQ-CHAN-03: switching back to Internal hides the Cc row and keeps the addresses', () => {
  const m = mountInset({ isPublic: true, ccs: ['a@b.co'] });
  assert.ok(q('composer-ticket-cc-strip'));
  click(channelFace('Internal'));
  assert.equal(q('composer-ticket-cc-strip'), null);
  // Preserved, not discarded: flipping to Internal to check something and back
  // must not make the operator retype the recipients. Send is what refuses to
  // use them (REQ-CC-04 / resolveComposerCcPayload).
  assert.deepEqual(m.state.ccs, ['a@b.co']);
  m.unmount();
});

test('REQ-CC-01: typing an address and pressing Enter adds one chip', () => {
  const m = mountInset({ isPublic: true });
  const input = q('composer-ticket-cc-input') as HTMLInputElement;
  typeInto(input, 'colleague@co.com');
  pressEnter(input);
  assert.deepEqual(m.state.ccs, ['colleague@co.com']);
  assert.equal(all('composer-ticket-cc-chip').length, 1);
  assert.match(all('composer-ticket-cc-chip')[0]!.textContent ?? '', /colleague@co\.com/);
  assert.equal(m.state.ccDraft, '', 'the field clears for the next one');
  m.unmount();
});

test('REQ-CC-01: junk is refused rather than turned into a chip', () => {
  const m = mountInset({ isPublic: true });
  const input = q('composer-ticket-cc-input') as HTMLInputElement;
  typeInto(input, 'not-an-email');
  pressEnter(input);
  assert.deepEqual(m.state.ccs, []);
  assert.equal(all('composer-ticket-cc-chip').length, 0);
  m.unmount();
});

test('REQ-CC-02: the chip × removes exactly that recipient', () => {
  const m = mountInset({ isPublic: true, ccs: ['a@b.co', 'c@d.co'] });
  assert.equal(all('composer-ticket-cc-chip').length, 2);
  const remove = doc.querySelector('[aria-label="Remove a@b.co"]')!;
  click(remove);
  assert.deepEqual(m.state.ccs, ['c@d.co']);
  assert.equal(all('composer-ticket-cc-chip').length, 1);
  m.unmount();
});

test('the @ affordance focuses the email field — it never attaches product context', () => {
  const m = mountInset({ isPublic: true });
  click(q('composer-ticket-cc-at')!);
  assert.equal(doc.activeElement, q('composer-ticket-cc-input'));
  assert.equal(q('composer-ticket-context'), null, 'no chip was attached by @');
  m.unmount();
});

test('there is no attached-context chip row — `+` cannot create one any more', () => {
  // Product / “what happened” chips were removed from `+` on 2026-08-30, so a
  // chip row here would be chrome for a state nothing can reach.
  const m = mountInset({ isPublic: true });
  assert.equal(q('composer-ticket-context'), null);
  assert.equal(q('composer-ticket-context-product'), null);
  m.unmount();
});
