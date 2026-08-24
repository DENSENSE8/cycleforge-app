/**
 *   npx tsx --test src/lib/workspace/store.test.ts
 *
 * DB-free: the workspace store is a module singleton over plain data, so every
 * invariant here is exercised without React, a browser, or a connection.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import {
  closeTab,
  focusTab,
  getWorkspaceSnapshot,
  hydrateWorkspace,
  isTabLive,
  openTab,
  pinTab,
  readTabState,
  replaceTabParams,
  resetWorkspace,
  saveTabState,
  setTabParams,
  subscribeWorkspace,
  unpinTab,
} from './store';
import {
  hydrateWorkspaceFromPrefs,
  parseWorkspacePrefs,
  serializeWorkspace,
  workspaceStorageKey,
} from './persistence';
import { MAX_OPEN_TABS } from './types';

/** `openTab` returns `string | null`; every call here is expected to succeed. */
function open(input: Parameters<typeof openTab>[0]): string {
  const id = openTab(input);
  if (id === null) throw new Error('expected the tab to open, but the workspace refused');
  return id;
}

beforeEach(() => {
  resetWorkspace();
});

describe('open / close / focus', () => {
  it('opens a tab, focuses it, and hands back a unique instance id', () => {
    const a = open({ kind: 'table', ref: 'orders' });
    const b = open({ kind: 'table', ref: 'orders' });

    assert.notEqual(a, b, 'two tabs of one table are two instances');
    const { openTabs, focusedTabId } = getWorkspaceSnapshot();
    assert.deepEqual(openTabs.map((t) => t.id), [a, b]);
    assert.equal(focusedTabId, b, 'the newest tab takes focus');
  });

  it('treats an explicit id as a singleton — re-opening focuses instead of duplicating', () => {
    const settings = open({ kind: 'tool', ref: 'settings', id: 'tool:settings' });
    open({ kind: 'table', ref: 'orders' });
    const again = open({ kind: 'tool', ref: 'settings', id: 'tool:settings' });

    assert.equal(again, settings);
    assert.equal(getWorkspaceSnapshot().openTabs.length, 2);
    assert.equal(getWorkspaceSnapshot().focusedTabId, settings);
  });

  it('closing the focused tab falls to the right, then the left, then nothing', () => {
    const a = open({ kind: 'table', ref: 'orders' });
    const b = open({ kind: 'table', ref: 'skus' });
    const c = open({ kind: 'session', ref: 'unbox-1' });

    focusTab(b);
    closeTab(b);
    assert.equal(getWorkspaceSnapshot().focusedTabId, c, 'falls right');

    closeTab(c);
    assert.equal(getWorkspaceSnapshot().focusedTabId, a, 'falls left when there is no right');

    closeTab(a);
    assert.equal(getWorkspaceSnapshot().focusedTabId, null);
    assert.deepEqual(getWorkspaceSnapshot().openTabs, []);
  });

  it('closing a non-focused tab leaves focus alone', () => {
    const a = open({ kind: 'table', ref: 'orders' });
    const b = open({ kind: 'table', ref: 'skus' });

    closeTab(a);
    assert.equal(getWorkspaceSnapshot().focusedTabId, b);
  });

  it('ignores focus / close / params for ids that are not open', () => {
    const a = open({ kind: 'table', ref: 'orders' });
    focusTab('nope');
    closeTab('nope');
    setTabParams('nope', { sort: 'x' });
    assert.equal(getWorkspaceSnapshot().focusedTabId, a);
    assert.equal(getWorkspaceSnapshot().openTabs.length, 1);
  });

  it('emits one snapshot change per mutation, and a fresh identity each time', () => {
    let emissions = 0;
    const unsubscribe = subscribeWorkspace(() => {
      emissions += 1;
    });

    const first = getWorkspaceSnapshot();
    const a = open({ kind: 'table', ref: 'orders' });
    assert.equal(emissions, 1);
    assert.notEqual(getWorkspaceSnapshot(), first, 'snapshot identity changes so React re-renders');

    focusTab(a); // already focused — no-op, no emission
    assert.equal(emissions, 1);

    unsubscribe();
    closeTab(a);
    assert.equal(emissions, 1, 'unsubscribed listeners stop hearing');
  });

  it('pins and unpins, and closing a pinned tab unpins it', () => {
    const a = open({ kind: 'table', ref: 'orders' });
    pinTab(a);
    pinTab(a);
    assert.deepEqual(getWorkspaceSnapshot().pinnedTabs, [a]);

    unpinTab(a);
    assert.deepEqual(getWorkspaceSnapshot().pinnedTabs, []);

    pinTab(a);
    closeTab(a);
    assert.deepEqual(getWorkspaceSnapshot().pinnedTabs, []);
  });

  it('evicts the leftmost unpinned, unfocused tab at the cap — and never a pin', () => {
    const first = open({ kind: 'table', ref: 'orders' });
    const second = open({ kind: 'table', ref: 'orders' });
    pinTab(first);
    for (let i = 2; i < MAX_OPEN_TABS; i += 1) open({ kind: 'table', ref: `t${i}` });

    assert.equal(getWorkspaceSnapshot().openTabs.length, MAX_OPEN_TABS);

    const extra = open({ kind: 'table', ref: 'one-more' });
    const ids = getWorkspaceSnapshot().openTabs.map((t) => t.id);
    assert.equal(ids.length, MAX_OPEN_TABS);
    assert.ok(ids.includes(first), 'the pinned tab survives');
    assert.ok(!ids.includes(second), 'the leftmost unpinned tab was evicted');
    assert.equal(getWorkspaceSnapshot().focusedTabId, extra);
  });
});

describe('per-tab params isolation', () => {
  it('two tabs of one table hold different sort / filter state', () => {
    const left = open({ kind: 'table', ref: 'orders', params: { sort: 'age' } });
    const right = open({ kind: 'table', ref: 'orders' });

    setTabParams(right, { sort: 'value', status: 'open' });

    const tabs = getWorkspaceSnapshot().openTabs;
    assert.deepEqual(tabs.find((t) => t.id === left)?.params, { sort: 'age' });
    assert.deepEqual(tabs.find((t) => t.id === right)?.params, { sort: 'value', status: 'open' });
  });

  it('merges shallowly, removes a key on undefined, and no-ops when nothing changed', () => {
    const id = open({ kind: 'table', ref: 'orders', params: { sort: 'age', page: 2 } });
    const before = getWorkspaceSnapshot();

    setTabParams(id, { sort: 'age' });
    assert.equal(getWorkspaceSnapshot(), before, 'an identical write does not emit');

    setTabParams(id, { page: undefined, status: 'open' });
    assert.deepEqual(getWorkspaceSnapshot().openTabs[0]?.params, { sort: 'age', status: 'open' });

    replaceTabParams(id, { q: 'abc' });
    assert.deepEqual(getWorkspaceSnapshot().openTabs[0]?.params, { q: 'abc' });
  });

  it('does not let a params write leak into the caller’s object', () => {
    const seed = { sort: 'age' };
    const id = open({ kind: 'table', ref: 'orders', params: seed });
    setTabParams(id, { sort: 'value' });
    assert.deepEqual(seed, { sort: 'age' });
  });
});

describe('suspension', () => {
  it('keeps exactly one tab live and restores the suspended one on focus', () => {
    const a = open({ kind: 'session', ref: 'unbox-1' });
    const b = open({ kind: 'table', ref: 'orders' });

    // `b` is focused, so `a` suspended — its subtree hands over its state.
    saveTabState(a, { scrollTop: 420, draft: 'partial note' });
    assert.equal(isTabLive(a), false);
    assert.equal(isTabLive(b), true);

    focusTab(a);
    assert.equal(isTabLive(a), true);
    assert.equal(isTabLive(b), false, 'focusing one tab suspends every other');
    assert.deepEqual(readTabState(a), { scrollTop: 420, draft: 'partial note' });
  });

  it('drops preserved state when its tab closes, and refuses state for unknown tabs', () => {
    const a = open({ kind: 'session', ref: 'unbox-1' });
    saveTabState(a, { scrollTop: 10 });
    closeTab(a);
    assert.equal(readTabState(a), undefined);

    saveTabState('nope', { scrollTop: 1 });
    assert.equal(readTabState('nope'), undefined);
  });

  it('survives a params write — suspended state and params are independent', () => {
    const a = open({ kind: 'table', ref: 'orders' });
    const b = open({ kind: 'table', ref: 'orders' });
    saveTabState(a, { selection: ['1', '2'] });
    setTabParams(a, { sort: 'value' });

    assert.deepEqual(readTabState(a), { selection: ['1', '2'] });
    assert.equal(isTabLive(b), true);
  });
});

describe('persistence', () => {
  it('round-trips the whole workspace through the Zod schema', () => {
    const a = open({ kind: 'table', ref: 'orders', params: { sort: 'age' } });
    const b = open({ kind: 'session', ref: 'unbox-1', params: { step: 2, done: false, note: null } });
    pinTab(a);
    focusTab(a);

    // Through JSON, exactly as the prefs PUT / localStorage mirror would go.
    const wire = JSON.parse(JSON.stringify(serializeWorkspace()));
    const parsed = parseWorkspacePrefs(wire);
    assert.ok(parsed, 'the serialized workspace validates against its own schema');

    resetWorkspace();
    assert.deepEqual(getWorkspaceSnapshot().openTabs, []);

    hydrateWorkspaceFromPrefs(parsed);
    const restored = getWorkspaceSnapshot();
    assert.deepEqual(restored.openTabs.map((t) => t.id), [a, b]);
    assert.deepEqual(restored.openTabs[1]?.params, { step: 2, done: false, note: null });
    assert.deepEqual(restored.pinnedTabs, [a]);
    assert.equal(restored.focusedTabId, a);
  });

  it('serializes the WHOLE sub-map, because the prefs merge is shallow', () => {
    open({ kind: 'table', ref: 'orders' });
    const wire = serializeWorkspace();
    // Every key `WorkspacePrefs` declares, on every write — the server merge is
    // `prefs || patch`, so a partial sub-map DROPS the keys it omits. Adding a
    // key to the schema without adding it here is how a canvas layout or a
    // keybinding override silently stops surviving a reload.
    assert.deepEqual(Object.keys(wire).sort(), [
      'canvas',
      'focusedTabId',
      'keybindings',
      'openTabs',
      'pinnedTabs',
      'pinnedTools',
    ]);
  });

  it('rejects a bag that is not the workspace shape', () => {
    assert.equal(parseWorkspacePrefs({ openTabs: [{ id: 'x' }] }), null, 'a tab needs kind + ref');
    assert.equal(parseWorkspacePrefs({ openTabs: 'nope' }), null);
    assert.equal(parseWorkspacePrefs({ stray: true }), null, 'strict — unknown keys are a reject');
    assert.ok(parseWorkspacePrefs({}), 'an empty bag is valid: start from empty');
  });

  it('an absent key hydrates to an empty workspace — no seeded defaults', () => {
    open({ kind: 'table', ref: 'orders' });
    hydrateWorkspaceFromPrefs(null);
    assert.deepEqual(getWorkspaceSnapshot(), {
      openTabs: [],
      pinnedTabs: [],
      focusedTabId: null,
    });
  });

  it('drops pins and focus that name a tab the bag never carried', () => {
    hydrateWorkspace({
      openTabs: [{ id: 'a', kind: 'table', ref: 'orders', params: {} }],
      pinnedTabs: ['a', 'ghost'],
      focusedTabId: 'ghost',
    });
    assert.deepEqual(getWorkspaceSnapshot().pinnedTabs, ['a']);
    assert.equal(getWorkspaceSnapshot().focusedTabId, null);
  });

  it('de-dupes ids and clamps to the cap on hydrate', () => {
    const many = Array.from({ length: MAX_OPEN_TABS + 5 }, (_, i) => ({
      id: `t${i}`,
      kind: 'table' as const,
      ref: 'orders',
      params: {},
    }));
    hydrateWorkspace({ openTabs: [...many, many[0]!] });
    const ids = getWorkspaceSnapshot().openTabs.map((t) => t.id);
    assert.equal(ids.length, MAX_OPEN_TABS);
    assert.equal(new Set(ids).size, MAX_OPEN_TABS);
  });

  it('the device mirror key carries org + staff identity', () => {
    const key = workspaceStorageKey({ orgId: 'org-1', staffId: 42 });
    assert.equal(key, 'cf.workspace:org-1:42');
    assert.notEqual(key, workspaceStorageKey({ orgId: 'org-1', staffId: 43 }));
    assert.notEqual(key, workspaceStorageKey({ orgId: 'org-2', staffId: 42 }));
  });
});
