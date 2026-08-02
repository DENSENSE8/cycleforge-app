/**
 * Guard + unit test for the OpenLineage facet projection.
 *
 * The `_schemaURL` assertions are the load-bearing ones. OpenLineage requires
 * an IMMUTABLE schema pointer, and the way that requirement gets violated is
 * always the same: someone writes `…/main/facet.json` because it is the URL
 * they can see in a browser. That produces events whose declared schema
 * changes retroactively, which is worse than no pointer at all.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/lib/interop/lineage-facets.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACET_PREFIX,
  FACET_PRODUCER,
  FACET_SCHEMA_COMMIT,
  LINEAGE_JOB_NAMESPACE,
  LINEAGE_NAMESPACE,
  datasetFor,
  jobForStep,
  jobsForProcedure,
  lineageDocument,
  type CycleforgeProcedureJobFacet,
  type LineageDataset,
  type LineageDocument,
  type LineageJob,
} from './lineage-facets';
import { listProcedures, type ProcedureDefinition, type ProcedureStep } from '@/lib/stations/procedure';
import { registerStationBuiltins } from '@/lib/stations/index';

registerStationBuiltins();

const step = (over: Partial<ProcedureStep> = {}): ProcedureStep => ({
  key: 'serial',
  label: 'Scan serial',
  summary: 'Scan the unit serial.',
  phase: 'capture',
  composed: false,
  ...over,
});

const procedure = (steps: ProcedureStep[]): ProcedureDefinition =>
  ({ surface: 'receiving.unbox', label: 'Unbox', nodeTypes: [], steps }) as never;

// ─── The immutability rule ──────────────────────────────────────────────────

test('the schema pin is a full git SHA, never a branch', () => {
  assert.match(
    FACET_SCHEMA_COMMIT,
    /^[0-9a-f]{40}$/,
    'a schema pin must be a full 40-hex commit SHA',
  );
  for (const bad of ['main', 'master', 'HEAD', 'latest']) {
    assert.notEqual(FACET_SCHEMA_COMMIT, bad);
  }
});

test('every emitted _schemaURL and _producer is pinned, and none names a branch', () => {
  const job = jobForStep(procedure([step({ reads: [{ table: 'receiving_line' }] })]), step({ reads: [{ table: 'receiving_line' }] }));
  assert.ok(job);

  const facet = job.job.facets[`${FACET_PREFIX}_procedure`] as Record<string, string>;
  assert.ok(facet._schemaURL.includes(FACET_SCHEMA_COMMIT), 'schema URL carries the pin');
  assert.ok(facet._producer.includes(FACET_SCHEMA_COMMIT), 'producer carries the pin');

  // The specific mistake this exists to prevent.
  for (const url of [facet._schemaURL, facet._producer, FACET_PRODUCER]) {
    assert.doesNotMatch(url, /\/(main|master|HEAD|refs\/heads)\//, `${url} points at a mutable ref`);
  }
});

// ─── Facet naming ───────────────────────────────────────────────────────────

test('custom facets are prefixed, so they cannot collide with the standard set', () => {
  const s = step({ reads: [{ table: 'receiving_line' }] });
  const job = jobForStep(procedure([s]), s);
  assert.ok(job);

  const keys = Object.keys(job.job.facets);
  assert.deepEqual(keys, ['cycleforge_procedure']);
  for (const key of keys) {
    assert.ok(key.startsWith(`${FACET_PREFIX}_`), `${key} must carry the project prefix`);
    assert.match(key, /^[a-z][a-z0-9_]*$/, 'facet keys are snake_case');
  }
});

test('a `via` claim rides as its own prefixed dataset facet', () => {
  const plain = datasetFor({ table: 'receiving_unbox' });
  assert.deepEqual(plain, { namespace: LINEAGE_NAMESPACE, name: 'receiving_unbox' });
  assert.equal(plain.facets, undefined, 'no facet when there is nothing to say');

  const viaed = datasetFor({
    table: 'receiving_unbox',
    via: '@/lib/receiving/streets/carton-street-write',
  });
  const facet = viaed.facets?.['cycleforge_via'] as Record<string, string>;
  assert.ok(facet);
  assert.equal(facet.module, '@/lib/receiving/streets/carton-street-write');
  assert.ok(facet._schemaURL.includes(FACET_SCHEMA_COMMIT));
});

test('the dataset namespace is logical and discloses no infrastructure', () => {
  const ds: LineageDataset = datasetFor({ table: 'receiving_line' });
  assert.equal(ds.namespace, 'cycleforge://postgres');
  // A tenant's real host/database must never appear in a published namespace.
  assert.doesNotMatch(ds.namespace, /neon|amazonaws|\.tech|:\d{4,5}/i);
});

// ─── Table-level, and staying that way ──────────────────────────────────────

test('no columnLineage facet is emitted anywhere', () => {
  // Column lineage would publish a precision that data-lineage.guard.test.ts
  // does not verify. Absent, not empty.
  const doc: LineageDocument = lineageDocument(listProcedures());
  const serialized = JSON.stringify(doc);
  assert.doesNotMatch(serialized, /columnLineage/i);
  assert.equal(doc.meta.granularity, 'table');
  assert.ok(doc.meta.granularityReason.length > 40, 'the choice is explained, not asserted');
});

// ─── Projection behaviour ───────────────────────────────────────────────────

test('reads become inputs and writes become outputs', () => {
  const s = step({
    reads: [{ table: 'receiving_line' }, { table: 'photos' }],
    writes: [{ table: 'receiving_line_testing' }],
    endpoint: { method: 'POST', path: '/api/receiving/serial' },
  });
  const job: LineageJob | null = jobForStep(procedure([s]), s);
  assert.ok(job);

  assert.deepEqual(job.inputs.map((d) => d.name), ['receiving_line', 'photos']);
  assert.deepEqual(job.outputs.map((d) => d.name), ['receiving_line_testing']);
  assert.equal(job.job.namespace, LINEAGE_JOB_NAMESPACE);
  assert.equal(job.job.name, 'receiving.unbox.serial', 'surface-qualified, so keys stay unique');

  const facet = job.job.facets['cycleforge_procedure'] as CycleforgeProcedureJobFacet;
  assert.deepEqual(facet.endpoint, { method: 'POST', path: '/api/receiving/serial' });
  assert.equal(facet.composed, false);
  assert.equal(facet.stepKey, 'serial');
  assert.equal(facet.surface, 'receiving.unbox');
});

test('a step with no declared lineage yields no job, rather than a phantom node', () => {
  // Composed steps inherit lineage from the source/action they bind, so an
  // empty job would claim they touch nothing — the phantom edge that
  // data-lineage.guard.test.ts rejects from the other direction.
  assert.equal(jobForStep(procedure([step()]), step()), null);
  assert.equal(jobForStep(procedure([step({ reads: [] })]), step({ reads: [] })), null);

  const withOnlyWrites = step({ writes: [{ table: 'receiving_carton' }] });
  assert.ok(jobForStep(procedure([withOnlyWrites]), withOnlyWrites), 'writes alone are enough');
});

test('skipped steps are counted, so the map states its own coverage', () => {
  const doc = lineageDocument([
    procedure([
      step({ key: 'a', reads: [{ table: 'receiving_line' }] }),
      step({ key: 'b' }),
      step({ key: 'c' }),
    ]),
  ]);
  assert.equal(doc.jobs.length, 1);
  assert.equal(doc.meta.stepsWithoutLineage, 2);
});

test('the real registry projects without throwing and produces real edges', () => {
  // Not a snapshot — this asserts the projection survives contact with the
  // actual declarations, which is what changes underneath it.
  const procedures = listProcedures();
  assert.ok(procedures.length > 0, 'station builtins registered');

  const doc = lineageDocument(procedures);
  assert.ok(doc.jobs.length > 0, 'the declared lineage produces at least one job');

  for (const job of doc.jobs) {
    assert.ok(job.job.name.includes('.'), 'job names are surface-qualified');
    assert.ok(
      job.inputs.length + job.outputs.length > 0,
      `${job.job.name} was emitted with no edges`,
    );
    for (const ds of [...job.inputs, ...job.outputs]) {
      assert.equal(ds.namespace, LINEAGE_NAMESPACE);
      assert.match(ds.name, /^[a-z_][a-z0-9_]*$/, `${ds.name} is not a relation name`);
    }
  }
});

test('jobsForProcedure and lineageDocument agree', () => {
  const procedures = listProcedures();
  const viaHelper = procedures.flatMap(jobsForProcedure).length;
  assert.equal(lineageDocument(procedures).jobs.length, viaHelper);
});
