/**
 * registerTool — the writer that keeps the dedupe corpus honest.
 * Run: npx tsx --test src/lib/tool-forge/registry.test.ts
 */

import '@/lib/assistant/test-db-url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerTool, backfillEmbeddings } from './registry';

const ORG = '11111111-2222-3333-4444-555555555555';

function fakeTx(rowsFor: (sql: string) => Array<Record<string, unknown>> = () => [{ id: 1 }]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return { rows: rowsFor(sql) };
    },
  };
  const tx = async <T>(orgId: string, fn: (c: never) => Promise<T>) => {
    assert.equal(orgId, ORG, 'every write must run under the caller org');
    return fn(client as never);
  };
  return { calls, tx: tx as never };
}

const embedOk = async (texts: string[]) => texts.map(() => new Array(768).fill(0.02));

test('registers a tool with its vector', async () => {
  const { calls, tx } = fakeTx();
  const res = await registerTool(
    ORG,
    { toolKey: 'lookup_serial', name: 'Serial lookup', description: 'Look up a serial number.' },
    { embed: embedOk, tx },
  );

  assert.equal(res.id, 1);
  assert.equal(res.embedded, true);
  const insert = calls.find((c) => c.sql.includes('INSERT INTO tool_registry'));
  assert.ok(insert, 'the tool was written');
  assert.equal(insert.params[0], ORG, 'org leads the params');
  assert.match(String(insert.params[6]), /^\[0\.02,/, 'the vector is sent as a pgvector literal');
});

test('a provider outage still records the tool, unembedded', async () => {
  const { calls, tx } = fakeTx();
  const res = await registerTool(
    ORG,
    { toolKey: 'x', name: 'X', description: 'does a thing' },
    { embed: async () => { throw new Error('ETIMEDOUT'); }, tx },
  );

  assert.equal(res.embedded, false, 'losing the tool entirely would be worse than losing its vector');
  assert.match(res.embedError ?? '', /ETIMEDOUT/);
  const insert = calls.find((c) => c.sql.includes('INSERT INTO tool_registry'));
  assert.equal(insert?.params[6], null, 'embedding is written NULL, not as a zero vector');
});

test('an update that could not embed keeps the vector it already had', async () => {
  const { calls, tx } = fakeTx();
  await registerTool(
    ORG,
    { toolKey: 'x', name: 'Renamed', description: 'does a thing' },
    { embed: async () => { throw new Error('down'); }, tx },
  );
  const insert = calls.find((c) => c.sql.includes('INSERT INTO tool_registry'));
  assert.match(
    insert?.sql ?? '',
    /COALESCE\(EXCLUDED\.embedding, tool_registry\.embedding\)/,
    'a blip during a rename must not blind the gate to a tool it could already match',
  );
});

test('backfill heals rows that have no vector', async () => {
  const { tx } = fakeTx((sql) => {
    if (sql.includes('SELECT id, description')) {
      return [{ id: 5, description: 'a' }, { id: 6, description: 'b' }];
    }
    if (sql.includes('count(*)')) return [{ n: 0 }];
    return [];
  });

  const res = await backfillEmbeddings(ORG, 50, { embed: embedOk, tx });
  assert.equal(res.healed, 2);
  assert.equal(res.remaining, 0);
});

test('backfill with nothing pending does no work', async () => {
  const { calls, tx } = fakeTx(() => []);
  const res = await backfillEmbeddings(ORG, 50, {
    embed: async () => { throw new Error('must not be called'); },
    tx,
  });
  assert.deepEqual(res, { healed: 0, remaining: 0 });
  assert.equal(calls.filter((c) => c.sql.includes('UPDATE')).length, 0);
});
