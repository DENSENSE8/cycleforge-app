/**
 * Hard law: POST /api/receiving/lookup-po never calls live Zoho / inventory on
 * the scan hot path (tracking, ticket#, order/PO#, auto).
 *
 * Source guard — cheaper than standing up the full route + Zoho client.
 *
 * Run: `tsx --test src/app/api/receiving/lookup-po/local-only.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('./route.ts', import.meta.url)), 'utf8');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('lookup-po route does not import live Zoho search / PO-number APIs', () => {
  assert.equal(CODE.includes("from '@/lib/zoho'"), false);
  assert.equal(CODE.includes('searchPurchaseOrdersByTracking'), false);
  assert.equal(CODE.includes('searchPurchaseReceivesByTracking'), false);
  assert.equal(CODE.includes('findPurchaseOrderByNumber'), false);
});

test('lookup-po route does not import Zoho receiving sync on scan', () => {
  assert.equal(CODE.includes('importZohoPurchaseOrderToReceiving'), false);
  assert.equal(CODE.includes("from '@/lib/zoho-receiving-sync'"), false);
});

test('lookup-po route does not call inventory provider on scan', () => {
  assert.equal(CODE.includes('getInventoryProvider'), false);
});
