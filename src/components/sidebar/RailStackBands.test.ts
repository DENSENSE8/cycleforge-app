/**
 * The rail Stack renders the pure model, in the model's order.
 *
 *   node --import tsx --test src/components/sidebar/RailStackBands.test.ts
 *
 * MOUNTED, not read. Two claims a grep cannot make: the four bands come out in
 * `stackModel`'s order (not this component's own idea of an order), and the
 * Earlier row hands `onResume` the block's OWN id rather than its list index —
 * the two are the same number in the fixture only by accident, so the fixture
 * deliberately puts the newest block second in input order.
 *
 * `.test.ts` rather than `.test.tsx` on purpose: `run-unit-tests.mjs` collects
 * `*.test.ts` only, so a `.tsx` sibling would never run in `verify`. Hence
 * `createElement` instead of JSX.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h } from 'react';
import { stackModel } from '@/lib/nav/stack-model';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
});

/**
 * Install one jsdom global, by name. One property at a time rather than a bulk
 * `Object.assign` — on Node 26 `navigator` is a getter-only accessor and a bulk
 * assign throws before a single test runs.
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

let createRoot: typeof import('react-dom/client').createRoot;
let RailStackBands: typeof import('./RailStackBands').RailStackBands;
let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ RailStackBands } = await import('./RailStackBands'));
  container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
});

after(() => {
  act(() => root.unmount());
  container.remove();
  dom.window.close();
});

const NOW = '2026-09-04T12:03:07.000Z';

/**
 * One armed block, two earlier ones, one queue.
 *
 * `earlier` is handed over OLDEST-first so the fold has to sort it: `resume-b`
 * started at 11:40 and `resume-a` at 09:15, so the rail must paint `resume-b`
 * first. A component that just mapped the input array would paint them the
 * other way round and this fixture would catch it.
 */
function model() {
  return stackModel({
    armed: {
      id: 'armed-1',
      title: 'Unbox · carton 4',
      state: 'Running',
      intervals: [{ startedAt: '2026-09-04T12:00:00.000Z', endedAt: null }],
    },
    earlier: [
      {
        id: 'resume-a',
        title: 'Pack · order 8812',
        state: 'Parked',
        intervals: [
          { startedAt: '2026-09-04T09:15:00.000Z', endedAt: '2026-09-04T09:45:00.000Z' },
        ],
      },
      {
        id: 'resume-b',
        title: 'Receive · PO 214',
        state: 'Parked',
        intervals: [
          { startedAt: '2026-09-04T11:40:00.000Z', endedAt: '2026-09-04T11:41:30.000Z' },
        ],
      },
    ],
    queues: [{ id: 'q1', label: 'To ship', tableId: 'to-ship' }],
    now: NOW,
  });
}

function render(handlers: {
  onResume?: (id: string) => void;
  onOpenQueue?: (tableId: string) => void;
  onFind?: () => void;
} = {}) {
  act(() => {
    root.render(
      h(RailStackBands, {
        model: model(),
        onResume: handlers.onResume ?? (() => {}),
        onOpenQueue: handlers.onOpenQueue ?? (() => {}),
        onFind: handlers.onFind ?? (() => {}),
      }),
    );
  });
}

function click(el: Element | null | undefined) {
  assert.ok(el, 'nothing to click');
  act(() => {
    el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

test('the four bands paint in the model order, labelled', () => {
  render();
  const labels = Array.from(container.querySelectorAll('[data-stack-band]'));

  assert.deepEqual(
    labels.map((el) => el.getAttribute('data-stack-band')),
    ['now', 'earlier', 'queues', 'find'],
  );
  assert.deepEqual(
    labels.map((el) => el.textContent),
    ['Now', 'Earlier today', 'Queues', 'Find'],
  );

  // Uppercase is the CSS's job, not the string's — the band eyebrow carries it
  // so the accessible name stays a readable sentence.
  for (const el of labels) {
    assert.ok(
      el.className.split(/\s+/).includes('uppercase'),
      `band ${el.getAttribute('data-stack-band')} is not painted uppercase`,
    );
  }
});

test('NOW carries the armed block: title, state and mm:ss elapsed', () => {
  render();
  const now = container.querySelector('[data-stack-now]');
  assert.ok(now, 'the NOW band painted no armed block');
  assert.equal(now.getAttribute('data-stack-now'), 'armed-1');
  assert.match(now.textContent ?? '', /Unbox · carton 4/);
  assert.match(now.textContent ?? '', /Running/);

  // 12:00:00 → 12:03:07 is 187s of open interval, spelled mm:ss.
  assert.equal(now.querySelector('[data-stack-elapsed]')?.textContent, '03:07');
});

test('clicking an earlier block resumes it by id', () => {
  const resumed: string[] = [];
  render({ onResume: (id) => resumed.push(id) });

  const rows = Array.from(container.querySelectorAll('[data-stack-resume]'));
  // Newest-first: `resume-b` (11:40) before `resume-a` (09:15), which is the
  // opposite of the order the fixture handed them over in.
  assert.deepEqual(
    rows.map((el) => el.getAttribute('data-stack-resume')),
    ['resume-b', 'resume-a'],
  );

  click(rows[1]);
  assert.deepEqual(resumed, ['resume-a']);

  click(rows[0]);
  assert.deepEqual(resumed, ['resume-a', 'resume-b']);
});

test('QUEUES opens by table id and FIND is one button', () => {
  const opened: string[] = [];
  let finds = 0;
  render({ onOpenQueue: (tableId) => opened.push(tableId), onFind: () => { finds += 1; } });

  const queues = Array.from(container.querySelectorAll('[data-stack-queue]'));
  assert.equal(queues.length, 1);
  assert.equal(queues[0].textContent, 'To ship');
  click(queues[0]);
  // The table id, not the queue's own row id — the Card list is opened by table.
  assert.deepEqual(opened, ['to-ship']);

  const find = container.querySelectorAll('[data-stack-find]');
  assert.equal(find.length, 1);
  click(find[0]);
  assert.equal(finds, 1);
});
