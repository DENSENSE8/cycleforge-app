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

/**
 * The select-all face is the FAMILY's declared chrome — never probed from the
 * column array.
 *
 * The header used to flip to `'flush'` whenever a `thumb` track was mounted, so
 * /shipping (To-ship) painted a faded checkmark in the top-left while
 * /shipping/exceptions — the SAME compound model with `thumb` filtered out —
 * painted the bordered square. One engine, one control, two faces, decided by
 * whether a photo column happened to be present. Operator 2026-09-04: port the
 * exceptions checkmark onto To-ship.
 *
 * Mounted, not grepped: the point is which chrome reaches `GridRowCheckbox`
 * after the header has resolved it, and reading the source for a ternary that
 * no longer exists cannot answer that.
 */
const COMPOUND_COLUMNS = COLUMNS;
const EXCEPTIONS_COLUMNS = COLUMNS.filter((c) => c.key !== 'thumb');

const paintSelectAll = (
  columns: readonly { key: string; label: string; width: string }[],
  chrome?: 'always' | 'selected-only' | 'sheets' | 'flush',
) => {
  act(() => {
    root.render(
      h(LedgerGridColumnHeader, {
        columns: columns as unknown as Array<{ key: string; label: string }>,
        layout: { isSortable: () => true },
        activeSort: null,
        sortDir: null,
        selectMode: true,
        selectionScope: 'header-chrome-test',
        ...(chrome ? { selectGutterChrome: chrome } : null),
      }),
    );
  });
  return container
    .querySelector('[role="columnheader"] [role="checkbox"]')
    ?.getAttribute('data-select-chrome');
};

test('select-all reveals on the header row hover, with or without thumb', () => {
  // Operator 2026-09-04: the top-left select-all is a hover-revealed control
  // like the row boxes below it, so an `'always'` family resolves to `'hover'`.
  // With the photo track (To-ship) …
  assert.equal(paintSelectAll(COMPOUND_COLUMNS), 'hover');
  // … and without it (Exceptions). Same engine, same control, same face — the
  // probe on `thumb` that once forked these two is still gone.
  assert.equal(paintSelectAll(EXCEPTIONS_COLUMNS), 'hover');
});

test('a family that declares its own face still gets it', () => {
  // Only `'always'` is amended into the hover reveal — a family that asked for
  // something else asked a different question, and unifying the compound desks
  // must not flatten every surface onto one face.
  assert.equal(paintSelectAll(COMPOUND_COLUMNS, 'selected-only'), 'selected-only');
});
