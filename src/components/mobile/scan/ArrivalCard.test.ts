/**
 * The Arrival Card renders the pure model, and only the pure model.
 *
 *   node --import tsx --test src/components/mobile/scan/ArrivalCard.test.ts
 *
 * MOUNTED, not read. The three claims are the ones a grep cannot make: the
 * header is the dispatch table's session title (not a second spelling of
 * `Arrival · {carrier} {last4}` formatted beside it), exactly ONE button on the
 * whole Card carries the design-system `primary` fill, and the verb on it is
 * the one `arrivalRecommendation` preselected for two waiting orders.
 *
 * `.test.ts` rather than `.test.tsx` on purpose: `run-unit-tests.mjs` collects
 * `*.test.ts` only, so a `.tsx` sibling would never run in `verify`. Hence
 * `createElement` instead of JSX.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h } from 'react';
import { BUTTON_VARIANTS } from '@/design-system/primitives/button-variants';
import { arrivalRecommendation, arrivalTitle } from '@/lib/scan/arrival-card';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
});

/**
 * Install one jsdom global, by name.
 *
 * One property at a time rather than `Object.assign(globalThis, {…})`: on Node
 * 26 `navigator` is an accessor with no setter, so a bulk assign throws
 * `Cannot set property navigator of #<Object> which has only a getter` before a
 * single test runs and takes the whole file with it. `defineProperty` installs
 * jsdom's over the top of it — and it is a write, not a cast, so nothing here
 * has to lie about a type to `globalThis`.
 */
function installGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

installGlobal('window', dom.window);
installGlobal('document', dom.window.document);
installGlobal('navigator', dom.window.navigator);
installGlobal('HTMLElement', dom.window.HTMLElement);
installGlobal('Element', dom.window.Element);
installGlobal('Node', dom.window.Node);
installGlobal('MouseEvent', dom.window.MouseEvent);
installGlobal('KeyboardEvent', dom.window.KeyboardEvent);
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

let createRoot: typeof import('react-dom/client').createRoot;
let ArrivalCard: typeof import('./ArrivalCard').ArrivalCard;
let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ ArrivalCard } = await import('./ArrivalCard'));
  container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
});

after(() => {
  act(() => root.unmount());
  container.remove();
  dom.window.close();
});

/** A real UPS 1Z number, so the route decodes to `carrier-tracking` for real. */
const TRACKING = '1Z999AA10123456784';

/** The one class that IS `variant="primary"` — the design-system fill, not a look-alike. */
const PRIMARY_FILL = BUTTON_VARIANTS.primary.split(' ')[0];

function render(pendingOrdersForCarton = 0, rackHasSpace = true) {
  act(() => {
    root.render(
      h(ArrivalCard, {
        tracking: TRACKING,
        carrier: 'UPS',
        seller: 'Acme Supply',
        expectedCartons: 3,
        arrivedCartons: 1,
        pendingOrdersForCarton,
        rackHasSpace,
        onUnboxNow: () => {},
        onRack: () => {},
        onPhotos: () => {},
      }),
    );
  });
}

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'));
}

function primaryButtons(): HTMLButtonElement[] {
  return buttons().filter((b) => b.className.split(/\s+/).includes(PRIMARY_FILL));
}

test('the header is the dispatch table session title', () => {
  render();
  const heading = container.querySelector('h2');
  assert.ok(heading, 'the Card renders no header');

  // Asked, not re-derived — the same string `arrivalTitle` hands the session.
  const expected = arrivalTitle(TRACKING);
  assert.equal(expected, 'Arrival · UPS 6784');
  assert.equal(heading.textContent, expected);
});

test('exactly one primary button, whatever the recommendation is', () => {
  render(2);
  assert.equal(primaryButtons().length, 1, 'two primaries is a menu, not a recommendation');

  // The rack-it recommendation must not add a second primary either.
  render(0, true);
  assert.equal(primaryButtons().length, 1);

  // …and the loser is still offered beside it.
  const verbs = buttons()
    .map((b) => b.getAttribute('data-arrival-verb'))
    .filter((v) => v !== null);
  assert.deepEqual([...verbs].sort(), ['rack', 'unbox']);
});

test('two orders waiting puts Unbox now on the primary', () => {
  render(2);
  const primary = primaryButtons()[0];
  assert.ok(primary, 'no primary button rendered');
  assert.equal(primary.getAttribute('data-arrival-verb'), 'unbox');

  const label = primary.textContent ?? '';
  assert.ok(
    label.startsWith('Unbox now'),
    `expected the primary to read "Unbox now", got ${JSON.stringify(label)}`,
  );

  // The words are the model's, suffix and all — `arrivalRecommendation` appends
  // the waiting count to the verb, and the Card prints that rather than a
  // second spelling of it.
  assert.equal(label, arrivalRecommendation({ pendingOrdersForCarton: 2 }).actions[0].label);
  assert.equal(label, 'Unbox now · 2 orders waiting');
});
