/**
 * Unit tests for quick-access pin sanitize + localStorage adapters.
 * Server sync is covered by schema tests + QuickAccessSync wiring.
 */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  addPin,
  getSettings,
  hydratePinned,
  insertPin,
  reorderPins,
  sanitizePinned,
  setSettings,
} from './storage';

function installFakeStore(): void {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
  const g = globalThis as unknown as {
    window: { localStorage: Storage; dispatchEvent: (e: Event) => boolean };
    localStorage: Storage;
  };
  g.localStorage = store;
  g.window = { localStorage: store, dispatchEvent: () => true };
}

beforeEach(() => {
  installFakeStore();
  setSettings({ pinned: [] });
});

test('sanitizePinned keeps label + exact href, drops external routes', () => {
  const out = sanitizePinned([
    {
      id: '1',
      label: 'Receiving',
      href: '/unbox?openReceivingId=50297',
      iconKey: 'receiving',
      addedAt: 10,
    },
    {
      id: '2',
      label: 'Bad',
      href: 'https://example.com',
      addedAt: 11,
    },
    {
      id: '3',
      label: '  Dup path  ',
      href: '/unbox?openReceivingId=50297',
      addedAt: 12,
    },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.href, '/unbox?openReceivingId=50297');
  assert.equal(out[0]!.label, 'Receiving');
});

test('addPin prepends and preserves exact href', () => {
  const { result } = addPin({
    label: 'Receiving',
    href: '/unbox?openReceivingId=50297',
    iconKey: 'receiving',
  });
  assert.equal(result, 'added');
  assert.equal(getSettings().pinned[0]!.href, '/unbox?openReceivingId=50297');
  assert.equal(getSettings().pinned[0]!.label, 'Receiving');
});

test('hydratePinned replaces local order without duplicating', () => {
  addPin({ label: 'A', href: '/a' });
  addPin({ label: 'B', href: '/b' });
  hydratePinned([{ id: 'x', label: 'Server', href: '/server?x=1', addedAt: 1 }]);
  assert.deepEqual(
    getSettings().pinned.map((p) => p.href),
    ['/server?x=1'],
  );
});

test('insertPin appends and moves an existing href', () => {
  addPin({ label: 'A', href: '/a' });
  addPin({ label: 'B', href: '/b' });
  insertPin({ label: 'C', href: '/c' });
  assert.deepEqual(
    getSettings().pinned.map((p) => p.href),
    ['/b', '/a', '/c'],
  );
  insertPin({ label: 'A', href: '/a' }, 0);
  assert.deepEqual(
    getSettings().pinned.map((p) => p.href),
    ['/a', '/b', '/c'],
  );
});

test('insertPin ignores Home — the spine root is not a shortcut', () => {
  insertPin({ label: 'Home', href: '/' });
  assert.deepEqual(getSettings().pinned.map((p) => p.href), []);
});

test('insertPin accepts Media Library', () => {
  // It stopped being structural on 2026-09-05: staff who live in it hoist it
  // themselves, and it leaves the top group when they do (pagesNotPinned).
  insertPin({ label: 'Media Library', href: '/ops/photos' });
  assert.deepEqual(getSettings().pinned.map((p) => p.href), ['/ops/photos']);
});

test('reorderPins respects id order', () => {
  addPin({ label: 'A', href: '/a' });
  addPin({ label: 'B', href: '/b' });
  // Prepend order → [B, A]
  const ids = getSettings().pinned.map((p) => p.id);
  reorderPins([ids[1]!, ids[0]!]);
  assert.deepEqual(
    getSettings().pinned.map((p) => p.href),
    ['/a', '/b'],
  );
});
