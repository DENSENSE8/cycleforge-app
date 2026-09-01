import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement as h, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRowGestures } from './useRowGestures';

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
g.KeyboardEvent = dom.window.KeyboardEvent;
g.IS_REACT_ACT_ENVIRONMENT = true;

interface Row {
  id: number;
}
const ROWS: Row[] = [{ id: 10 }, { id: 20 }, { id: 30 }, { id: 40 }, { id: 50 }];

/** What the harness observed — the surface's selection model, in miniature. */
interface Probe {
  selected: number[];
  opened: number[];
  dismissals: number;
  cursor: number | null;
  tabStops: number[];
}

let container: dom.window.HTMLDivElement;
let root: Root;

before(() => {
  container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  root = createRoot(container);
});

after(() => {
  act(() => root.unmount());
  container.remove();
});

/**
 * Mount a table region wired to the hook and return a key driver.
 *
 * `dismissHandled` mimics an open record form: Escape closes it and the
 * selection must survive.
 */
function mount(options: { dismissHandled?: boolean } = {}) {
  const probe: Probe = {
    selected: [],
    opened: [],
    dismissals: 0,
    cursor: null,
    tabStops: [],
  };

  function Harness() {
    const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
    const api = useRowGestures<Row>({
      rows: ROWS,
      getId: (r) => r.id,
      selectedIds,
      onSelectionChange: (ids) => {
        setSelectedIds(ids);
        probe.selected = [...ids].sort((a, b) => a - b);
      },
      onOpen: (id) => probe.opened.push(id),
      onDismiss: () => {
        if (!options.dismissHandled) return false;
        probe.dismissals += 1;
        return true;
      },
    });
    probe.cursor = api.cursorId;
    probe.tabStops = ROWS.filter((r) => api.rowTabIndex(r.id) === 0).map((r) => r.id);

    return h(
      'div',
      { 'data-region': true, onKeyDown: api.onKeyDown, tabIndex: -1 },
      ROWS.map((r) =>
        h('div', { key: r.id, 'data-row': r.id, tabIndex: api.rowTabIndex(r.id) }),
      ),
    );
  }

  act(() => root.render(h(Harness)));

  const region = container.querySelector('[data-region]') as HTMLElement;

  function press(
    key: string,
    init: { shiftKey?: boolean; metaKey?: boolean } = {},
    from: Element = region,
  ) {
    act(() => {
      from.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key, bubbles: true, ...init }),
      );
    });
  }

  return { probe, press, region };
}

describe('the cursor', () => {
  it('opens on the first row and walks down', () => {
    const { probe, press } = mount();
    press('j');
    assert.equal(probe.cursor, 10);
    press('j');
    assert.equal(probe.cursor, 20);
    press('ArrowDown');
    assert.equal(probe.cursor, 30);
  });

  it('walks back up and CLAMPS at the top', () => {
    const { probe, press } = mount();
    press('j');
    press('k');
    assert.equal(probe.cursor, 10, 'clamped, not wrapped to the last row');
  });

  it('clamps at the bottom under a held arrow', () => {
    const { probe, press } = mount();
    for (let i = 0; i < 12; i += 1) press('ArrowDown');
    assert.equal(probe.cursor, 50);
  });

  it('jumps to the ends', () => {
    const { probe, press } = mount();
    press('End');
    assert.equal(probe.cursor, 50);
    press('Home');
    assert.equal(probe.cursor, 10);
  });
});

describe('the row window is ONE tab stop', () => {
  it('offers the first row before any key is pressed', () => {
    const { probe } = mount();
    assert.deepEqual(probe.tabStops, [10]);
  });

  it('moves the single stop with the cursor — never 200 stops', () => {
    const { probe, press } = mount();
    press('j');
    press('j');
    assert.deepEqual(probe.tabStops, [20]);
  });
});

describe('selection keys', () => {
  it('x toggles the cursor row', () => {
    const { probe, press } = mount();
    press('j');
    press('x');
    assert.deepEqual(probe.selected, [10]);
    press('x');
    assert.deepEqual(probe.selected, []);
  });

  it('Space toggles too — same gesture, second key', () => {
    const { probe, press } = mount();
    press('j');
    press(' ');
    assert.deepEqual(probe.selected, [10]);
  });

  it('Shift+↓ extends from the cursor, selecting the PAIR on the first press', () => {
    // The bug this pins: with no anchor set, the first extend would otherwise
    // select only the row it lands on and the operator loses their start row.
    const { probe, press } = mount();
    press('j');
    press('ArrowDown', { shiftKey: true });
    assert.deepEqual(probe.selected, [10, 20]);
  });

  it('keeps growing the span on each further Shift+↓', () => {
    const { probe, press } = mount();
    press('j');
    press('ArrowDown', { shiftKey: true });
    press('ArrowDown', { shiftKey: true });
    assert.deepEqual(probe.selected, [10, 20, 30]);
  });

  it('extends upward too', () => {
    const { probe, press } = mount();
    press('End');
    press('ArrowUp', { shiftKey: true });
    assert.deepEqual(probe.selected, [40, 50]);
  });

  it('⌘A selects every row in the CURRENT view', () => {
    const { probe, press } = mount();
    press('a', { metaKey: true });
    assert.deepEqual(probe.selected, [10, 20, 30, 40, 50]);
  });
});

describe('open and dismiss', () => {
  it('Enter and o both open the cursor row', () => {
    const { probe, press } = mount();
    press('j');
    press('Enter');
    press('o');
    assert.deepEqual(probe.opened, [10, 10]);
  });

  it('Escape clears the selection when nothing is open', () => {
    const { probe, press } = mount();
    press('j');
    press('x');
    assert.deepEqual(probe.selected, [10]);
    press('Escape');
    assert.deepEqual(probe.selected, []);
  });

  it('Escape closes the FORM first and leaves the selection alone', () => {
    // Escape has exactly one meaning at a time — the innermost layer's.
    const { probe, press } = mount({ dismissHandled: true });
    press('j');
    press('x');
    press('Escape');
    assert.equal(probe.dismissals, 1);
    assert.deepEqual(probe.selected, [10], 'the selection survived the form close');
  });
});

describe('the suppressor is wired in', () => {
  it('ignores keys typed into a field inside the table', () => {
    const { probe, press, region } = mount();
    const input = dom.window.document.createElement('input');
    region.appendChild(input);
    press('j', {}, input);
    assert.equal(probe.cursor, null, 'typing must never move the record cursor');
  });
});
