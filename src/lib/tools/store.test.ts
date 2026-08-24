/**
 *   npx tsx --test src/lib/tools/store.test.ts
 *
 * DB-free and React-free: the registry and the palette store are module
 * singletons over plain data, and the store's descriptor lookup is injected, so
 * nothing here needs a browser or a bundler to resolve a lazy `import()`.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  getTool,
  listTools,
  listToolsByGroup,
  registerTool,
  resetToolRegistry,
} from './registry';
import {
  closeTool,
  closeToolsOf,
  focusTool,
  getToolInstance,
  getToolInstancesOf,
  getToolPaletteSnapshot,
  hydrateToolPalette,
  isToolPinned,
  openTool,
  pinTool,
  resetToolPalette,
  restoreToolStoreDeps,
  setToolParams,
  setToolStoreDeps,
  subscribeToolPalette,
  unpinTool,
} from './store';
import { MAX_OPEN_TOOLS, toolMayAutoInvokeDevicePicker, type ToolDescriptor } from './types';

/** A descriptor with a `load` that is never called — no React in this file. */
function fakeTool(overrides: Partial<ToolDescriptor> & { toolKey: string }): ToolDescriptor {
  return {
    title: overrides.toolKey,
    icon: () => null,
    group: 'utility',
    load: () => {
      throw new Error('load() must not run in a store test');
    },
    ...overrides,
  };
}

let clock = 0;

beforeEach(() => {
  resetToolRegistry();
  resetToolPalette();
  clock = 0;
  setToolStoreDeps({ now: () => (clock += 1) });
});

describe('registry', () => {
  it('registers descriptors at module scope — no mount required', () => {
    registerTool(fakeTool({ toolKey: 'manuals', title: 'Manuals', group: 'reference' }));
    registerTool(fakeTool({ toolKey: 'calculator', title: 'Calculator' }));

    assert.equal(getTool('manuals')?.title, 'Manuals');
    assert.deepEqual(listTools().map((t) => t.toolKey), ['calculator', 'manuals']);
  });

  it('buckets by group in paint order, dropping empty groups', () => {
    registerTool(fakeTool({ toolKey: 'calculator', title: 'Calculator', group: 'utility' }));
    registerTool(fakeTool({ toolKey: 'manuals', title: 'Manuals', group: 'reference' }));

    assert.deepEqual(
      listToolsByGroup().map((b) => [b.group, b.tools.map((t) => t.toolKey)]),
      [
        ['reference', ['manuals']],
        ['utility', ['calculator']],
      ],
    );
  });

  it('hands out the SAME array identity between mutations', () => {
    registerTool(fakeTool({ toolKey: 'a' }));
    const first = listTools();
    assert.equal(listTools(), first, 'a fresh array per call is an infinite render loop');
    registerTool(fakeTool({ toolKey: 'b' }));
    assert.notEqual(listTools(), first, 'and a mutation must change identity');
  });

  it('re-registration replaces, and a stale unregister cannot clobber it', () => {
    const disposeFirst = registerTool(fakeTool({ toolKey: 'manuals', title: 'Old' }));
    registerTool(fakeTool({ toolKey: 'manuals', title: 'New' }));
    disposeFirst();
    assert.equal(getTool('manuals')?.title, 'New');
  });
});

describe('open / close / focus', () => {
  beforeEach(() => {
    registerTool(fakeTool({ toolKey: 'manuals', title: 'Manuals' }));
    registerTool(fakeTool({ toolKey: 'calculator', title: 'Calculator' }));
  });

  it('opens a tool, focuses it, and hands back a unique instance id', () => {
    const a = openTool({ toolKey: 'manuals' });
    const b = openTool({ toolKey: 'manuals' });
    assert.notEqual(a, b, 'two Manuals tiles are two instances');

    const { openTools, focusedInstanceId } = getToolPaletteSnapshot();
    assert.deepEqual(openTools.map((t) => t.instanceId), [a, b]);
    assert.equal(focusedInstanceId, b, 'the newest instance takes focus');
  });

  it('REFUSES a key nothing registered — a typo must not paint an empty tile', () => {
    assert.equal(openTool({ toolKey: 'nope' }), null);
    assert.equal(getToolPaletteSnapshot().openTools.length, 0);
  });

  it('a singleton descriptor focuses the live instance instead of duplicating it', () => {
    registerTool(fakeTool({ toolKey: 'label-printer', title: 'Label Printer', singleton: true }));
    const first = openTool({ toolKey: 'label-printer', params: { role: 'label' } });
    openTool({ toolKey: 'calculator' });
    const again = openTool({ toolKey: 'label-printer', params: { role: 'receipt' } });

    assert.equal(again, first, 'one paired printer, one tile');
    assert.equal(getToolInstancesOf('label-printer').length, 1);
    assert.equal(getToolPaletteSnapshot().focusedInstanceId, first);
    // Params from the re-open are merged onto the live instance — "open the
    // printer, on this role" re-targets rather than pairing a second device.
    assert.equal(getToolInstance(first!)?.params.role, 'receipt');
  });

  it('closing hands focus to the newest survivor, never to nothing', () => {
    const a = openTool({ toolKey: 'manuals' })!;
    const b = openTool({ toolKey: 'calculator' })!;
    closeTool(b);
    assert.equal(getToolPaletteSnapshot().focusedInstanceId, a);
    closeTool(a);
    assert.equal(getToolPaletteSnapshot().focusedInstanceId, null);
  });

  it('the palette icon toggles every instance of one tool off', () => {
    openTool({ toolKey: 'manuals' });
    openTool({ toolKey: 'manuals' });
    const calc = openTool({ toolKey: 'calculator' })!;
    closeToolsOf('manuals');

    assert.deepEqual(getToolPaletteSnapshot().openTools.map((t) => t.toolKey), ['calculator']);
    assert.equal(getToolPaletteSnapshot().focusedInstanceId, calc);
  });

  it('refuses to focus an instance that is not open', () => {
    const a = openTool({ toolKey: 'manuals' })!;
    focusTool('tool:ghost:9');
    assert.equal(getToolPaletteSnapshot().focusedInstanceId, a);
  });

  it('evicts the oldest UNFOCUSED instance past the cap', () => {
    const ids: string[] = [];
    for (let i = 0; i < MAX_OPEN_TOOLS; i += 1) ids.push(openTool({ toolKey: 'manuals' })!);
    assert.equal(getToolPaletteSnapshot().openTools.length, MAX_OPEN_TOOLS);

    const extra = openTool({ toolKey: 'calculator' })!;
    const open = getToolPaletteSnapshot().openTools;
    assert.equal(open.length, MAX_OPEN_TOOLS);
    assert.equal(open.some((t) => t.instanceId === ids[0]), false, 'oldest went first');
    assert.equal(open[open.length - 1].instanceId, extra);
  });
});

describe('params', () => {
  beforeEach(() => {
    registerTool(fakeTool({ toolKey: 'calculator', title: 'Calculator' }));
  });

  it('two instances of one tool hold DIFFERENT params', () => {
    const a = openTool({ toolKey: 'calculator' })!;
    const b = openTool({ toolKey: 'calculator' })!;
    setToolParams(a, { expression: '12 * 3' });
    setToolParams(b, { expression: '99 / 3' });

    assert.equal(getToolInstance(a)?.params.expression, '12 * 3');
    assert.equal(getToolInstance(b)?.params.expression, '99 / 3');
  });

  it('`undefined` removes a key, and an unchanged patch does not emit', () => {
    const a = openTool({ toolKey: 'calculator' })!;
    setToolParams(a, { tape: '1 + 1 = 2' });

    let emits = 0;
    const unsubscribe = subscribeToolPalette(() => {
      emits += 1;
    });
    setToolParams(a, { tape: '1 + 1 = 2' });
    assert.equal(emits, 0, 'a no-op patch must not re-render every subscriber');

    setToolParams(a, { tape: undefined });
    assert.equal(emits, 1);
    assert.equal('tape' in (getToolInstance(a)?.params ?? {}), false);
    unsubscribe();
  });
});

describe('pins and hydration', () => {
  it('pins a tool KEY, not an instance', () => {
    registerTool(fakeTool({ toolKey: 'manuals' }));
    pinTool('manuals');
    pinTool('manuals');
    assert.deepEqual(getToolPaletteSnapshot().pinnedToolKeys, ['manuals']);
    assert.equal(isToolPinned('manuals'), true);

    unpinTool('manuals');
    assert.equal(isToolPinned('manuals'), false);
  });

  it('hydration drops a focus id no restored instance owns', () => {
    hydrateToolPalette({
      openTools: [
        { instanceId: 'tool:manuals:1', toolKey: 'manuals', params: {}, openedAt: 1, openedBy: 'click' },
      ],
      pinnedToolKeys: ['manuals'],
      focusedInstanceId: 'tool:gone:9',
    });
    const snapshot = getToolPaletteSnapshot();
    assert.equal(snapshot.openTools.length, 1);
    assert.equal(snapshot.focusedInstanceId, null);
    // A restored instance was not opened by a gesture — the WebUSB answer.
    assert.equal(snapshot.openTools[0].openedBy, 'restore');
  });

  it('the snapshot is cached — a fresh object per call is an infinite loop', () => {
    registerTool(fakeTool({ toolKey: 'manuals' }));
    const first = getToolPaletteSnapshot();
    assert.equal(getToolPaletteSnapshot(), first);
    openTool({ toolKey: 'manuals' });
    assert.notEqual(getToolPaletteSnapshot(), first);
  });
});

describe('user activation', () => {
  it('a device-pairing tool may NEVER auto-invoke the chooser', () => {
    const printer = fakeTool({ toolKey: 'label-printer', requiresUserActivation: true });
    const calculator = fakeTool({ toolKey: 'calculator' });
    // Not "unless a click opened it": a dynamic `import()` already spent the
    // transient activation before the tool body existed.
    assert.equal(toolMayAutoInvokeDevicePicker(printer), false);
    assert.equal(toolMayAutoInvokeDevicePicker(calculator), true);
  });

  it('records HOW an instance was opened', () => {
    registerTool(fakeTool({ toolKey: 'manuals' }));
    const byChord = openTool({ toolKey: 'manuals', openedBy: 'keybinding' })!;
    const byClick = openTool({ toolKey: 'manuals' })!;
    assert.equal(getToolInstance(byChord)?.openedBy, 'keybinding');
    assert.equal(getToolInstance(byClick)?.openedBy, 'click', 'click is the default');
  });
});

describe('teardown', () => {
  it('restores the injected deps so a later suite sees the real clock', () => {
    restoreToolStoreDeps();
    registerTool(fakeTool({ toolKey: 'manuals' }));
    const id = openTool({ toolKey: 'manuals' })!;
    assert.ok((getToolInstance(id)?.openedAt ?? 0) > 1_600_000_000_000);
  });
});
