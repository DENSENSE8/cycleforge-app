'use client';

import { Suspense } from 'react';
import { DetailFact, DetailFacts } from '@/components/mobile/detail/DetailParts';
import { useCartonHub } from '@/components/mobile/receiving/useCartonHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { conditionGradeTableLabel } from '@/lib/conditions';
import { cartonPoNumbers, cartonStage, formatCartonStamp, type CartonHubData } from '@/lib/receiving/carton-hub';
import { workflowStageLabel } from '@/lib/receiving/workflow-stages';
import { sourcePlatformMeta } from '@/lib/source-platform';

const words = (raw: string | null | undefined) => (raw ? raw.replace(/_/g, ' ') : null);

/** A stamp and who made it, or null for the fact's empty dash. */
function stamped(at: string | null | undefined, by: string | null | undefined): string | null {
  const when = formatCartonStamp(at);
  if (!when) return null;
  return by ? `${when} · ${by}` : when;
}

/**
 * `/m/r/[id]/info` — every fact about the carton, read-only. Receiving writes
 * happen on the hub's dock (Unbox) and per line; there is no carton-field edit
 * on the phone, so this screen carries no pencil.
 */
function CartonInfoInner() {
  const { id, data, loading, error, reload } = useCartonHub();
  return (
    <DetailRecordFrame<CartonHubData>
      record={data}
      state={{ loading, error, onRetry: () => void reload() }}
      bar={{ title: `R-${id}`, mono: true, subtitle: 'Carton details', backHref: `/m/r/${id}` }}
    >
      {(d) => {
        const c = d.receiving;
        const platform = c.source_platform ? sourcePlatformMeta(c.source_platform).label || c.source_platform : null;
        const pos = cartonPoNumbers(d);
        return (
          <div className="flex-1 divide-y divide-mode-rule">
            <DetailFacts>
              <DetailFact label="Carton" value={`R-${c.id}`} mono copy={`R-${c.id}`} />
              <DetailFact label="Stage" value={workflowStageLabel(cartonStage(d.lines))} />
              <DetailFact
                label="Tracking"
                value={c.tracking || null}
                mono
                copy={c.tracking}
                hint={c.carrier ?? undefined}
              />
              <DetailFact label="Platform" value={platform ?? null} />
              <DetailFact
                label={pos.length > 1 ? 'Purchase orders' : 'Purchase order'}
                value={pos.join(', ') || null}
              />
              <DetailFact
                label="Progress"
                value={`${d.totals.received}/${d.totals.expected || '?'} units`}
                hint={`${d.totals.lines_complete}/${d.totals.lines} lines done`}
              />
              <DetailFact label="Created" value={formatCartonStamp(c.created_at) ?? null} />
              <DetailFact label="Unboxed" value={stamped(c.unboxed_at, c.unboxed_by_name)} />
              <DetailFact label="Received" value={stamped(c.received_at, c.received_by_name)} />
              {c.is_return || c.return_platform ? (
                <DetailFact
                  label="Return"
                  value={words(c.return_platform) ?? 'Yes'}
                  hint={c.return_reason ?? undefined}
                />
              ) : null}
              {c.target_channel ? <DetailFact label="Target channel" value={c.target_channel} /> : null}
              {c.qa_status && c.qa_status !== 'PENDING' ? (
                <DetailFact
                  label="QA"
                  value={words(c.qa_status)}
                  hint={c.condition_grade ? conditionGradeTableLabel(c.condition_grade) : undefined}
                />
              ) : null}
            </DetailFacts>
          </div>
        );
      }}
    </DetailRecordFrame>
  );
}

export default function CartonInfoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <CartonInfoInner />
    </Suspense>
  );
}
