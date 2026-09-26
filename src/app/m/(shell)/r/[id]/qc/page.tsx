'use client';

import { Suspense, useEffect, useState } from 'react';
import { ListChecks } from '@/components/Icons';
import { DetailNav } from '@/components/mobile/detail/DetailParts';
import { useCartonHub } from '@/components/mobile/receiving/useCartonHub';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import type { DetailDoor } from '@/lib/mobile/detail-door';
import { previousMobilePath } from '@/lib/mobile/nav-trail';
import { cartonLineTitle, plural, type CartonHubData, type CartonHubLine } from '@/lib/receiving/carton-hub';
import { QC_SCAN_HREF } from '@/lib/scan/identify-land';

function qcRow(line: CartonHubLine): DetailDoor {
  const units = line.serials?.length ?? 0;
  return {
    id: String(line.id),
    title: cartonLineTitle(line),
    icon: <ListChecks />,
    meta:
      units > 0
        ? [line.sku, `${plural(units, 'unit')} — pick one to check`].filter(Boolean).join(' · ')
        : 'No units received on this line yet',
    // A line with no units has nothing to check — the row stays, honestly inert.
    href: units > 0 ? `/m/qc/line/${line.id}` : null,
  };
}

/**
 * `/m/r/[id]/qc` — where the scan kernel armed for QC lands an `R-` carton
 * label (`qc-carton`), and the hub's Quality control door: pick a line, then
 * one of its units on `/m/qc/line/[id]`, which opens that unit's checklist.
 * Back returns to the armed kernel when that is where the scan came from.
 */
function CartonQcInner() {
  const { id, data, loading, error, reload } = useCartonHub();
  const [backHref, setBackHref] = useState(`/m/r/${id}`);
  useEffect(() => {
    // The nav trail lives in sessionStorage, so read it after hydration.
    if (previousMobilePath() === QC_SCAN_HREF.split('?')[0]) setBackHref(QC_SCAN_HREF);
  }, []);

  return (
    <DetailRecordFrame<CartonHubData>
      record={data}
      state={{ loading, error, onRetry: () => void reload() }}
      bar={{
        title: `R-${id}`,
        mono: true,
        subtitle: 'Quality control',
        backHref,
        meta: (d) => plural(d.lines.reduce((n, line) => n + (line.serials?.length ?? 0), 0), 'unit'),
      }}
    >
      {(d) => (
        <div className="flex-1 divide-y divide-mode-rule">
          {d.lines.length > 0 ? (
            <DetailNav label={`QC lines on R-${id}`} rows={d.lines.map(qcRow)} />
          ) : (
            <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">
              No lines on this carton yet — nothing to check.
            </p>
          )}
        </div>
      )}
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
