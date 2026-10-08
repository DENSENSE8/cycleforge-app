'use client';

import { useQcBench, useQcTriage } from '@/lib/qc/use-qc-bench';
import { QcNextSteps } from './QcNextSteps';
import { QcReadingsPanel } from './QcReadingsPanel';
import { QcSessionBar } from './QcSessionBar';

/**
 * The QC bench for one unit on the desk: session bar, live readings, next steps. Mounted under the
 * unit on its QC record; the verdicts are the record's Actions panel verbs.
 */
export function QcUnitBench({ unitId, unitStatus }: { unitId: number; unitStatus: string | null | undefined }) {
  const bench = useQcBench(unitId);
  const triage = useQcTriage(unitId, bench.open?.id ?? null);

  return (
    <div className="flex flex-col" data-testid="qc-unit-bench" data-unit-id={unitId}>
      <QcSessionBar bench={bench} unitStatus={unitStatus} />
      <QcReadingsPanel bench={bench} />
      <QcNextSteps triage={triage} />
    </div>
  );
}
