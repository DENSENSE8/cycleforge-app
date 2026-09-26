/** OpenLineage facets over the station/procedure declarations. */

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

/** The dataset namespace for this product's Postgres relations. */
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

/** The `cycleforge_procedure` JOB facet — what this step IS to an operator. */
export interface CycleforgeProcedureJobFacet extends BaseFacet {
  surface: string;
  stepKey: string;
  label: string;
  summary: string;
  phase: string;
  /** True when the station registry drives the step; false when it is hand-coded UI over a hand-coded route. */
  composed: boolean;
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

/** Project one procedure step into an OpenLineage job. */
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
    composed: step.composed,
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
    /** Steps skipped because they declare no lineage (composed / UI-only). */
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
