/** Station procedure map — the projection behind the Operations Studio "Procedure" lens. */

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
  /** Which surface renders this step. */
  phase: ProcedurePhase;
  /** The station registry drives this step; false = hand-coded UI over a hand-coded route. */
  composed: boolean;
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
    composed: number;
    codeOnly: number;
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
      composed: step.composed,
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
      composed: steps.filter((s) => s.composed).length,
      codeOnly: steps.filter((s) => !s.composed).length,
      reads: readTables.length,
      writes: writeTables.length,
      unresolved: steps.reduce((n, s) => n + s.unresolved.length, 0),
      onBench: steps.filter((s) => s.phase === 'capture').length,
    },
  };
}
