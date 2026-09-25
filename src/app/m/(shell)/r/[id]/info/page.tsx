'use client';

import { Suspense } from 'react';
import { DetailFactRow } from '@/components/mobile/detail/DetailParts';
import { useCartonHub } from '@/components/mobile/receiving/useCartonHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { Panel } from '@/design-system/primitives';
import { conditionGradeTableLabel } from '@/lib/conditions';
import { cartonPoNumbers, cartonStage, formatCartonStamp, type CartonHubData } from '@/lib/receiving/carton-hub';
import { workflowStageLabel } from '@/lib/receiving/workflow-stages';
import { sourcePlatformMeta } from '@/lib/source-platform';

const words = (raw: string | null | undefined) => (raw ? raw.replace(/_/g, ' ') : null);

/** A stamp and who made it, or an honest dash. */
function stamped(at: string | null | undefined, by: string | null | undefined): string {
  const when = formatCartonStamp(at);
  if (!when) return '—';
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
          <div className="flex-1 space-y-4 px-mode-page py-mode-page">
            <Panel radius="none" padding="none" elevation="none" className="rounded-mode">
              <DetailFactRow label="Carton" value={<span className="font-mono">R-{c.id}</span>} />
              <DetailFactRow label="Stage" value={workflowStageLabel(cartonStage(d.lines))} />
              <DetailFactRow
                label="Tracking"
                value={c.tracking ? <span className="font-mono">{c.tracking}</span> : '—'}
                hint={c.carrier ?? undefined}
              />
              <DetailFactRow label="Platform" value={platform ?? '—'} />
              <DetailFactRow label={pos.length > 1 ? 'Purchase orders' : 'Purchase order'} value={pos.join(', ') || '—'} />
              <DetailFactRow
                label="Progress"
                value={`${d.totals.received}/${d.totals.expected || '?'} units`}
                hint={`${d.totals.lines_complete}/${d.totals.lines} lines done`}
              />
              <DetailFactRow label="Unboxed" value={stamped(c.unboxed_at, c.unboxed_by_name)} />
              <DetailFactRow label="Received" value={stamped(c.received_at, c.received_by_name)} />
              {c.is_return || c.return_platform ? (
                <DetailFactRow
                  label="Return"
                  value={words(c.return_platform) ?? 'Yes'}
                  hint={c.return_reason ?? undefined}
                />
              ) : null}
              {c.target_channel ? <DetailFactRow label="Target channel" value={c.target_channel} /> : null}
              {c.qa_status && c.qa_status !== 'PENDING' ? (
                <DetailFactRow
                  label="QA"
                  value={words(c.qa_status)}
                  hint={c.condition_grade ? conditionGradeTableLabel(c.condition_grade) : undefined}
                />
              ) : null}
              <DetailFactRow label="Created" value={formatCartonStamp(c.created_at) ?? '—'} />
            </Panel>
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
