'use client';

import { Suspense } from 'react';
import { PackageCheck } from '@/components/Icons';
import { DetailNav } from '@/components/mobile/detail/DetailParts';
import { useCartonHub } from '@/components/mobile/receiving/useCartonHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { conditionGradeTableLabel } from '@/lib/conditions';
import type { DetailDoor } from '@/lib/mobile/detail-door';
import { cartonLineTitle, plural, type CartonHubData, type CartonHubLine } from '@/lib/receiving/carton-hub';
import { workflowStageLabel } from '@/lib/receiving/workflow-stages';

function lineRow(line: CartonHubLine): DetailDoor {
  const serials = line.serials?.length ?? 0;
  const facts = [
    line.sku,
    `${line.quantity_received}/${line.quantity_expected ?? '?'} received`,
    workflowStageLabel(line.workflow_status),
    line.condition_grade ? conditionGradeTableLabel(line.condition_grade) : null,
    serials > 0 ? plural(serials, 'serial') : null,
  ];
  return {
    id: String(line.id),
    title: cartonLineTitle(line),
    icon: <PackageCheck />,
    meta: facts.filter(Boolean).join(' · '),
    href: `/m/l/${line.id}`,
  };
}

/** `/m/r/[id]/lines` — the carton's lines; each opens its `L-` record. */
function CartonLinesInner() {
  const { id, data, loading, error, reload } = useCartonHub();
  return (
    <DetailRecordFrame<CartonHubData>
      record={data}
      state={{ loading, error, onRetry: () => void reload() }}
      bar={{
        title: `R-${id}`,
        mono: true,
        subtitle: 'Lines',
        backHref: `/m/r/${id}`,
        meta: (d) => plural(d.lines.length, 'line'),
      }}
    >
      {(d) => (
        <div className="flex-1 space-y-4 px-mode-page py-mode-page">
          {d.lines.length > 0 ? (
            <DetailNav label={`Lines on R-${id}`} rows={d.lines.map(lineRow)} />
          ) : (
            <p className="py-10 text-center text-sm font-semibold text-text-soft">No lines on this carton yet.</p>
          )}
        </div>
      )}
    </DetailRecordFrame>
  );
}

export default function CartonLinesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <CartonLinesInner />
    </Suspense>
  );
}
