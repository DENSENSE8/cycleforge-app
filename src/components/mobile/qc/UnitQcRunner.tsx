'use client';

import { useQueryClient } from '@tanstack/react-query';
import { ScanBarcode } from '@/components/Icons';
import { DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { DetailDock } from '@/design-system/components/DetailDock';
import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import { useMobileUnit } from '@/components/mobile/unit/useMobileUnit';
import { recordedProcedureVersionIds } from '@/lib/qc/bench-client';
import { useQcProcedureVersion } from '@/lib/qc/use-qc-bench';
import { summarizeUnitQc, unitQcEmptyReason, unitQcStamp, unitQcTally, unitQcVerdict } from '@/lib/qc/unit-qc';
import { UnitQcBench } from './UnitQcBench';
import { UnitQcStepRow } from './UnitQcStepRow';
import { unitChecklistErrorText, useUnitChecklist } from './useUnitQc';

const MESSAGE = 'bg-mode-panel px-mode-page py-3 text-mode-body text-mode-muted';
const ERROR = 'bg-rose-50 px-mode-page py-3 text-mode-body font-semibold text-rose-700';

/** The card's verdict chip, in the same semantic tones as the step buttons. */
const VERDICT_CHIP = {
  failed: { label: 'Failed', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  passed: { label: 'Passed', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  open: { label: 'Open', className: 'border-mode-edge bg-mode-well text-mode-ink' },
} as const;

/** The QC runner body for one unit — the compact summary card (the repair hub's; it opens the unit hub for every fact), the bench (session, readings, next steps — the same verbs as the `/test` Units display), then the checklist… */
export function UnitQcRunner({ unitRef, onNext }: { unitRef: string; onNext?: () => void }) {
  const queryClient = useQueryClient();
  const unitQuery = useMobileUnit(unitRef);
  const unit = unitQuery.data?.serial_unit ?? null;
  // Without a catalog row the route returns no steps; skip the round trip.
  const checklist = useUnitChecklist(unit?.sku_catalog_id != null ? unit.id : null);
  const steps = unit?.sku_catalog_id != null ? checklist.data : [];
  const procedureVersion = useQcProcedureVersion(unit?.sku_catalog_id ?? null, recordedProcedureVersionIds(steps ?? []));

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
            <DetailSummaryCard
              href={`/m/u/${encodeURIComponent(unitRef)}`}
              ariaLabel="Unit details"
              title={unit.product_title || 'No product title'}
              lines={[
                { text: summary ? unitQcTally(summary) : '' },
                {
                  text: summary ? (summary.last ? `Last: ${unitQcStamp(summary.last)}` : 'Nothing recorded yet') : '',
                  muted: true,
                },
              ]}
              foot={[`SN ${unit.serial_number}`, unit.sku].filter(Boolean).join(' · ')}
              chip={summary ? VERDICT_CHIP[unitQcVerdict(summary)] : null}
            />

            <UnitQcBench
              unitId={unit.id}
              unitStatus={unit.current_status}
              onVerdictRecorded={() => void queryClient.invalidateQueries({ queryKey: ['serial-unit.mobile', unitRef] })}
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
