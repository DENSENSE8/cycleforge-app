/** Guards for the pending_skus "create in Zoho" queue (relational-reuse plan P3 §7). */

import { test } from 'node:test';
import { equal, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { queuePendingSku } from './pending-skus';

type Exec = Pick<PoolClient, 'query'>;

function captureExecutor() {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  return {
    calls,
    async query<T>(text: string, params?: unknown[]) {
      calls.push({ text, params: params ?? [] });
      return { rows: [{ id: 1, normalized_sku: '09991', raw_sku: '9991', status: 'PENDING', occurrences: 1 }] as T[], rowCount: 1 };
    },
  };
}

test('queuePendingSku upserts through fn_normalize_sku and bumps occurrences on conflict', async () => {
  const exec = captureExecutor();
  const row = await queuePendingSku({ rawSku: ' 9991 ', source: 'scan', suggestedTitle: 'Widget' }, exec as unknown as Exec);
  ok(row, 'returns the row');
  const { text, params } = exec.calls[0];
  ok(/INSERT INTO pending_skus/.test(text), 'inserts into pending_skus');
  ok(/fn_normalize_sku\(\$1\)/.test(text), 'normalized_sku computed by fn_normalize_sku');
  ok(/ON CONFLICT \(normalized_sku\) DO UPDATE/.test(text), 'idempotent on normalized_sku');
  ok(/occurrences\s*=\s*pending_skus\.occurrences\s*\+\s*1/.test(text), 'bumps occurrences');
  equal(params[0], '9991', 'raw is trimmed and passed for normalization');
  equal(params[1], 'scan');
  equal(params[2], 'Widget');
});

test('queuePendingSku no-ops on an empty SKU (no query)', async () => {
  const exec = captureExecutor();
  const row = await queuePendingSku({ rawSku: '   ' }, exec as unknown as Exec);
  equal(row, null);
  equal(exec.calls.length, 0, 'does not touch the DB for an empty SKU');
});

// ─── Migration guard ─────────────────────────────────────────────────────────

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
}

test('migration installs normalizer, dedup key, status CHECK, and auto-resolve trigger', () => {
  const sql = read('../migrations/2026-06-06b_pending_skus.sql');
  ok(/CREATE OR REPLACE FUNCTION fn_normalize_sku/.test(sql), 'normalizer function');
  ok(/lpad\(base, 5, '0'\)/.test(sql), 'pads numeric base to 5 digits');
  ok(/normalized_sku\s+text NOT NULL UNIQUE/.test(sql), 'dedup key is unique');
  ok(/CHECK \(status IN \('PENDING','CREATED','IGNORED','DUPLICATE'\)\)/.test(sql), 'status CHECK');
  ok(
    /CREATE TRIGGER trg_resolve_pending_sku[\s\S]*AFTER INSERT ON sku_catalog/.test(sql),
    'auto-resolve trigger fires on sku_catalog insert',
  );
  ok(/normalized_sku = fn_normalize_sku\(NEW\.sku\)/.test(sql), 'trigger matches via the same normalizer');
});
