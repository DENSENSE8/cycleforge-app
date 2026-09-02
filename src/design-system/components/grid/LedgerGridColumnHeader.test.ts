/**
 * Header click-to-sort is engine law — proven by a mounted click, not a grep
 * (FABLE-5.1 D7 item 14; LAWS.md X1). Retires
 * `SLOT_TABLE_ENGINE_CONTRACT.headerClickUsesIsSortable`.
 *
 *   npx tsx --test src/design-system/components/grid/LedgerGridColumnHeader.test.ts
 *
 * `select` is chrome (`isSortable` false) and `thumb` is a fact (`isSortable`
 * true). Click each header cell; `onSortColumn` fires exactly once, for `thumb`
 * only, and `aria-sort` is absent on the chrome cell. Behaviour across the
 * mount, not text in the component.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h } from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.navigator = dom.window.navigator;
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.MouseEvent = dom.window.MouseEvent;
g.PointerEvent = dom.window.MouseEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

let createRoot: typeof import('react-dom/client').createRoot;
let LedgerGridColumnHeader: typeof import('./LedgerGridColumnHeader').LedgerGridColumnHeader;
let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

before(async () => {
  ({ createRoot } = await import('react-dom/client'));
  ({ LedgerGridColumnHeader } = await import('./LedgerGridColumnHeader'));
  container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
});

after(() => {
  act(() => root.unmount());
  container.remove();
});

const COLUMNS = [
  { key: 'select', label: '', width: '32px', frozen: true },
  { key: 'thumb', label: 'Image', width: '56px' },
  { key: 'title', label: 'Item', width: '240px' },
] as const;

test('click sorts a fact column and never a chrome column', () => {
  const sorted: string[] = [];
  const layout = { isSortable: (key: string) => key !== 'select' };
  act(() => {
    root.render(
      h(LedgerGridColumnHeader, {
        columns: COLUMNS as unknown as Array<{ key: string; label: string }>,
        layout,
        onSortColumn: (key: string) => sorted.push(key),
        activeSort: null,
        sortDir: null,
      }),
    );
  });
  const cells = Array.from(container.querySelectorAll('[role="columnheader"]'));
  assert.ok(cells.length >= 2, `expected header cells, got ${cells.length}`);
  const byKey = new Map(cells.map((c) => [c.getAttribute('data-col'), c]));
  const thumb = byKey.get('thumb');
  const select = byKey.get('select') ?? cells[0];
  assert.ok(thumb, 'thumb header cell missing');

  act(() => {
    thumb!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(sorted, ['thumb']);

  act(() => {
    select!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(sorted, ['thumb'], 'select is chrome — a click must not sort');

  act(() => {
    thumb!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(sorted, ['thumb', 'thumb']);
  assert.equal(select!.getAttribute('aria-sort'), null);
});

test('no onSortColumn means no header sorts, whatever isSortable says', () => {
  const sorted: string[] = [];
  act(() => {
    root.render(
      h(LedgerGridColumnHeader, {
        columns: COLUMNS as unknown as Array<{ key: string; label: string }>,
        layout: { isSortable: () => true },
        activeSort: null,
        sortDir: null,
      }),
    );
  });
  const thumb = container.querySelector('[role="columnheader"][data-col="thumb"]');
  assert.ok(thumb);
  act(() => {
    thumb!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(sorted, []);
});
