import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  notInboundMirrorTerminalPredicate,
  notLineInboundMirrorTerminalPredicate,
} from './mirror';

test('notInboundMirrorTerminalPredicate pins ebay source_type', () => {
  const sql = notInboundMirrorTerminalPredicate('ebay');
  assert.match(sql, /source_type = 'ebay'/);
  assert.match(sql, /inbound_purchase_order_mirror/);
  assert.match(sql, /cancelled/);
});

test('notLineInboundMirrorTerminalPredicate keys off rl.inbound_source_type', () => {
  const sql = notLineInboundMirrorTerminalPredicate();
  assert.match(sql, /ipm\.source_type = rl\.inbound_source_type/);
  assert.match(sql, /inbound_purchase_order_mirror/);
});
