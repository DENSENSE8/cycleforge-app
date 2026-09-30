'use client';

import { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { UnitQcRunner } from '@/components/mobile/qc/UnitQcRunner';
import { useSerialUnit } from '@/lib/serial/use-serial-unit';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';
import { QC_SCAN_HREF } from '@/lib/scan/identify-land';

/** `/m/u/[id]/qc` — the unit's QC: verdict, bench and checklist. `?back=` is the job it came from (the carton label's QC). */
function UnitQcInner() {
  const params = useParams<{ id: string }>();
  const rawParam = String(params?.id ?? '');
  const router = useRouter();
  const back = mobileJobReturn(useSearchParams().get('back'));
  const { data } = useSerialUnit(rawParam);

  return (
    <div className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        backHref={back ?? `/m/u/${rawParam}`}
        subtitle="Quality control"
        title={data?.serial_unit.serial_number ?? rawParam}
        mono
      />
      <UnitQcRunner unitRef={rawParam} onNext={() => router.push(QC_SCAN_HREF)} />
    </div>
  );
}

export default function UnitQcPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <UnitQcInner />
    </Suspense>
  );
}
