'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ScanBarcode } from '@/components/Icons';
import { DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { DetailDock } from '@/design-system/components/DetailDock';
import { serialUnitQueryKey, useSerialUnit } from '@/lib/serial/use-serial-unit';
import { recordedProcedureVersionIds } from '@/lib/qc/bench-client';
import { useQcProcedureVersion } from '@/lib/qc/use-qc-bench';
import { summarizeUnitQc, unitQcEmptyReason, unitQcStamp, unitQcTally } from '@/lib/qc/unit-qc';
import { QC_QUEUE_QUERY_KEY } from '@/lib/qc/queue-client';
import { qcUnitRecordState } from '@/lib/qc/qc-unit-record-model';
import { unitChecklistErrorText, useUnitChecklist } from '@/lib/qc/use-unit-checklist';
import { UnitQcBench } from './UnitQcBench';
import { UnitQcVerdict } from './UnitQcVerdict';
import { QcUnitRecord } from './QcUnitRecord';
import { UnitQcStepRow } from './UnitQcStepRow';

const MESSAGE = 'bg-mode-panel px-mode-page py-3 text-mode-body text-mode-muted';
const ERROR = 'bg-rose-50 px-mode-page py-3 text-mode-body font-semibold text-rose-700';

/** The QC runner body for one unit — the F-pattern unit record (state code first; it opens the unit hub for every fact), the verdict, the bench (session, readings, next steps — the same verbs as the `/test` Units display), then the checklist… */
export function UnitQcRunner({ unitRef, onNext }: { unitRef: string; onNext?: () => void }) {
  const queryClient = useQueryClient();
  const unitQuery = useSerialUnit(unitRef);
  const unit = unitQuery.data?.serial_unit ?? null;
  // Without a catalog row the route returns no steps; skip the round trip.
  const checklist = useUnitChecklist(unit?.sku_catalog_id != null ? unit.id : null);
  const steps = unit?.sku_catalog_id != null ? checklist.data : [];
  const procedureVersion = useQcProcedureVersion(unit?.sku_catalog_id ?? null, recordedProcedureVersionIds(steps ?? []));

  // A verdict moves the unit: its own read, and the QC queue it leaves (or re-tiers on Test again).
  const onVerdictRecorded = () => {
    void queryClient.invalidateQueries({ queryKey: serialUnitQueryKey(unitRef) });
    void queryClient.invalidateQueries({ queryKey: QC_QUEUE_QUERY_KEY });
  };
  const emptyReason = unit && steps ? unitQcEmptyReason(unit, steps) : null;
  const summary = steps && steps.length > 0 ? summarizeUnitQc(steps) : null;

  return (
    <>
      <div className="flex-1 divide-y divide-mode-rule">
        {unitQuery.isPending ? (
          <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>
        ) : null}
        {unitQuery.error ? (
          <div role="alert" className={ERROR}>
            {unitQuery.error.message} — <span className="font-mono">{unitRef}</span>
          </div>
        ) : null}

        {unit ? (
          <>
            <QcUnitRecord
              href={`/m/u/${encodeURIComponent(unitRef)}`}
              unit={{
                stage: qcUnitRecordState(unit).stage,
                title: unit.product_title,
                serialNumber: unit.serial_number,
                sku: unit.sku,
                conditionGrade: unit.condition_grade,
                cartonId: unit.current_receiving_id,
                lineId: unit.current_receiving_line_id,
              }}
            />

            <UnitQcVerdict
              unit={unit}
              steps={steps ?? []}
              onRecorded={onVerdictRecorded}
            />
            <UnitQcBench
              unitId={unit.id}
              unitStatus={unit.current_status}
              onVerdictRecorded={onVerdictRecorded}
            />

            <section aria-labelledby="qc-steps" className="divide-y divide-mode-rule">
              <DetailSectionHeading id="qc-steps">
                Checklist
                {procedureVersion ? (
                  <span className="ml-auto" data-testid="qc-procedure-version">
                    {procedureVersion}
                  </span>
                ) : null}
              </DetailSectionHeading>
              {summary ? (
                <p className={MESSAGE} data-testid="qc-checklist-tally">
                  {unitQcTally(summary)} · {summary.last ? `Last: ${unitQcStamp(summary.last)}` : 'Nothing recorded yet'}
                </p>
              ) : null}
              {checklist.error ? (
                <div role="alert" className={ERROR}>
                  {unitChecklistErrorText(checklist.error)}
                </div>
              ) : emptyReason ? (
                <p className={MESSAGE}>{emptyReason}</p>
              ) : steps ? (
                <ul className="bg-mode-panel">
                  {steps.map((step) => (
                    <UnitQcStepRow key={`${unit.id}:${step.step_id}:${step.verified_at ?? ''}`} unitId={unit.id} step={step} />
                  ))}
                </ul>
              ) : (
                <p className={MESSAGE}>Loading checklist…</p>
              )}
            </section>
          </>
        ) : null}
      </div>

      {onNext ? (
        <DetailDock
          label="Quality control actions"
          verbs={[{ id: 'next', label: 'Next unit', icon: <ScanBarcode />, primary: true }]}
          onVerb={() => onNext()}
        />
      ) : null}
    </>
  );
}
