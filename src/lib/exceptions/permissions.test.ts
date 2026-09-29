import test from 'node:test';
import assert from 'node:assert/strict';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import { exceptionLanding } from './permissions';

const holding = (...permissions: string[]) => (permission: PermissionString) => permissions.includes(permission);
const ALL = holding('orders.view', 'packing.review', 'sku_stock.view', 'receiving.view');

// The hub never lists every exception at once (owner 2026-09-29): every URL lands on ONE kind.
test('a bare or domain-only hub URL lands on the first kind the caller may see', () => {
  assert.deepEqual(exceptionLanding(ALL, { domain: null, kind: null }), { domain: 'fulfillment', kind: 'fbm' });
  assert.deepEqual(exceptionLanding(ALL, { domain: 'inventory', kind: null }), { domain: 'inventory', kind: 'pairs' });
  // Receiving-only: Inventory opens its one visible kind; bare opens the first visible kind anywhere.
  const receiving = holding('receiving.view');
  assert.deepEqual(exceptionLanding(receiving, { domain: 'inventory', kind: null }), { domain: 'inventory', kind: 'tracking' });
  assert.deepEqual(exceptionLanding(receiving, { domain: null, kind: null }), { domain: 'inventory', kind: 'tracking' });
  // A domain with no visible kind falls back to one the caller can open.
  assert.deepEqual(exceptionLanding(receiving, { domain: 'fulfillment', kind: null }), { domain: 'inventory', kind: 'tracking' });
});

test('a visible kind wins and carries its own domain; a hidden kind is replaced', () => {
  assert.deepEqual(exceptionLanding(ALL, { domain: 'fulfillment', kind: 'bins' }), { domain: 'inventory', kind: 'bins' });
  assert.deepEqual(exceptionLanding(holding('receiving.view'), { domain: 'fulfillment', kind: 'fbm' }), { domain: 'inventory', kind: 'tracking' });
  assert.equal(exceptionLanding(holding(), { domain: null, kind: null }), null);
});
