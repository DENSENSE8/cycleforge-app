/**
 * Station procedure map — the projection behind the Operations Studio
 * "Procedure" lens.
 *
 * Turns a declared `ProcedureDefinition` plus the station registries into the
 * thing an operator reads: an ordered list of acts, each carrying the endpoints
 * it drives, the realtime channels it rides, and the persistent relations it
 * reads and writes. Composed steps INHERIT their lineage from the registered
 * source/action they name; code-only steps carry their own.
 *
 * Pure by construction — no fetch, no React, no registry import. The registries
 * arrive as plain maps, which is what lets this be unit-tested DB-free and what
 * makes the lens correct with zero traffic: nothing here consults a runtime.
 * That "correct while idle" property is the whole point of a static map, and it
 * has a precedent — OpenLineage's static-lineage proposal exists precisely so
 * lineage can be stated outside the context of a run.
 *
 * Sibling of `static-flow-graph.ts`, NOT a replacement: that one classifies the
 * whole definition's nodes into sources → transforms → sinks (the topology
 * question, "where can data flow between steps"). This one goes one altitude
 * deeper into a single station ("what happens inside this step, and what does
 * each act touch"). Two different questions, two selectors, one canvas.
 */

// Type-only imports: erased at compile time, so this module pulls in neither the
// registry side-effects nor the block components' React graph.
import type { TableRef } from '@/lib/stations/contract';
import type { ProcedureDefinition, ProcedurePhase } from '@/lib/stations/procedure';

/** The minimal registered-source shape this projection needs (`DataSourceMeta` satisfies it). */
export interface ProcedureSourceLineage {
  id: string;
  label: string;
  integration: string;
  endpoint: string;
  permission?: string;
  realtime?: { ablyChannel?: string };
  reads?: TableRef[];
  writes?: TableRef[];
}

/** The minimal registered-action shape this projection needs (`ActionMeta` satisfies it). */
export interface ProcedureActionLineage {
  id: string;
  label: string;
  endpoint: { method: string; path: string };
  permission?: string;
  reads?: TableRef[];
  writes?: TableRef[];
}

export interface ProcedureRegistries {
  sources: ReadonlyMap<string, ProcedureSourceLineage>;
  actions: ReadonlyMap<string, ProcedureActionLineage>;
}

interface ProcedureEndpointView {
  method: string;
  path: string;
}

export interface ProcedureStepView {
  key: string;
  label: string;
  summary: string;
  /** 1-based position — what the canvas paints as the step number. */
  index: number;
  /**
   * Which surface renders this step. `capture` is the slice the station's
   * right-rail checklist shows the operator; `intake` precedes it and `commit`
   * is the terminal dock. Surfacing it here is what lets Studio say "these five
   * are what the bench walks them through" instead of implying all nine are.
   */
  phase: ProcedurePhase;
  endpoints: ProcedureEndpointView[];
  sources: Array<{ id: string; label: string; integration: string; endpoint: string }>;
  actions: Array<{ id: string; label: string }>;
  channels: string[];
  /** Relations this act reads — own plus inherited, deduped, stable-sorted. */
  reads: TableRef[];
  writes: TableRef[];
  /**
   * Registry ids the step names that are not registered. Rendered as a gap
   * rather than dropped: a step pointing at a missing source is a real
   * misconfiguration, and silently omitting it is how a map starts lying.
   */
  unresolved: string[];
}

export interface StationProcedureMap {
  surface: string;
  label: string;
  nodeTypes: string[];
  steps: ProcedureStepView[];
  /** Union across every step. */
  tables: { reads: string[]; writes: string[]; all: string[] };
  channels: string[];
  counts: {
    steps: number;
    reads: number;
    writes: number;
    unresolved: number;
    /** Steps the station checklist renders — the `capture` phase. */
    onBench: number;
  };
}

/** Dedupe on (table, via) and sort by table name so the diagram is stable across renders. */
function normalizeTables(refs: ReadonlyArray<TableRef>): TableRef[] {
  const seen = new Map<string, TableRef>();
  for (const ref of refs) {
    const key = `${ref.table} ${ref.via ?? ''}`;
    if (!seen.has(key)) seen.set(key, ref.via ? { table: ref.table, via: ref.via } : { table: ref.table });
  }
  return [...seen.values()].sort(
    (a, b) => a.table.localeCompare(b.table) || (a.via ?? '').localeCompare(b.via ?? ''),
  );
}

function uniqueSorted(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

/**
 * Project a declared procedure into its rendered map. Unknown registry ids
 * degrade to `unresolved` — this never throws, because a station diagram that
 * blanks on one bad id is worse than one that shows the gap.
 */
export function buildStationProcedureMap(
  procedure: ProcedureDefinition,
  registries: ProcedureRegistries,
): StationProcedureMap {
  const steps: ProcedureStepView[] = procedure.steps.map((step, i) => {
    const reads: TableRef[] = [...(step.reads ?? [])];
    const writes: TableRef[] = [...(step.writes ?? [])];
    const endpoints: ProcedureEndpointView[] = [];
    const channels: string[] = [];
    const sources: ProcedureStepView['sources'] = [];
    const actions: ProcedureStepView['actions'] = [];
    const unresolved: string[] = [];

    if (step.endpoint) endpoints.push({ method: step.endpoint.method, path: step.endpoint.path });
    if (step.realtimeChannel) channels.push(step.realtimeChannel);

    for (const id of step.sourceIds ?? []) {
      const src = registries.sources.get(id);
      if (!src) {
        unresolved.push(id);
        continue;
      }
      sources.push({
        id: src.id,
        label: src.label,
        integration: src.integration,
        endpoint: src.endpoint,
      });
      endpoints.push({ method: 'GET', path: src.endpoint });
      if (src.realtime?.ablyChannel) channels.push(src.realtime.ablyChannel);
      reads.push(...(src.reads ?? []));
      writes.push(...(src.writes ?? []));
    }

    for (const id of step.actionIds ?? []) {
      const action = registries.actions.get(id);
      if (!action) {
        unresolved.push(id);
        continue;
      }
      actions.push({ id: action.id, label: action.label });
      endpoints.push({ method: action.endpoint.method, path: action.endpoint.path });
      reads.push(...(action.reads ?? []));
      writes.push(...(action.writes ?? []));
    }

    return {
      key: step.key,
      label: step.label,
      summary: step.summary,
      index: i + 1,
      phase: step.phase,
      endpoints,
      sources,
      actions,
      channels: uniqueSorted(channels),
      reads: normalizeTables(reads),
      writes: normalizeTables(writes),
      unresolved,
    };
  });

  const readTables = uniqueSorted(steps.flatMap((s) => s.reads.map((r) => r.table)));
  const writeTables = uniqueSorted(steps.flatMap((s) => s.writes.map((w) => w.table)));

  return {
    surface: procedure.surface,
    label: procedure.label,
    nodeTypes: [...procedure.nodeTypes],
    steps,
    tables: {
      reads: readTables,
      writes: writeTables,
      all: uniqueSorted([...readTables, ...writeTables]),
    },
    channels: uniqueSorted(steps.flatMap((s) => s.channels)),
    counts: {
      steps: steps.length,
      reads: readTables.length,
      writes: writeTables.length,
      unresolved: steps.reduce((n, s) => n + s.unresolved.length, 0),
      onBench: steps.filter((s) => s.phase === 'capture').length,
    },
  };
}
