'use client';

import { Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { QcLinePicker } from '@/components/mobile/qc/QcLinePicker';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
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
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar backHref={QC_SCAN_HREF} subtitle="Quality control" title={`L-${lineId}`} mono />
      <QcLinePicker
        lineId={lineId}
        onPick={(unitRef) => router.push(`/m/u/${encodeURIComponent(unitRef)}/qc`)}
        onBack={() => router.push(QC_SCAN_HREF)}
      />
    </ModeRegion>
  );
}

export default function QcLinePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <QcLineInner />
    </Suspense>
  );
}
