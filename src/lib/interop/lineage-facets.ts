/**
 * OpenLineage facets over the station/procedure declarations.
 *
 * Pure and client-safe. The smallest phase of the interop lane and the highest
 * leverage: the lineage is ALREADY declared on `ProcedureStep.reads` /
 * `.writes`, and `data-lineage.guard.test.ts` already verifies those
 * declarations against the SQL that actually runs. All that was missing was a
 * shape anyone outside this repo could read — until now it was legible only to
 * the Studio Procedure lens.
 *
 * ## Table-level, and staying that way
 *
 * `data-lineage.guard.test.ts` chose table-level lineage on purpose, and its
 * docblock argues the case at length: column lineage needs a real SQL parser,
 * and a parser that fails open recreates the untrusted map the guard exists to
 * prevent. The industry agrees — dbt's native lineage is table-level, and
 * OpenLineage keeps column lineage an OPTIONAL facet a producer may simply
 * omit. So this emits `columnLineage` never, not `columnLineage: {}`.
 *
 * Do not "upgrade" this to column level. The guard that makes these
 * declarations trustworthy only checks tables; emitting columns would publish
 * a precision nothing verifies.
 *
 * ## Custom facets MUST carry a distinct prefix
 *
 * OpenLineage's extensibility rules are explicit: a custom facet is named
 * `{prefix}{name}{entity}Facet` in PascalCase and keyed `{prefix}_{name}` in
 * snake_case. A facet without a prefix collides with the standard set — and
 * the standard set grows, so today's unprefixed name is tomorrow's conflict.
 * Everything here is prefixed `cycleforge`.
 *
 * ## `_schemaURL` must be IMMUTABLE
 *
 * A branch URL is not a schema pointer: `…/main/facet.json` means "whatever
 * that file says today", so a consumer that stored an event last year cannot
 * recover the shape it was produced against. OpenLineage requires a pinned,
 * immutable location — a git SHA. {@link FACET_SCHEMA_COMMIT} is that pin, and
 * `lineage-facets.test.ts` fails on anything that is not a full 40-hex SHA
 * (branch names, `HEAD`, short SHAs included).
 *
 * **Bump the pin when a facet's SHAPE changes, and only then.** It identifies
 * the schema version, not the current commit — re-pinning it on every unrelated
 * push would make every previously-emitted `_schemaURL` a lie by omission.
 */

import type { TableRef } from '@/lib/stations/contract';
import type { ProcedureDefinition, ProcedureStep } from '@/lib/stations/procedure';

/** The prefix every custom facet here carries. */
export const FACET_PREFIX = 'cycleforge';

/**
 * The commit whose tree defines these facets' shape.
 *
 * See the module docblock: bump ONLY when a facet's shape changes.
 */
export const FACET_SCHEMA_COMMIT = '9dd945010888d829602bb16bd6fa14af30b934f2';

const SCHEMA_BASE =
  `https://raw.githubusercontent.com/DENSENSE8/cycleforge-app/${FACET_SCHEMA_COMMIT}` +
  `/docs/interop/openlineage`;

/**
 * `_producer` identifies the software that emitted the event. Pinned to the
 * same commit for the same reason.
 */
export const FACET_PRODUCER =
  `https://github.com/DENSENSE8/cycleforge-app/tree/${FACET_SCHEMA_COMMIT}`;

/** Every custom facet carries these two, per the OpenLineage base facet. */
interface BaseFacet {
  _producer: string;
  _schemaURL: string;
}

function baseFacet(name: string): BaseFacet {
  return { _producer: FACET_PRODUCER, _schemaURL: `${SCHEMA_BASE}/${name}.json` };
}

/** A dataset in OpenLineage terms — `namespace` + `name`. */
export interface LineageDataset {
  namespace: string;
  name: string;
  facets?: Record<string, unknown>;
}

/**
 * The dataset namespace for this product's Postgres relations.
 *
 * OpenLineage's naming convention for a database dataset is
 * `{scheme}://{host}/{database}`; a tenant's physical host is not something to
 * publish, so the namespace is logical and stable. It identifies "a Cycle
 * Forge relation" without disclosing infrastructure.
 */
export const LINEAGE_NAMESPACE = 'cycleforge://postgres';

/** A declared table reference becomes a dataset. */
export function datasetFor(ref: TableRef): LineageDataset {
  const ds: LineageDataset = { namespace: LINEAGE_NAMESPACE, name: ref.table };
  if (ref.via) {
    // `via` is a CHECKED claim (the guard verifies the named module really
    // touches the named table), so it is worth publishing — it tells a
    // consumer which module owns the write, not just that one exists.
    ds.facets = {
      [`${FACET_PREFIX}_via`]: { ...baseFacet('via'), module: ref.via },
    };
  }
  return ds;
}

/**
 * The `cycleforge_procedure` JOB facet — what this step IS to an operator.
 *
 * A job facet rather than a run facet because it describes the step's
 * definition, which is the same on every execution. Run facets are for
 * per-execution facts, and a projection of a static declaration has none.
 */
export interface CycleforgeProcedureJobFacet extends BaseFacet {
  surface: string;
  stepKey: string;
  label: string;
  summary: string;
  phase: string;
  endpoint?: { method: string; path: string };
  sourceIds?: string[];
  actionIds?: string[];
}

/** One OpenLineage-shaped job with its input/output datasets. */
export interface LineageJob {
  job: { namespace: string; name: string; facets: Record<string, unknown> };
  inputs: LineageDataset[];
  outputs: LineageDataset[];
}

export const LINEAGE_JOB_NAMESPACE = 'cycleforge';

/**
 * Project one procedure step into an OpenLineage job.
 *
 * Returns `null` for a step that declares no lineage at all — emitting an empty
 * job for one would publish a node that appears to touch nothing.
 */
export function jobForStep(
  procedure: ProcedureDefinition,
  step: ProcedureStep,
): LineageJob | null {
  const reads = step.reads ?? [];
  const writes = step.writes ?? [];
  if (reads.length === 0 && writes.length === 0) return null;

  const facet: CycleforgeProcedureJobFacet = {
    ...baseFacet('procedure'),
    surface: String(procedure.surface),
    stepKey: step.key,
    label: step.label,
    summary: step.summary,
    phase: step.phase,
    ...(step.endpoint ? { endpoint: step.endpoint } : {}),
    ...(step.sourceIds?.length ? { sourceIds: step.sourceIds } : {}),
    ...(step.actionIds?.length ? { actionIds: step.actionIds } : {}),
  };

  return {
    job: {
      namespace: LINEAGE_JOB_NAMESPACE,
      // Stable and unique: a step key is unique within its procedure.
      name: `${String(procedure.surface)}.${step.key}`,
      facets: { [`${FACET_PREFIX}_procedure`]: facet },
    },
    inputs: reads.map(datasetFor),
    outputs: writes.map(datasetFor),
  };
}

/** Project a whole procedure. Steps with no declared lineage are skipped. */
export function jobsForProcedure(procedure: ProcedureDefinition): LineageJob[] {
  const out: LineageJob[] = [];
  for (const step of procedure.steps) {
    const job = jobForStep(procedure, step);
    if (job) out.push(job);
  }
  return out;
}

/** The whole registry as a lineage document. */
export interface LineageDocument {
  producer: string;
  schemaCommit: string;
  jobs: LineageJob[];
  meta: {
    /** Stated so nobody mistakes this for column-level lineage. */
    granularity: 'table';
    granularityReason: string;
    /** Steps skipped because they declare no lineage (UI-only). */
    stepsWithoutLineage: number;
  };
}

export function lineageDocument(procedures: ProcedureDefinition[]): LineageDocument {
  const jobs: LineageJob[] = [];
  let stepsWithoutLineage = 0;

  for (const procedure of procedures) {
    for (const step of procedure.steps) {
      const job = jobForStep(procedure, step);
      if (job) jobs.push(job);
      else stepsWithoutLineage++;
    }
  }

  return {
    producer: FACET_PRODUCER,
    schemaCommit: FACET_SCHEMA_COMMIT,
    jobs,
    meta: {
      granularity: 'table',
      granularityReason:
        'Table-level by design. Column lineage requires a SQL parser, and a parser that fails open produces a map nobody can trust — the same reasoning behind dbt native lineage and OpenLineage keeping column lineage an optional facet.',
      stepsWithoutLineage,
    },
  };
}
