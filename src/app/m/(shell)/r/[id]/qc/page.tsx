'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ListChecks } from '@/components/Icons';
import { DetailNav } from '@/components/mobile/detail/DetailParts';
import { QcUnitRecord } from '@/components/mobile/qc/QcUnitRecord';
import { useCartonHub } from '@/components/mobile/receiving/useCartonHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import type { DetailDoor } from '@/lib/mobile/detail-door';
import { previousMobilePath, withJobReturn } from '@/lib/mobile/nav-trail';
import { cartonLineTitle, plural, type CartonHubData } from '@/lib/receiving/carton-hub';
import { qcUnitStage } from '@/lib/qc/unit-qc-stage';
import { QC_SCAN_HREF } from '@/lib/scan/identify-land';

/** Lines with nothing to check yet — the rows stay, honestly inert. */
function emptyLineRows(d: CartonHubData): DetailDoor[] {
  return d.lines
    .filter((line) => (line.serials?.length ?? 0) === 0)
    .map((line) => ({
      id: `line-${line.id}`,
      title: cartonLineTitle(line),
      icon: <ListChecks />,
      meta: [line.sku, 'No units received on this line yet'].filter(Boolean).join(' · '),
      href: null,
    }));
}

function onlyUnitId(d: CartonHubData): number | null {
  const units = d.lines.flatMap((line) => line.serials ?? []);
  return units.length === 1 ? units[0].id : null;
}

/**
 * `/m/r/[id]/qc` — where the unbox carton label lands: the sticker's camera
 * link (`/m/r/{id}/qc`) and the scan button (dispatch row `qc-carton`) both
 * open it. A one-unit carton goes straight to that unit's checklist.
 */
function CartonQcInner() {
  const router = useRouter();
  const { id, data, loading, error, reload } = useCartonHub();
  const [backHref, setBackHref] = useState(`/m/r/${id}`);
  useEffect(() => {
    // The nav trail lives in sessionStorage, so read it after hydration.
    if (previousMobilePath() === QC_SCAN_HREF.split('?')[0]) setBackHref(QC_SCAN_HREF);
  }, []);

  const single = data ? onlyUnitId(data) : null;
  useEffect(() => {
    // Replace, not push: back from the unit must not bounce through this hop again.
    if (single != null) router.replace(withJobReturn(`/m/u/${single}/qc`, `/m/r/${id}`));
  }, [single, id, router]);

  return (
    <DetailRecordFrame<CartonHubData>
      record={data}
      state={{ loading: loading || single != null, error, onRetry: () => void reload() }}
      bar={{
        title: `R-${id}`,
        mono: true,
        subtitle: 'Quality control',
        backHref,
        meta: (d) => plural(d.lines.reduce((n, line) => n + (line.serials?.length ?? 0), 0), 'unit'),
      }}
    >
      {(d) => {
        const back = `/m/r/${id}/qc`;
        const units = d.lines.flatMap((line) => (line.serials ?? []).map((unit) => ({ line, unit })));
        const empty = emptyLineRows(d);
        return (
          <div className="flex-1">
            {units.length > 0 ? (
              <nav aria-label={`Units to check on R-${id}`} className="divide-y divide-mode-rule bg-mode-panel">
                {units.map(({ line, unit }) => (
                  <QcUnitRecord
                    key={unit.id}
                    href={withJobReturn(`/m/u/${unit.id}/qc`, back)}
                    unit={{
                      stage: qcUnitStage(unit.current_status),
                      title: cartonLineTitle(line),
                      serialNumber: unit.serial_number,
                      sku: line.sku,
                      // The carton read carries no per-unit grade; the line's would mislabel a regraded unit.
                      conditionGrade: null,
                      cartonId: d.receiving.id,
                      lineId: line.id,
                    }}
                  />
                ))}
              </nav>
            ) : null}
            {empty.length > 0 ? <DetailNav label={`Lines with nothing to check on R-${id}`} rows={empty} /> : null}
            {units.length + empty.length === 0 ? (
              <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">
                No lines on this carton yet — nothing to check.
              </p>
            ) : null}
          </div>
        );
      }}
    </DetailRecordFrame>
  );
}

export default function CartonQcPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <CartonQcInner />
    </Suspense>
  );
}
