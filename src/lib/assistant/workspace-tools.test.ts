/**
 *   npx tsx --test src/lib/assistant/workspace-tools.test.ts
 *
 * DB-free and DOM-free: every collaborator the dispatch touches is injected, so
 * these assert the one thing that matters — which store function each verb
 * calls, and with what. The stores themselves are tested next door
 * (`src/lib/workspace/store.test.ts`, `src/lib/canvas/store.test.ts`);
 * duplicating their invariants here would only pin them twice.
 *
 * The `scan-path boundary` describe block is the load-bearing one: it pins the
 * three properties that keep a 1–3s model round trip out of a 50ms scan.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ASSISTANT_HIGHLIGHT_EVENT } from '@/lib/app-events';
import type { ActiveSession } from '@/lib/session-context/store';
import type { TabDescriptor } from '@/lib/workspace/types';

import {
  UI_TOOL_NAMES,
  isUiToolName,
  layoutIdFor,
  runWorkspaceTool,
  type SavedWorkspaceLayout,
  type WorkspaceToolDeps,
  type WorkspaceToolLogRecord,
} from './workspace-tools';

const NOW = 1_700_000_000_000;

interface Capture {
  fn: string;
  args: readonly unknown[];
}

function tile(
  partial: Partial<TabDescriptor> & Pick<TabDescriptor, 'id' | 'kind' | 'ref'>,
): TabDescriptor {
  return { params: {}, ...partial };
}

/**
 * Tool keys the fake registry knows. `getTool` is the ARBITER in the verbs
 * under test — an unregistered key is refused rather than opened — so a fake
 * that answered every key would test the opposite of the rule.
 */
const KNOWN_TOOLS = ['photos', 'manuals', 'calculator'] as const;

/** Refs the fake tile registry knows how to mount, by `kind ref`. */
const KNOWN_TILES = ['table orders', 'table receiving', 'session *'] as const;

function fakes(
  options: {
    tabs?: TabDescriptor[];
    openTabResult?: string | null;
    openToolResult?: string | null;
    layouts?: SavedWorkspaceLayout[];
    withLayoutStore?: boolean;
    withSessionLifecycle?: boolean;
  } = {},
) {
  const calls: Capture[] = [];
  const logs: WorkspaceToolLogRecord[] = [];
  const tabs = options.tabs ?? [];
  const layouts = new Map((options.layouts ?? []).map((l) => [l.id, l]));

  const deps: WorkspaceToolDeps = {
    openTab: (input) => {
      calls.push({ fn: 'openTab', args: [input] });
      if (options.openTabResult !== undefined) return options.openTabResult;
      return input.id ?? `${input.kind}:${input.ref}#1`;
    },
    closeTab: (id) => {
      calls.push({ fn: 'closeTab', args: [id] });
    },
    focusTab: (id) => {
      calls.push({ fn: 'focusTab', args: [id] });
    },
    pinTab: (id) => {
      calls.push({ fn: 'pinTab', args: [id] });
    },
    unpinTab: (id) => {
      calls.push({ fn: 'unpinTab', args: [id] });
    },
    getTab: (id) => tabs.find((t) => t.id === id),
    getWorkspaceSnapshot: () => ({ openTabs: tabs, pinnedTabs: [], focusedTabId: null }),
    resolveTile: (tab) =>
      (KNOWN_TILES as readonly string[]).includes(`${tab.kind} ${tab.ref}`) ||
      (KNOWN_TILES as readonly string[]).includes(`${tab.kind} *`)
        ? ({ kind: tab.kind, ref: tab.ref, title: () => tab.ref, load: async () => ({ default: (() => null) as never }) } as never)
        : null,
    openTool: (input) => {
      calls.push({ fn: 'openTool', args: [input] });
      if (options.openToolResult !== undefined) return options.openToolResult;
      return `tool:${input.toolKey}`;
    },
    closeToolsOf: (toolKey) => {
      calls.push({ fn: 'closeToolsOf', args: [toolKey] });
    },
    pinTool: (toolKey) => {
      calls.push({ fn: 'pinTool', args: [toolKey] });
    },
    unpinTool: (toolKey) => {
      calls.push({ fn: 'unpinTool', args: [toolKey] });
    },
    getTool: (toolKey) =>
      (KNOWN_TOOLS as readonly string[]).includes(toolKey)
        ? ({ toolKey, title: toolKey, icon: (() => null) as never, group: 'session', load: async () => ({ default: (() => null) as never }) } as never)
        : undefined,
    activateTab: (id) => {
      calls.push({ fn: 'activateTab', args: [id] });
    },
    applyCanvasPreset: (presetId) => {
      calls.push({ fn: 'applyCanvasPreset', args: [presetId] });
    },
    splitFocusedPane: (orientation) => {
      calls.push({ fn: 'splitFocusedPane', args: [orientation] });
    },
    serializeCanvasLayout: () => {
      calls.push({ fn: 'serializeCanvasLayout', args: [] });
      return { root: { id: 'g1', tabIds: [], activeTabId: null } as never, maximizedGroupId: null };
    },
    hydrateCanvasLayout: (raw) => {
      calls.push({ fn: 'hydrateCanvasLayout', args: [raw] });
    },
    setActiveSession: (session) => {
      calls.push({ fn: 'setActiveSession', args: [session] });
    },
    clearActiveSession: (id) => {
      calls.push({ fn: 'clearActiveSession', args: [id] });
    },
    navigate: (href) => {
      calls.push({ fn: 'navigate', args: [href] });
    },
    setStudioParams: (patch) => {
      calls.push({ fn: 'setStudioParams', args: [patch] });
    },
    emitAppEvent: (name, detail) => {
      calls.push({ fn: 'emitAppEvent', args: [name, detail] });
    },
    newSessionId: () => 'sess-test-1',
    now: () => NOW,
    log: (record) => {
      logs.push(record);
    },
  };

  if (options.withLayoutStore ?? (options.layouts !== undefined)) {
    deps.layoutStore = {
      save: (layout) => {
        calls.push({ fn: 'saveLayout', args: [layout] });
        layouts.set(layout.id, layout);
      },
      get: (id) => layouts.get(id),
      list: () => [...layouts.values()],
    };
  }
  if (options.withSessionLifecycle) {
    deps.sessionLifecycle = {
      end: (sessionId) => {
        calls.push({ fn: 'endSessionRemote', args: [sessionId] });
      },
    };
  }

  return {
    deps,
    calls,
    logs,
    names: () => calls.map((c) => c.fn),
    first: (fn: string) => calls.find((c) => c.fn === fn),
  };
}

describe('view-state verbs (router / DOM / Studio)', () => {
  it('navigate builds the href from path + params', () => {
    const f = fakes();
    const outcome = runWorkspaceTool(
      'navigate',
      { path: '/unbox', params: { openReceivingId: 123 } },
      f.deps,
    );
    assert.equal(outcome.ok, true);
    assert.deepEqual(f.first('navigate')?.args, ['/unbox?openReceivingId=123']);
  });

  it('navigate omits the "?" when there are no params', () => {
    const f = fakes();
    runWorkspaceTool('navigate', { path: '/triage', params: {} }, f.deps);
    assert.deepEqual(f.first('navigate')?.args, ['/triage']);
  });

  it('navigate refuses a protocol-relative path (external host)', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('navigate', { path: '//evil.example.com' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'invalid_input');
    assert.deepEqual(f.names(), []);
  });

  it('highlight emits the app-wide highlight event', () => {
    const f = fakes();
    runWorkspaceTool('highlight', { ref: 'serial_units:entity:9041' }, f.deps);
    assert.deepEqual(f.first('emitAppEvent')?.args, [
      ASSISTANT_HIGHLIGHT_EVENT,
      { ref: 'serial_units:entity:9041' },
    ]);
  });

  it('focus_node drives the Studio params and zooms to the flow level', () => {
    const f = fakes();
    runWorkspaceTool('focus_node', { nodeId: 'node:receiving-1' }, f.deps);
    assert.deepEqual(f.first('setStudioParams')?.args, [{ focus: 'node:receiving-1', z: '1' }]);
  });

  it('set_lens rejects a lens that does not exist', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('set_lens', { lens: 'thermal' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.deepEqual(f.names(), []);
  });

  it('set_zoom accepts the string form a model hands back', () => {
    const f = fakes();
    runWorkspaceTool('set_zoom', { z: '2' }, f.deps);
    assert.deepEqual(f.first('setStudioParams')?.args, [{ z: '2' }]);
  });
});

describe('open_tile', () => {
  it('opens a TOOL through the tool store, stamped as agent-opened', () => {
    const f = fakes();
    const outcome = runWorkspaceTool(
      'open_tile',
      { kind: 'tool', ref: 'photos', params: { sku: 'ABC-1' } },
      f.deps,
    );
    // `openedBy: 'agent'` is load-bearing, not a log field — it is what stops an
    // AI-opened hardware tool counting as transient user activation.
    assert.deepEqual(f.first('openTool')?.args, [
      { toolKey: 'photos', params: { sku: 'ABC-1' }, openedBy: 'agent' },
    ]);
    assert.equal(outcome.ok && outcome.tileId, 'tool:photos');
    assert.equal(f.first('openTab'), undefined, 'a tool is not a tile-strip open');
  });

  it('opens a TABLE through the workspace store once the registry can mount it', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('open_tile', { kind: 'table', ref: 'orders' }, f.deps);
    assert.equal(outcome.ok, true);
    assert.deepEqual(f.first('openTab')?.args, [
      { id: undefined, kind: 'table', ref: 'orders', params: {} },
    ]);
  });

  it('refuses a tool key the registry does not know, instead of opening an empty tile', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('open_tile', { kind: 'tool', ref: 'scanner' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'unknown_tool');
    assert.deepEqual(f.names(), []);
  });

  it('refuses a table ref nothing knows how to mount', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('open_tile', { kind: 'table', ref: 'unicorns' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'unknown_tool');
    assert.deepEqual(f.names(), [], 'nothing is opened for a ref with no tile');
  });

  it('drops nested params and clamps long ones (the prefs bag must stay parseable)', () => {
    const f = fakes();
    runWorkspaceTool(
      'open_tile',
      {
        kind: 'tool',
        ref: 'manuals',
        params: { nested: { a: 1 }, note: 'x'.repeat(5000), page: 2 },
      },
      f.deps,
    );
    const params = (f.first('openTool')?.args[0] as { params: Record<string, unknown> }).params;
    assert.equal('nested' in params, false);
    assert.equal((params.note as string).length, 2000);
    assert.equal(params.page, 2);
  });

  it('reports the pinned-full workspace instead of pretending it opened', () => {
    const f = fakes({ openToolResult: null });
    const outcome = runWorkspaceTool('open_tile', { kind: 'tool', ref: 'calculator' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'workspace_full');
    assert.match(outcome.ok === false ? outcome.message : '', /pinned/);
  });

  it('refuses a tool key that is not a key', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('open_tile', { kind: 'tool', ref: '../../etc/passwd' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.deepEqual(f.names(), []);
  });

  it('names its own inverse, so an undo stack does not have to guess', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('open_tile', { kind: 'tool', ref: 'photos' }, f.deps);
    assert.deepEqual(outcome.ok && outcome.inverse, {
      verb: 'close_tile',
      input: { tileId: 'tool:photos' },
    });
  });
});

describe('the scan-path boundary (the one hard rule)', () => {
  it('runWorkspaceTool is SYNCHRONOUS — nothing can await the agent behind a scan', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('highlight', { ref: 'x' }, f.deps);
    assert.equal(typeof (outcome as { then?: unknown }).then, 'undefined');
  });

  it('open_tile on a session NEVER arms the scanner', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('open_tile', { kind: 'session', ref: 'sess-77' }, f.deps);
    assert.equal(outcome.ok, true);
    assert.equal(
      f.first('setActiveSession'),
      undefined,
      'a tile the model opened must not take the wedge from the bench an operator is standing at',
    );
    assert.deepEqual(f.first('openTab')?.args, [
      { id: 'session:sess-77', kind: 'session', ref: 'sess-77', params: {} },
    ]);
    assert.match(outcome.ok ? outcome.effect : '', /scanner is untouched/);
  });

  it('no verb but start_session and focus_tile ever publishes an active session', () => {
    const arming = new Set(['start_session', 'focus_tile']);
    for (const verb of UI_TOOL_NAMES) {
      if (arming.has(verb)) continue;
      const f = fakes({
        withLayoutStore: true,
        withSessionLifecycle: true,
        tabs: [
          tile({ id: 'tool:photos', kind: 'tool', ref: 'photos' }),
          tile({
            id: 'session:sess-9',
            kind: 'session',
            ref: 'sess-9',
            params: { title: 'Unbox', scanType: 'unbox' },
          }),
        ],
      });
      // Every plausible argument shape at once; unknown keys are ignored.
      runWorkspaceTool(
        verb,
        {
          kind: 'tool',
          ref: 'photos',
          tileId: 'sess-9',
          toolKey: 'photos',
          sessionId: 'sess-9',
          path: '/x',
          nodeId: 'n1',
          lens: 'build',
          z: 1,
          direction: 'right',
          layout: 'columns',
          name: 'Preset',
        },
        f.deps,
      );
      assert.equal(
        f.first('setActiveSession'),
        undefined,
        `${verb} must not touch scan ownership`,
      );
    }
  });
});

describe('close_tile / focus_tile', () => {
  const tabs = [
    tile({ id: 'tool:photos', kind: 'tool', ref: 'photos' }),
    tile({
      id: 'session:sess-9',
      kind: 'session',
      ref: 'sess-9',
      params: { title: 'Unbox', scanType: 'unbox', startedAt: 1_600_000_000_000 },
    }),
  ];

  it('closing a session tile releases the live session first', () => {
    const f = fakes({ tabs });
    runWorkspaceTool('close_tile', { tileId: 'sess-9' }, f.deps);
    assert.deepEqual(f.names(), ['clearActiveSession', 'closeTab']);
    assert.deepEqual(f.first('clearActiveSession')?.args, ['sess-9']);
    assert.deepEqual(f.first('closeTab')?.args, ['session:sess-9']);
  });

  it('closing a session tile does NOT end the session record', () => {
    const f = fakes({ tabs, withSessionLifecycle: true });
    runWorkspaceTool('close_tile', { tileId: 'sess-9' }, f.deps);
    assert.equal(
      f.first('endSessionRemote'),
      undefined,
      'putting a window away is not finishing the work',
    );
  });

  it('closing a tool closes its instances in the tool store, not a tile', () => {
    const f = fakes({ tabs });
    runWorkspaceTool('close_tile', { tileId: 'tool:photos' }, f.deps);
    assert.deepEqual(f.names(), ['closeToolsOf']);
    assert.deepEqual(f.first('closeToolsOf')?.args, ['photos']);
  });

  it('focus_tile accepts the bench as shorthand and re-publishes from the tile', () => {
    const f = fakes({ tabs });
    runWorkspaceTool('focus_tile', { tileId: 'unbox' }, f.deps);
    assert.deepEqual(f.first('activateTab')?.args, ['session:sess-9']);
    assert.deepEqual(f.first('setActiveSession')?.args[0], {
      id: 'sess-9',
      kind: 'scan',
      scanType: 'unbox',
      title: 'Unbox',
      // Preserved from the tile, not restamped — a resumed session keeps its age.
      startedAt: 1_600_000_000_000,
    });
  });

  it('focus_tile on a NON-session tile touches nothing but focus', () => {
    const f = fakes({ tabs });
    runWorkspaceTool('focus_tile', { tileId: 'tool:photos' }, f.deps);
    assert.deepEqual(f.names(), ['activateTab']);
  });

  it('focus_tile rebuilds a task session when the tile names no bench', () => {
    const f = fakes({
      tabs: [
        tile({ id: 'session:sess-2', kind: 'session', ref: 'sess-2', params: { title: 'Reconcile' } }),
      ],
    });
    runWorkspaceTool('focus_tile', { tileId: 'sess-2' }, f.deps);
    assert.deepEqual(f.first('setActiveSession')?.args[0], {
      id: 'sess-2',
      kind: 'task',
      title: 'Reconcile',
      startedAt: NOW,
    });
  });

  it('tells the operator when the named tile is not open', () => {
    const f = fakes({ tabs });
    const outcome = runWorkspaceTool('focus_tile', { tileId: 'pack' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'unknown_tile');
    assert.deepEqual(f.names(), []);
  });
});

describe('pin_tool / unpin_tool', () => {
  const tabs = [
    tile({ id: 'tool:photos', kind: 'tool', ref: 'photos' }),
    tile({ id: 'session:sess-9', kind: 'session', ref: 'sess-9', params: { title: 'Unbox' } }),
  ];

  it('pins a bare tool key in the PALETTE, where tool pins actually live', () => {
    const f = fakes({ tabs });
    runWorkspaceTool('pin_tool', { toolKey: 'photos' }, f.deps);
    assert.deepEqual(f.first('pinTool')?.args, ['photos']);
    assert.equal(f.first('pinTab'), undefined, 'a tool pin is not a tile pin');
  });

  it('accepts the `tool:` prefixed form open_tile handed back', () => {
    const f = fakes({ tabs });
    runWorkspaceTool('pin_tool', { toolKey: 'tool:photos' }, f.deps);
    assert.deepEqual(f.first('pinTool')?.args, ['photos']);
  });

  it('unpin_tool is its own verb — no flag the model can forget to set', () => {
    const f = fakes({ tabs });
    runWorkspaceTool('unpin_tool', { toolKey: 'tool:photos' }, f.deps);
    assert.deepEqual(f.first('unpinTool')?.args, ['photos']);
    assert.equal(f.first('pinTool'), undefined);
  });

  it('pins a non-tool tile in the tile strip', () => {
    const f = fakes({ tabs });
    runWorkspaceTool('pin_tool', { toolKey: 'sess-9' }, f.deps);
    assert.deepEqual(f.first('pinTab')?.args, ['session:sess-9']);
  });

  it('reports an id that is not open instead of no-oping', () => {
    const f = fakes({ tabs });
    const outcome = runWorkspaceTool('pin_tool', { toolKey: 'ghost' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'unknown_tile');
    assert.deepEqual(f.names(), []);
  });
});

describe('start_session / end_session', () => {
  it('opens a session tile and publishes the scan session (publishing IS arming)', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('start_session', { scanType: 'unbox' }, f.deps);
    assert.deepEqual(f.first('openTab')?.args, [
      {
        id: 'session:sess-test-1',
        kind: 'session',
        ref: 'sess-test-1',
        params: { title: 'Unbox', scanType: 'unbox', startedAt: NOW },
      },
    ]);
    const published = f.first('setActiveSession')?.args[0] as ActiveSession;
    assert.deepEqual(published, {
      id: 'sess-test-1',
      kind: 'scan',
      scanType: 'unbox',
      title: 'Unbox',
      startedAt: NOW,
    });
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.ok && outcome.inverse, {
      verb: 'end_session',
      input: { sessionId: 'sess-test-1' },
    });
  });

  it('has no arming parameter — an "armed" the model invents changes nothing', () => {
    const f = fakes();
    runWorkspaceTool('start_session', { scanType: 'pack', armed: false }, f.deps);
    const published = f.first('setActiveSession')?.args[0] as ActiveSession;
    assert.equal(published.kind, 'scan');
    assert.equal('armed' in published, false);
    const opened = f.first('openTab')?.args[0] as { params: Record<string, unknown> };
    assert.equal('armed' in opened.params, false);
  });

  it('omitting scanType starts a TASK session (no bench, no scanner)', () => {
    const f = fakes();
    runWorkspaceTool('start_session', { title: 'Reconcile FBA' }, f.deps);
    const published = f.first('setActiveSession')?.args[0] as ActiveSession;
    assert.deepEqual(published, {
      id: 'sess-test-1',
      kind: 'task',
      title: 'Reconcile FBA',
      startedAt: NOW,
    });
  });

  it('refuses a bench outside the closed scan vocabulary', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('start_session', { scanType: 'shipping' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'invalid_input');
    assert.deepEqual(f.names(), []);
  });

  it('reports a pinned-full workspace rather than publishing a session with no tile', () => {
    const f = fakes({ openTabResult: null });
    const outcome = runWorkspaceTool('start_session', { scanType: 'triage' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'workspace_full');
    assert.equal(f.first('setActiveSession'), undefined);
  });

  it('end_session disarms, records the durable end, then closes the tile', () => {
    const f = fakes({
      withSessionLifecycle: true,
      tabs: [
        tile({
          id: 'session:sess-9',
          kind: 'session',
          ref: 'sess-9',
          params: { title: 'Unbox', scanType: 'unbox' },
        }),
      ],
    });
    const outcome = runWorkspaceTool('end_session', { sessionId: 'unbox' }, f.deps);
    assert.equal(outcome.ok, true);
    // Disarm BEFORE the tile unmounts, so nothing routes a scan into a dying subtree.
    assert.deepEqual(f.names(), ['clearActiveSession', 'endSessionRemote', 'closeTab']);
    assert.deepEqual(f.first('endSessionRemote')?.args, ['sess-9']);
  });

  it('end_session REFUSES rather than half-ending when nothing can record it', () => {
    const f = fakes({
      tabs: [tile({ id: 'session:sess-9', kind: 'session', ref: 'sess-9', params: { title: 'Unbox' } })],
    });
    const outcome = runWorkspaceTool('end_session', { sessionId: 'sess-9' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'unsupported');
    assert.deepEqual(f.names(), [], 'a row left open+armed is worse than a refusal');
  });

  it('end_session will not end something that is not a session', () => {
    const f = fakes({
      withSessionLifecycle: true,
      tabs: [tile({ id: 'tool:photos', kind: 'tool', ref: 'photos' })],
    });
    const outcome = runWorkspaceTool('end_session', { sessionId: 'photos' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'unknown_tile');
  });
});

describe('canvas arrangement', () => {
  it('set_layout translates the operator word into a canvas preset', () => {
    const f = fakes();
    runWorkspaceTool('set_layout', { layout: 'columns' }, f.deps);
    assert.deepEqual(f.first('applyCanvasPreset')?.args, ['compare']);
  });

  it('set_layout refuses an invented preset', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('set_layout', { layout: 'bento-9' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.deepEqual(f.names(), []);
  });

  it('split_tile focuses the named tile first, then splits its pane', () => {
    const f = fakes({ tabs: [tile({ id: 'tool:photos', kind: 'tool', ref: 'photos' })] });
    runWorkspaceTool('split_tile', { direction: 'right', tileId: 'photos' }, f.deps);
    assert.deepEqual(f.names(), ['activateTab', 'splitFocusedPane']);
    assert.deepEqual(f.first('activateTab')?.args, ['tool:photos']);
    assert.deepEqual(f.first('splitFocusedPane')?.args, ['row']);
  });

  it('split_tile speaks both vocabularies — "down" and "column" are one orientation', () => {
    for (const direction of ['down', 'column'] as const) {
      const f = fakes();
      runWorkspaceTool('split_tile', { direction }, f.deps);
      assert.deepEqual(f.first('splitFocusedPane')?.args, ['column'], direction);
    }
  });

  it('split_tile refuses to guess when the named tile is gone', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('split_tile', { direction: 'right', tileId: 'gone' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'unknown_tile');
    assert.deepEqual(f.names(), []);
  });
});

describe('saved layouts', () => {
  it('save_layout files the current arrangement under a session type', () => {
    const f = fakes({ layouts: [] });
    const outcome = runWorkspaceTool(
      'save_layout',
      { name: 'Morning bench', sessionType: 'unbox' },
      f.deps,
    );
    assert.equal(outcome.ok, true);
    const saved = f.first('saveLayout')?.args[0] as SavedWorkspaceLayout;
    assert.equal(saved.id, 'unbox:morning-bench');
    assert.equal(saved.name, 'Morning bench');
    assert.equal(saved.sessionType, 'unbox');
    assert.equal(saved.savedAt, NOW);
    // The inverse of saving is restoring it — the id is how the model gets back.
    assert.deepEqual(outcome.ok && outcome.inverse, {
      verb: 'set_layout',
      input: { layoutId: 'unbox:morning-bench' },
    });
  });

  it('re-saving a name REPLACES rather than accumulating a twin', () => {
    assert.equal(layoutIdFor('Morning bench', 'unbox'), layoutIdFor('morning  BENCH!', 'unbox'));
    assert.notEqual(layoutIdFor('Morning bench', 'unbox'), layoutIdFor('Morning bench', 'pack'));
  });

  it('save_layout refuses a session type outside the vocabulary', () => {
    const f = fakes({ layouts: [] });
    const outcome = runWorkspaceTool('save_layout', { name: 'X', sessionType: 'shipping' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'invalid_input');
    assert.equal(f.first('saveLayout'), undefined);
  });

  it('save_layout says so plainly when there is nowhere to keep one', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('save_layout', { name: 'Morning bench' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'unsupported');
    assert.equal(f.first('serializeCanvasLayout'), undefined, 'nothing is read if nothing can be saved');
  });

  it('set_layout restores a saved arrangement by id', () => {
    const f = fakes({
      layouts: [
        {
          id: 'unbox:morning-bench',
          name: 'Morning bench',
          sessionType: 'unbox',
          root: { id: 'g1' },
          maximizedGroupId: null,
          savedAt: 1,
        },
      ],
    });
    const outcome = runWorkspaceTool('set_layout', { layoutId: 'unbox:morning-bench' }, f.deps);
    assert.equal(outcome.ok, true);
    assert.deepEqual(f.first('hydrateCanvasLayout')?.args, [
      { root: { id: 'g1' }, maximizedGroupId: null },
    ]);
    assert.equal(f.first('applyCanvasPreset'), undefined, 'a saved layout is not a preset shape');
  });

  it('set_layout lists what DOES exist when the id is wrong', () => {
    const f = fakes({
      layouts: [
        {
          id: 'pack:evening',
          name: 'Evening',
          sessionType: 'pack',
          root: {},
          maximizedGroupId: null,
          savedAt: 1,
        },
      ],
    });
    const outcome = runWorkspaceTool('set_layout', { layoutId: 'nope' }, f.deps);
    assert.equal(outcome.ok, false);
    assert.match(outcome.ok === false ? outcome.message : '', /pack:evening/);
  });
});

describe('the dispatch itself', () => {
  it('names the verbs it owns', () => {
    assert.equal(isUiToolName('start_session'), true);
    assert.equal(isUiToolName('open_tile'), true);
    assert.equal(isUiToolName('toString'), false);
    assert.equal(isUiToolName('rm_rf'), false);
  });

  it('has one verb per job — no tool-specific twin of a tile verb', () => {
    for (const retired of ['open_tool', 'close_tool', 'focus_session', 'split_pane']) {
      assert.equal(isUiToolName(retired), false, `${retired} must not survive beside its tile verb`);
    }
  });

  it('returns an outcome for a verb the model invented — never throws', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('delete_everything', { yes: true }, f.deps);
    assert.equal(outcome.ok, false);
    assert.equal(outcome.ok === false && outcome.code, 'unknown_verb');
    assert.deepEqual(f.names(), []);
  });

  it('converts a thrown collaborator into an outcome, so the dock survives', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('highlight', { ref: 'x' }, {
      ...f.deps,
      emitAppEvent: () => {
        throw new Error('no window');
      },
    });
    assert.equal(outcome.ok, false);
    assert.match(outcome.ok === false ? outcome.message : '', /no window/);
  });

  it('logs every action ONCE — including the refusals, which are the interesting half', () => {
    const f = fakes();
    runWorkspaceTool('highlight', { ref: 'x' }, f.deps);
    runWorkspaceTool('set_lens', { lens: 'thermal' }, f.deps);
    runWorkspaceTool('nonsense', {}, f.deps);
    assert.equal(f.logs.length, 3);
    assert.deepEqual(
      f.logs.map((l) => [l.verb, l.outcome.ok]),
      [
        ['highlight', true],
        ['set_lens', false],
        ['nonsense', false],
      ],
    );
    assert.equal(f.logs[0].at, NOW);
  });

  it('a broken log sink does not turn a working verb into a failure', () => {
    const f = fakes();
    const outcome = runWorkspaceTool('highlight', { ref: 'x' }, {
      ...f.deps,
      log: () => {
        throw new Error('sink down');
      },
    });
    assert.equal(outcome.ok, true);
  });
});
