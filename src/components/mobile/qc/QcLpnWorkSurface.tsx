'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Package, ScanBarcode } from '@/components/Icons';
import { HandlingUnitMemberRow } from '@/components/mobile/handling-units/HandlingUnitMemberRow';
import { useHandlingUnit } from '@/components/mobile/handling-units/useHandlingUnit';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { Button } from '@/design-system/primitives';
import { handlingUnitQcFace } from '@/lib/handling-unit-presentation';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { qcUnitStage } from '@/lib/qc/unit-qc-stage';
import { QC_SCAN_HREF } from '@/lib/scan/identify-land';
import { cn } from '@/utils/_cn';

type Filter = 'todo' | 'all' | 'hold' | 'done';

export function QcLpnWorkSurface({ lpnRef }: { lpnRef: string }) {
  const router = useRouter();
  const query = useHandlingUnit(lpnRef);
  const [filter, setFilter] = useState<Filter>('todo');
  const box = query.data?.handling_unit ?? null;
  const units = useMemo(() => {
    const all = box?.units ?? [];
    return all.filter((unit) => {
      const stage = qcUnitStage(unit.current_status);
      if (filter === 'all') return true;
      if (filter === 'hold') return stage === 'failed' || stage === 'ticket';
      if (filter === 'done') return stage === 'passed' || stage === 'labeled' || stage === 'putAway' || stage === 'past';
      return stage === 'received' || stage === 'graded' || stage === 'testing';
    });
  }, [box?.units, filter]);

  if (query.isPending) return <div className="min-h-full bg-mode-panel px-6 py-16 text-center text-sm text-text-soft">Loading LPN…</div>;
  if (query.error || !box) return <div role="alert" className="min-h-full bg-mode-panel px-6 py-16 text-center text-sm font-semibold text-text-danger">{query.error?.message || 'LPN not found'}</div>;

  const holdUnits = box.units.filter((unit) => ['failed', 'ticket'].includes(qcUnitStage(unit.current_status))).length;
  const face = handlingUnitQcFace({ totalUnits: box.rollup.total, testedUnits: box.rollup.tested, holdUnits });
  const back = `/m/qc/lpn/${encodeURIComponent(lpnRef)}`;
  const scanIntoLpn = `${QC_SCAN_HREF}&lpn=${encodeURIComponent(String(box.id))}`;

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="qc-lpn-work-surface">
      <MobileDetailTopBar
        backHref="/m/qc"
        title={box.code}
        subtitle="Quality control"
        meta={`${face.label} · ${box.location_name || 'Not parked'}`}
        mono
        lead={<Package className="h-5 w-5 text-blue-600" />}
        scanHref={scanIntoLpn}
      />
      <nav className="sticky top-14 z-sticky flex gap-2 overflow-x-auto border-b border-mode-rule bg-mode-panel/95 px-mode-page py-2 backdrop-blur" aria-label="LPN QC filters">
        {([
          ['todo', `To check ${box.rollup.untested}`],
          ['all', `All ${box.rollup.total}`],
          ['hold', `Hold ${holdUnits}`],
          ['done', `Done ${Math.max(0, box.rollup.tested - holdUnits)}`],
        ] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={cn('h-9 shrink-0 rounded-full border px-3 text-xs font-semibold', filter === id ? 'border-blue-600 bg-blue-600 text-white' : 'border-mode-rule bg-mode-panel text-mode-ink')}>
            {label}
          </button>
        ))}
      </nav>
      {holdUnits > 0 ? <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 px-mode-page py-2 text-xs font-semibold text-rose-700"><AlertTriangle className="h-4 w-4" />Resolve holds before prepack</div> : null}
      <div className="flex-1">
        {units.map((unit) => (
          <HandlingUnitMemberRow
            key={unit.id}
            unit={unit}
            onOpen={() => router.push(withJobReturn(`/m/u/${unit.id}/qc`, back))}
          />
        ))}
        {units.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-semibold text-text-default">{box.units.length === 0 ? 'This LPN is empty' : 'Nothing in this filter'}</p>
            <Button href={scanIntoLpn} variant="secondary" size="lg" radius="surface" icon={<ScanBarcode />} className="mt-4">Scan unit into this LPN</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
