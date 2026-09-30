import assert from 'node:assert/strict';
import test from 'node:test';
import { SIDEBAR_PAGE_NAV } from '@/lib/sidebar-navigation';
import { PAGE_NEXT_ACTIONS } from './next-actions';

test('every next-action entry names a live sidebar page (a renamed page must not silently lose its line)', () => {
  const pageIds = new Set(SIDEBAR_PAGE_NAV.map((page) => page.id));
  const stale = Object.keys(PAGE_NEXT_ACTIONS).filter((id) => !pageIds.has(id));
  assert.deepEqual(stale, []);
});
