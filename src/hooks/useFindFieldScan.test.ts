/**
 * The input truth layer, MOUNTED — HANDOFF-ai-first Phase 1's done-when:
 * a wedge burst, a paste and hand-typing into the same field produce three
 * different `source` values, proven against a real DOM.
 *
 *   npx tsx --test src/hooks/useFindFieldScan.test.ts
 *
 * These replace the three source-text guards that stood in
 * `find-field-scan.test.ts` while the adapter did not exist (X1): every
 * contract they matched by regex is asserted here as behaviour —
 *
 *   · native binding: events are dispatched straight at the element, never
 *     through React's synthetic system, and the adapter still sees them;
 *   · characters are never prevented, and an unclaimed Enter passes through
 *     to the field's own handler (the `human` path is structural);
 *   · exactly the claimed Enter is prevented AND stopped, so the field's
 *     React `onKeyDown` never fires for a value that was never its text;
 *   · side effects land OFF the keydown stack (nothing observable
 *     synchronously after dispatch);
 *   · a paste stamps `source: 'paste'` and short-circuits the burst.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h } from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
});
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.HTMLElement = dom.window.HTMLElement;
g.HTMLInputElement = dom.window.HTMLInputElement;
g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

// Imported after the JSDOM globals exist — same pattern as
// `deferred-hover-activation.test.ts`, so react-dom binds to this document.
let createRoot: typeof import('react-dom/client').createRoot;
let useFindFieldScan: typeof import('./useFindFieldScan').useFindFieldScan;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ useFindFieldScan } = await import('./useFindFieldScan'));
});

interface Logged {
  value: string;
  source: string;
}

/** Mount one input wired exactly as the composer wires it: the adapter on a
 *  native ref, and the field's own Enter behaviour as a React handler that
 *  records `human` — which the adapter must silence on a claim. */
function mount(log: Logged[]) {
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);

  function Harness() {
    const ref = useFindFieldScan({
      onScan: (claim) => log.push({ value: claim.value, source: claim.source }),
      onPaste: (paste) => log.push({ value: paste.value, source: paste.source }),
    });
    return h('input', {
      ref,
      onKeyDown: (event: { key: string }) => {
        if (event.key === 'Enter') log.push({ value: '(field submit)', source: 'human' });
      },
    });
  }

  act(() => root.render(h(Harness)));
  const input = host.querySelector('input');
  assert.ok(input, 'harness rendered an input');
  return { input: input as HTMLInputElement, root, host };
}

const keydown = (el: Element, key: string): boolean =>
  el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

const paste = (el: Element, text: string): boolean => {
  const event = new dom.window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  return el.dispatchEvent(event);
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Longer than the MessageChannel macrotask `yieldToInput` parks on. */
const settle = () => wait(25);

const mounted: Array<{ root: { unmount: () => void }; host: HTMLElement }> = [];
function harness(): { input: HTMLInputElement; log: Logged[] } {
  const log: Logged[] = [];
  const m = mount(log);
  mounted.push({ root: m.root, host: m.host });
  return { input: m.input, log };
}

after(() => {
  for (const m of mounted) {
    act(() => m.root.unmount());
    m.host.remove();
  }
});

test('a machine burst is claimed: source scanner, terminator stopped, characters untouched', async () => {
  const { input, log } = harness();

  for (const ch of 'R-1234') {
    assert.equal(keydown(input, ch), true, `character "${ch}" must never be prevented`);
  }
  const enterPassed = keydown(input, 'Enter');

  assert.equal(enterPassed, false, 'the claimed terminator is prevented');
  assert.deepEqual(log, [], 'side effects run OFF the keydown stack');

  await settle();
  assert.deepEqual(log, [{ value: 'R-1234', source: 'scanner' }]);
  // stopPropagation held: the field's own Enter handler never recorded.
});

test('a Tab-terminated burst claims too — guns are configured either way', async () => {
  const { input, log } = harness();

  for (const ch of 'R-55') keydown(input, ch);
  const tabPassed = keydown(input, 'Tab');
  await settle();

  assert.equal(tabPassed, false, 'the claimed Tab terminator is prevented');
  assert.deepEqual(log, [{ value: 'R-55', source: 'scanner' }]);

  // An UNCLAIMED Tab is untouched — focus navigation keeps working.
  assert.equal(keydown(input, 'Tab'), true);
});

test('human typing is never claimed — the field keeps its own Enter', async () => {
  const { input, log } = harness();

  for (const ch of 'R-1234') {
    keydown(input, ch);
    await wait(90); // > WEDGE_MAX_INTER_KEY_MS: the run restarts every key
  }
  const enterPassed = keydown(input, 'Enter');
  await settle();

  assert.equal(enterPassed, true, 'an unclaimed Enter is not prevented');
  assert.deepEqual(log, [{ value: '(field submit)', source: 'human' }]);
});

test('a paste stamps source paste and short-circuits the burst', async () => {
  const { input, log } = harness();

  // A claimable prefix is in flight…
  for (const ch of 'R-123') keydown(input, ch);
  // …then a paste lands. Whatever the machine had accumulated is over.
  assert.equal(paste(input, 'C-8842-A'), true, 'a paste is never prevented');
  // The stamp is delivered off-stack; settle before the next keystroke, as
  // real time would — a paste and the key after it are human-scale apart.
  await settle();
  keydown(input, '4');
  const enterPassed = keydown(input, 'Enter');
  await settle();

  assert.equal(enterPassed, true, 'post-paste remainder is not claimable');
  assert.deepEqual(log, [
    { value: 'C-8842-A', source: 'paste' },
    { value: '(field submit)', source: 'human' },
  ]);
});

test('DONE-WHEN: the same field yields three different sources for three input paths', async () => {
  const { input, log } = harness();

  // 1 — wedge burst
  for (const ch of 'R-77') keydown(input, ch);
  keydown(input, 'Enter');
  await settle();

  // 2 — paste
  paste(input, 'serial 4471');
  await settle();

  // 3 — hand-typing, then the field's own submit
  keydown(input, 'h');
  await wait(90);
  keydown(input, 'i');
  await wait(90);
  keydown(input, 'Enter');
  await settle();

  assert.deepEqual(
    log.map((entry) => entry.source),
    ['scanner', 'paste', 'human'],
  );
});

test('a chord resets the burst — the keystroke half of Ctrl+V cannot accumulate', async () => {
  const { input, log } = harness();

  for (const ch of 'R-12') keydown(input, ch);
  input.dispatchEvent(
    new dom.window.KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }),
  );
  for (const ch of '34') keydown(input, ch);
  keydown(input, 'Enter');
  await settle();

  assert.deepEqual(log, [{ value: '(field submit)', source: 'human' }]);
});
