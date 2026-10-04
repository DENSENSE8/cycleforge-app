'use client';

import { Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { QcLinePicker } from '@/components/mobile/qc/QcLinePicker';
import { QC_SCAN_HREF } from '@/lib/scan/identify-land';

/**
 * `/m/qc/line/[id]` — where the scan kernel armed for QC lands an `L-` line
 * label: QC is per unit, so the tech picks one of the line's units and lands
 * on its checklist.
 */
function QcLineInner() {
  const params = useParams<{ id: string }>();
  const lineId = Number(params?.id);
  const router = useRouter();

  return (
    <div className="flex min-h-screen flex-col bg-mode-panel">
      <MobileV2DetailTopBar backHref={QC_SCAN_HREF} subtitle="Quality control" title={`L-${lineId}`} mono />
      <QcLinePicker
        lineId={lineId}
        onPick={(unitRef) => router.push(`/m/u/${encodeURIComponent(unitRef)}/qc`)}
        onBack={() => router.push(QC_SCAN_HREF)}
      />
    </div>
  );
}

export default function QcLinePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <QcLineInner />
    </Suspense>
  );
}
