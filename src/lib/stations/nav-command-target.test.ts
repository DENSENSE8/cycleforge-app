import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { NAV_COMMAND_CODES, parseNavCommand } from './nav-command-codes';
import {
  isAlreadyAtNavCommand,
  navCommandPermission,
  resolveNavCommandTarget,
} from './nav-command-target';
import { getSidebarPageNav } from '@/lib/sidebar-navigation';

function origin(pathname: string, search = '') {
  return { pathname, params: new URLSearchParams(search) };
}

const QC = parseNavCommand('CMD-GO-QC')!;
const READY = parseNavCommand('CMD-GO-READY')!;

describe('resolveNavCommandTarget', () => {
  it('sends CMD-GO-QC to /test?view=testing', () => {
    const t = resolveNavCommandTarget(QC, origin('/pack'));
    assert.equal(t?.pathname, '/test');
    assert.equal(new URLSearchParams(t!.search).get('view'), 'testing');
  });

  it('sends CMD-GO-READY to /test with view CLEARED', () => {
    // Ready to Pack is `view: null` — the landing child. A stale `?view=testing`
    // riding along would land the operator back on the surface they just left.
    const t = resolveNavCommandTarget(READY, origin('/test', 'view=testing'));
    assert.equal(t?.pathname, '/test');
    assert.equal(new URLSearchParams(t!.search).get('view'), null);
  });

  it('does not carry the origin surface params to the destination', () => {
    const t = resolveNavCommandTarget(QC, origin('/unbox', 'rh_q=dell&open=17'));
    const params = new URLSearchParams(t!.search);
    assert.equal(params.get('rh_q'), null);
    assert.equal(params.get('open'), null);
  });
});

describe('isAlreadyAtNavCommand', () => {
  it('is true on the command target and false on its sibling', () => {
    assert.equal(isAlreadyAtNavCommand(QC, origin('/test', 'view=testing')), true);
    assert.equal(isAlreadyAtNavCommand(READY, origin('/test', 'view=testing')), false);
    assert.equal(isAlreadyAtNavCommand(READY, origin('/test')), true);
    assert.equal(isAlreadyAtNavCommand(QC, origin('/test')), false);
  });

  it('is false from another surface', () => {
    assert.equal(isAlreadyAtNavCommand(QC, origin('/unbox')), false);
    assert.equal(isAlreadyAtNavCommand(READY, origin('/pack')), false);
  });

  it('ignores an operator filter when deciding "already here"', () => {
    // Compared on the resolved CHILD, not the URL string — re-pushing `/test`
    // over `/test?staff=7` would silently drop a filter set by hand.
    assert.equal(isAlreadyAtNavCommand(READY, origin('/test', 'staff=7')), true);
  });
});


describe('the registry as a whole', () => {
  it('every code names a page that exists', () => {
    // A sticker is a physical object. Printing one for a `pageId` this build
    // does not have means a laminated card on a bench that does nothing, and
    // nothing in the app would ever say so.
    for (const def of NAV_COMMAND_CODES) {
      assert.ok(getSidebarPageNav(def.pageId), `${def.code} → page ${def.pageId}`);
    }
  });

  it('every code that names a child names one that exists', () => {
    for (const def of NAV_COMMAND_CODES) {
      if (!def.childId) continue;
      const page = getSidebarPageNav(def.pageId)!;
      const child = page.children?.find((c) => c.id === def.childId);
      assert.ok(child, `${def.code} → ${def.pageId}/${def.childId}`);
    }
  });

  it('every code resolves to a real destination from an arbitrary origin', () => {
    for (const def of NAV_COMMAND_CODES) {
      const target = resolveNavCommandTarget(def, origin('/unbox', 'open=17'));
      assert.ok(target, def.code);
      assert.ok(target!.pathname.startsWith('/'), `${def.code} → ${target!.pathname}`);
    }
  });

  it('every code derives a permission from its own nav entry', () => {
    // Derived, never declared — a hand-copied gate goes stale silently when the
    // page's own `requires` changes.
    for (const def of NAV_COMMAND_CODES) {
      const perm = navCommandPermission(def);
      const page = getSidebarPageNav(def.pageId)!;
      const child = def.childId
        ? page.children?.find((c) => c.id === def.childId)
        : undefined;
      assert.equal(perm, child?.requires ?? page.requires ?? null, def.code);
    }
  });

  it('has no duplicate destination — two codes for one surface is a print error', () => {
    const seen = new Map<string, string>();
    for (const def of NAV_COMMAND_CODES) {
      const key = `${def.pageId}/${def.childId ?? ''}`;
      assert.equal(seen.get(key), undefined, `${def.code} duplicates ${seen.get(key)}`);
      seen.set(key, def.code);
    }
  });
});
