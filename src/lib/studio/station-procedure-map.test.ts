/**
 * The Procedure lens is only worth shipping if it is right with NOTHING moving,
 * so the projection is tested directly — no DB, no fetch, no React.
 *   node --import tsx --test src/lib/studio/station-procedure-map.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProcedureDefinition } from '@/lib/stations/procedure';
import {
  buildStationProcedureMap,
  type ProcedureActionLineage,
  type ProcedureRegistries,
  type ProcedureSourceLineage,
} from './station-procedure-map';

const source: ProcedureSourceLineage = {
  id: 'demo.queue',
  label: 'Demo queue',
  integration: 'demo',
  endpoint: '/api/demo/queue',
  realtime: { ablyChannel: 'station:changes' },
  reads: [{ table: 'demo_carton' }, { table: 'demo_line' }],
  writes: [],
};

const action: ProcedureActionLineage = {
  id: 'demo.finish',
  label: 'Finish',
  endpoint: { method: 'POST', path: '/api/demo/finish' },
  reads: [{ table: 'demo_line' }],
  writes: [{ table: 'demo_line' }, { table: 'demo_ledger', via: '@/lib/demo/ledger' }],
};

const registries: ProcedureRegistries = {
  sources: new Map([[source.id, source]]),
  actions: new Map([[action.id, action]]),
};

const procedure: ProcedureDefinition = {
  surface: 'unbox',
  label: 'Demo',
  nodeTypes: ['receiving'],
  steps: [
    {
      key: 'pick',
      label: 'Pick',
      summary: 'Pick from the queue.',
      composed: true,
      sourceIds: ['demo.queue'],
    },
    {
      key: 'stamp',
      label: 'Stamp',
      summary: 'Stamp the line.',
      composed: false,
      endpoint: { method: 'POST', path: '/api/demo/stamp' },
      reads: [{ table: 'demo_line' }],
      writes: [{ table: 'demo_line_testing' }],
    },
    {
      key: 'finish',
      label: 'Finish',
      summary: 'Close it out.',
      composed: true,
      actionIds: ['demo.finish'],
    },
  ],
};

test('a composed step inherits its lineage, endpoint and channel from the registry', () => {
  const map = buildStationProcedureMap(procedure, registries);
  const pick = map.steps[0];
  assert.equal(pick.composed, true);
  assert.deepEqual(pick.reads.map((r) => r.table), ['demo_carton', 'demo_line']);
  assert.deepEqual(pick.endpoints, [{ method: 'GET', path: '/api/demo/queue' }]);
  assert.deepEqual(pick.channels, ['station:changes']);
  assert.deepEqual(pick.sources.map((s) => s.id), ['demo.queue']);
});

test('a code-only step carries its own lineage and keeps its declared method', () => {
  const map = buildStationProcedureMap(procedure, registries);
  const stamp = map.steps[1];
  assert.equal(stamp.composed, false);
  assert.deepEqual(stamp.endpoints, [{ method: 'POST', path: '/api/demo/stamp' }]);
  assert.deepEqual(stamp.writes.map((w) => w.table), ['demo_line_testing']);
});

test('steps are numbered in declaration order', () => {
  const map = buildStationProcedureMap(procedure, registries);
  assert.deepEqual(map.steps.map((s) => s.index), [1, 2, 3]);
  assert.deepEqual(map.steps.map((s) => s.key), ['pick', 'stamp', 'finish']);
});

test('a table is deduped per step but keeps a distinct `via` attribution', () => {
  const map = buildStationProcedureMap(
    {
      ...procedure,
      steps: [
        {
          key: 'dupe',
          label: 'Dupe',
          summary: '',
          composed: false,
          endpoint: { method: 'POST', path: '/x' },
          reads: [
            { table: 'demo_line' },
            { table: 'demo_line' },
            { table: 'demo_line', via: '@/lib/demo/helper' },
          ],
          writes: [],
        },
      ],
    },
    registries,
  );
  assert.deepEqual(map.steps[0].reads, [
    { table: 'demo_line' },
    { table: 'demo_line', via: '@/lib/demo/helper' },
  ]);
});

test('the map rolls up the union of tables, channels and step kinds', () => {
  const map = buildStationProcedureMap(procedure, registries);
  assert.deepEqual(map.tables.reads, ['demo_carton', 'demo_line']);
  assert.deepEqual(map.tables.writes, ['demo_ledger', 'demo_line', 'demo_line_testing']);
  assert.deepEqual(map.tables.all, [
    'demo_carton',
    'demo_ledger',
    'demo_line',
    'demo_line_testing',
  ]);
  assert.deepEqual(map.channels, ['station:changes']);
  assert.equal(map.counts.steps, 3);
  assert.equal(map.counts.composed, 2);
  assert.equal(map.counts.codeOnly, 1);
  assert.equal(map.counts.unresolved, 0);
});

test('an unregistered id surfaces as a gap instead of throwing or vanishing', () => {
  const map = buildStationProcedureMap(
    {
      ...procedure,
      steps: [
        {
          key: 'broken',
          label: 'Broken',
          summary: '',
          composed: true,
          sourceIds: ['demo.missing'],
          actionIds: ['demo.also_missing'],
        },
      ],
    },
    registries,
  );
  assert.deepEqual(map.steps[0].unresolved, ['demo.missing', 'demo.also_missing']);
  assert.deepEqual(map.steps[0].reads, []);
  assert.equal(map.counts.unresolved, 2);
});

test('the projection is pure — the same input twice yields deep-equal output', () => {
  const a = buildStationProcedureMap(procedure, registries);
  const b = buildStationProcedureMap(procedure, registries);
  assert.deepEqual(a, b);
});

test('the declared Unbox procedure projects with real registries', async () => {
  const { getProcedure } = await import('@/lib/stations/procedure');
  const { listDataSourceMeta } = await import('@/lib/stations/data-sources');
  const { listActionMeta } = await import('@/lib/stations/actions');
  const { registerStationBuiltins } = await import('@/lib/stations/index');
  registerStationBuiltins();

  const unbox = getProcedure('unbox');
  assert.ok(unbox, 'unbox procedure is registered');
  const map = buildStationProcedureMap(unbox, {
    sources: new Map(listDataSourceMeta().map((s) => [s.id, s])),
    actions: new Map(listActionMeta().map((a) => [a.id, a])),
  });
  // 2026-09-06: the capture + commit acts are registered actions now; only
  // the scan (a trigger, not a row verb) is still code-only.
  assert.ok(map.counts.composed >= 13, `expected the bench acts composed, got ${map.counts.composed}`);

  // Correct with zero traffic: the whole bench procedure, not just the one
  // step the station registry happens to drive today.
  assert.ok(map.counts.steps >= 7, `expected the full bench procedure, got ${map.counts.steps} steps`);
  assert.equal(map.counts.unresolved, 0, 'every registry id the procedure names must resolve');
  assert.ok(map.tables.writes.includes('serial_units'), 'capturing serials must show as a write');
  assert.ok(map.tables.reads.includes('receiving_carton'), 'the carton spine must show as a read');
  assert.ok(map.counts.codeOnly > 0, 'the map must admit which steps are still hand-coded');
});
