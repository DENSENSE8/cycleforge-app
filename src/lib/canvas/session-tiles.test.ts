import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canvasTileTitle,
  resetCanvasTileRegistry,
  resolveCanvasTile,
} from '@/lib/canvas/tile-registry';
import { SURFACE_KEYS, SURFACE_REGISTRY } from '@/lib/stations/surface-keys';
import type { TabDescriptor } from '@/lib/workspace/types';
import { registerSessionCanvasTiles, unregisteredSessionSurfaces } from './session-tiles';

function sessionTab(ref: string): TabDescriptor {
  return { id: `session:${ref}#1`, kind: 'session', ref, params: {} };
}

test('every ported surface resolves an exact-ref tile', () => {
  resetCanvasTileRegistry();
  registerSessionCanvasTiles();

  const gaps = new Set<string>(unregisteredSessionSurfaces());
  for (const key of SURFACE_KEYS) {
    const resolved = resolveCanvasTile(sessionTab(key));
    if (gaps.has(key)) {
      assert.equal(resolved, null, `${key} should keep the honest gap`);
      continue;
    }
    assert.ok(resolved, `${key} has no tile`);
    assert.equal(resolved.ref, key, `${key} must not fall through to a wildcard`);
    assert.equal(resolved.kind, 'session');
  }
});

test('a tile is titled by the registry, so the pane and the tab strip agree', () => {
  resetCanvasTileRegistry();
  registerSessionCanvasTiles();

  for (const key of SURFACE_KEYS) {
    if (unregisteredSessionSurfaces().includes(key)) continue;
    assert.equal(canvasTileTitle(sessionTab(key)), SURFACE_REGISTRY[key].label);
  }
});

test('a tab whose title param disagrees with the registry does not win', () => {
  resetCanvasTileRegistry();
  registerSessionCanvasTiles();

  const tab: TabDescriptor = {
    id: 'session:unbox#1',
    kind: 'session',
    ref: 'unbox',
    params: { title: 'Something else' },
  };
  assert.equal(canvasTileTitle(tab), SURFACE_REGISTRY.unbox.label);
});

test('an unported surface gets nothing rather than a neighbour bench', () => {
  resetCanvasTileRegistry();
  registerSessionCanvasTiles();

  // A wildcard would make this resolve to whichever bench registered last.
  assert.equal(resolveCanvasTile(sessionTab('outbound')), null);
  // …and so would a session tab minted by the assistant, whose ref is a uuid.
  assert.equal(resolveCanvasTile(sessionTab('4f1c9a70-0000-4000-8000-000000000000')), null);
});

test('registering twice is idempotent, so a hot reload is safe', () => {
  resetCanvasTileRegistry();
  registerSessionCanvasTiles();
  const first = resolveCanvasTile(sessionTab('unbox'));
  registerSessionCanvasTiles();
  const second = resolveCanvasTile(sessionTab('unbox'));
  assert.ok(first && second);
  assert.equal(second.ref, first.ref);
});
