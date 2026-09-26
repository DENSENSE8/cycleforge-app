'use client';

/** StationProcedurePanel — the station's ordered procedure + per-step data box. */

import { useMemo } from 'react';
import { icons } from 'lucide-react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { buildStationProcedureMap, type StationProcedureMap } from '@/lib/studio/station-procedure-map';
import { procedureForNodeType } from '@/lib/stations/procedure';
import { listDataSourceMeta } from '@/lib/stations/data-sources';
import { listActionMeta } from '@/lib/stations/actions';
import { registerStationBuiltins } from '@/lib/stations';
import type { StudioGraphNode } from './studio-types';

/** The declared procedure for a node's type, projected — or null when none is declared. */
export function useStationProcedureMap(node: StudioGraphNode | null): StationProcedureMap | null {
  return useMemo(() => {
    if (!node) return null;
    registerStationBuiltins();
    const declared = procedureForNodeType(node.type);
    if (!declared) return null;
    return buildStationProcedureMap(declared, {
      sources: new Map(listDataSourceMeta().map((s) => [s.id, s])),
      actions: new Map(listActionMeta().map((a) => [a.id, a])),
    });
  }, [node]);
}

export function StationProcedurePanel({ map }: { map: StationProcedureMap }) {
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-role-micro uppercase tracking-wider text-text-faint">Procedure</h3>
        <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro font-semibold tabular-nums text-text-muted">
          {map.counts.steps} steps
        </span>
        <HoverTooltip
          label={`Up to ${map.counts.onBench} of ${map.counts.steps} steps reach the operator's right-rail checklist (the capture phase). Any one carton sees fewer — a step can be scoped to a carton shape, so Classify appears only on an unfound carton and Packing material drops on a local pickup. The rest are intake (how the carton got here) and commit (the terminal dock's job).`}
          asChild
        >
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-role-micro font-semibold tabular-nums text-blue-700">
            up to {map.counts.onBench} on the bench
          </span>
        </HoverTooltip>
        <HoverTooltip
          label={`${map.counts.reads} relation(s) read and ${map.counts.writes} written across the whole procedure`}
          asChild
        >
          <span className="text-role-micro tabular-nums text-text-faint">
            {map.counts.reads} read · {map.counts.writes} written
          </span>
        </HoverTooltip>
        {map.counts.codeOnly > 0 && (
          <HoverTooltip
            label={`${map.counts.codeOnly} step(s) are hand-coded UI over a hand-coded route. They are declared here and their lineage is guarded, but the station registry does not drive them yet.`}
            asChild
          >
            <span className="ml-auto rounded bg-amber-50 px-1.5 py-0.5 text-role-micro font-semibold tabular-nums text-amber-700">
              {map.counts.composed}/{map.counts.steps} composed
            </span>
          </HoverTooltip>
        )}
      </div>

      <ol className="space-y-2">
        {map.steps.map((step) => (
          <li key={step.key} className="rounded-xl border border-border-soft bg-surface-card p-3 shadow-sm">
            <div className="flex items-baseline gap-2">
              <span className="shrink-0 text-role-micro font-semibold tabular-nums text-text-faint">
                {step.index}
              </span>
              <span className="text-sm font-semibold text-text-default">{step.label}</span>
              {step.phase === 'capture' ? (
                <HoverTooltip label="The operator sees this step on the bench checklist" asChild>
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-role-micro font-semibold text-blue-700">
                    bench
                  </span>
                </HoverTooltip>
              ) : (
                <HoverTooltip
                  label={
                    step.phase === 'intake'
                      ? 'Intake — already done by the time the operator reads the checklist'
                      : 'Commit — driven from the terminal dock, not the checklist'
                  }
                  asChild
                >
                  <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro font-semibold text-text-soft">
                    {step.phase}
                  </span>
                </HoverTooltip>
              )}
              {step.composed ? (
                <HoverTooltip label="Driven by the station registry — composed, not hand-coded" asChild>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-role-micro font-semibold text-emerald-700">
                    composed
                  </span>
                </HoverTooltip>
              ) : (
                <HoverTooltip
                  label="Hand-coded UI over a hand-coded route — declared here so the map stays honest"
                  asChild
                >
                  <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro font-semibold text-text-soft">
                    code
                  </span>
                </HoverTooltip>
              )}
            </div>

            <p className="mt-1 pl-5 text-xs leading-relaxed text-text-soft">{step.summary}</p>

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-5">
              {step.endpoints.map((e) => (
                <span key={`${e.method} ${e.path}`} className="font-mono text-role-micro text-text-faint">
                  {e.method} {e.path}
                </span>
              ))}
              {step.sources.map((s) => (
                <span
                  key={s.id}
                  className="rounded bg-surface-sunken px-1.5 py-0.5 text-role-micro font-medium text-text-soft"
                >
                  {s.label}
                </span>
              ))}
              {step.channels.map((c) => (
                <HoverTooltip key={c} label={`Live updates over ${c}`} asChild>
                  <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-role-micro font-semibold text-blue-700">
                    <icons.Radio className="h-3 w-3" /> {c}
                  </span>
                </HoverTooltip>
              ))}
            </div>

            {(step.reads.length > 0 || step.writes.length > 0) && (
              <div className="mt-2 space-y-1 border-t border-border-hairline pl-5 pt-2">
                <TableRow tone="read" label="reads" refs={step.reads} />
                <TableRow tone="write" label="writes" refs={step.writes} />
              </div>
            )}

            {step.unresolved.length > 0 && (
              <p className="mt-1.5 pl-5 text-role-micro font-semibold text-amber-700">
                unregistered: {step.unresolved.join(', ')}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function TableRow({
  tone,
  label,
  refs,
}: {
  tone: 'read' | 'write';
  label: string;
  refs: ReadonlyArray<{ table: string; via?: string }>;
}) {
  if (refs.length === 0) return null;
  const chip = tone === 'read' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700';
  const pill = `rounded px-1.5 py-0.5 font-mono text-role-micro font-semibold ${chip}`;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-role-micro font-semibold uppercase tracking-wide text-text-faint">
        {tone === 'read' ? '↓' : '↑'} {label}
      </span>
      {refs.map((r) =>
        r.via ? (
          <HoverTooltip key={`${r.table} ${r.via}`} label={`Touched through ${r.via}`} asChild>
            <span className={pill}>{r.table}</span>
          </HoverTooltip>
        ) : (
          <span key={r.table} className={pill}>
            {r.table}
          </span>
        ),
      )}
    </div>
  );
}
