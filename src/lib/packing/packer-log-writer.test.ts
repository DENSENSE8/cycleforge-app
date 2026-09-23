import { deepEqual, doesNotMatch, equal, match, ok } from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import {
  createPackerLog,
  finalizePackerLogCapture,
  startPackerLogCapture,
  touchPackerLog,
} from './packer-log-writer';

type Exec = Pick<PoolClient, 'query'>;

function executor(rowsByCall: Array<Array<Record<string, unknown>>>) {
  const calls: Array<{ text: string; params: unknown[] }> = [];
  return {
    calls,
    query: async (text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return { rows: rowsByCall[calls.length - 1] ?? [], rowCount: 1 };
    },
  };
}

test('createPackerLog stamps completion state and emits the canonical event', async () => {
  const db = executor([
    [{ id: 41, created_at: '2026-09-18T12:00:00.000Z', completion_state: 'COMPLETED' }],
    [],
  ]);
  const result = await createPackerLog(db as unknown as Exec, {
    organizationId: '11111111-1111-4111-8111-111111111111',
    shipmentId: 9,
    scanRef: '1Z999',
    trackingType: 'ORDERS',
    packedBy: 7,
    source: 'test',
  });
  equal(result?.id, 41);
  match(db.calls[0].text, /INSERT INTO packer_logs/);
  equal(db.calls[0].params[4], 'COMPLETED');
  match(db.calls[1].text, /INSERT INTO ops_events/);
  equal(db.calls[1].params[2], 'pack_completed');
  equal(db.calls[1].params[5], 'packer-log:41:pack_completed');
});

test('startPackerLogCapture is a resumable upsert with one event identity', async () => {
  const db = executor([
    [{ id: 12, created_at: '2026-09-18T12:00:00.000Z', completion_state: 'CAPTURING' }],
    [],
  ]);
  const result = await startPackerLogCapture(db as unknown as Exec, {
    organizationId: '11111111-1111-4111-8111-111111111111',
    shipmentId: 5,
    scanRef: 'TRACK',
    packedBy: 3,
    source: 'test.capture',
  });
  equal(result.completionState, 'CAPTURING');
  match(db.calls[0].text, /ON CONFLICT \(organization_id, shipment_id\)/);
  equal(db.calls[1].params[2], 'pack_capture_started');
});

test('finalizePackerLogCapture only promotes CAPTURING and emits pack_completed', async () => {
  const db = executor([
    [{ id: 12, created_at: '2026-09-18T12:00:00.000Z', completion_state: 'COMPLETED' }],
    [],
  ]);
  const result = await finalizePackerLogCapture(db as unknown as Exec, {
    organizationId: '11111111-1111-4111-8111-111111111111',
    packerLogId: 12,
    packedBy: 3,
    shipmentId: 5,
    scanRef: 'TRACK',
    source: 'test.finalize',
  });
  equal(result?.completionState, 'COMPLETED');
  deepEqual(db.calls[0].params.slice(0, 5), [12, 'COMPLETED', 3, '11111111-1111-4111-8111-111111111111', 'CAPTURING']);
  equal(db.calls[1].params[2], 'pack_completed');
});

test('touchPackerLog is tenant scoped and does not emit a business event', async () => {
  const db = executor([
    [{ id: 8, created_at: '2026-09-18T12:00:00.000Z', completion_state: 'COMPLETED' }],
  ]);
  const result = await touchPackerLog(db as unknown as Exec, {
    organizationId: '11111111-1111-4111-8111-111111111111',
    packerLogId: 8,
    packedBy: 4,
    source: 'test.touch',
  });
  equal(result?.id, 8);
  equal(db.calls.length, 1);
  match(db.calls[0].text, /organization_id = \$3::uuid/);
});

function sourceFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

test('application code routes packer_logs inserts through the canonical writer', () => {
  const srcRoot = resolve(process.cwd(), 'src');
  const allowed = new Set([
    'lib/packing/packer-log-writer.ts',
    'lib/packing/packer-log-writer.test.ts',
  ]);
  const violations: string[] = [];
  for (const file of sourceFiles(srcRoot)) {
    const rel = relative(srcRoot, file);
    if (allowed.has(rel)) continue;
    const source = readFileSync(file, 'utf8');
    if (/INSERT\s+INTO\s+packer_logs/i.test(source) || /\.insert\(packerLogs\)/.test(source)) {
      violations.push(rel);
    }
  }
  ok(violations.length === 0, `raw packer_logs writers:\n${violations.join('\n')}`);
});

test('legacy packer-log metadata updates remain tenant scoped and cannot mass-assign lifecycle fields', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/app/api/packerlogs/route.ts'), 'utf8');
  match(source, /eq\(packerLogs\.organizationId, ctx\.organizationId\)/);
  match(source, /const updateData: Partial<[^;]+> = \{\}/);
  doesNotMatch(source, /const \{ id, \.\.\.updateData \} = body/);
});
