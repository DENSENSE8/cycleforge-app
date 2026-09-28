'use client';

import type { ReactNode } from 'react';
import { useQcBench, useQcTriage } from '@/lib/qc/use-qc-bench';
import { QcNextSteps } from './QcNextSteps';
import { QcReadingsPanel } from './QcReadingsPanel';
import { QcSessionBar } from './QcSessionBar';

/**
 * The QC bench for one unit on the desk: session bar, live readings, next steps. Mounted under the
 * unit's verdict row; `verdictActions` are that row's existing verdict controls, re-offered on a
 * RETEST step.
 */
export function QcUnitBench({
  unitId,
  unitStatus,
  verdictActions,
}: {
  unitId: number;
  unitStatus: string | null | undefined;
  verdictActions?: ReactNode;
}) {
  const bench = useQcBench(unitId);
  const triage = useQcTriage(unitId, bench.open?.id ?? null);

  return (
    <div className="flex flex-col" data-testid="qc-unit-bench" data-unit-id={unitId}>
      <QcSessionBar bench={bench} unitStatus={unitStatus} />
      <QcReadingsPanel bench={bench} />
      <QcNextSteps triage={triage} retestActions={verdictActions} />
    </div>
  );
}
