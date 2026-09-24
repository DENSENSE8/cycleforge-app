'use client';

import { Suspense } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { UnitQcRunner } from '@/components/mobile/qc/UnitQcRunner';
import { useMobileUnit } from '@/components/mobile/unit/useMobileUnit';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { QC_SCAN_HREF } from '@/lib/scan/identify-land';

/**
 * `/m/u/[id]/qc` — the unit's QC checklist. Reached from the unit hub's
 * "Quality control" door, or straight from the scan kernel armed for QC;
 * "Next unit" returns to that armed kernel (continuous QC). The runner owns
 * the body; this page adds identity.
 */
function UnitQcInner() {
  const params = useParams<{ id: string }>();
  const rawParam = String(params?.id ?? '');
  const router = useRouter();
  const { data } = useMobileUnit(rawParam);

  return (
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        backHref={`/m/u/${rawParam}`}
        subtitle="Quality control"
        title={data?.serial_unit.serial_number ?? rawParam}
        mono
      />
      <UnitQcRunner unitRef={rawParam} onNext={() => router.push(QC_SCAN_HREF)} />
    </ModeRegion>
  );
}

export default function UnitQcPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <UnitQcInner />
    </Suspense>
  );
}
