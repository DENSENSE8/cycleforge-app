'use client';

import { DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { DetailSummaryCard } from '@/design-system/components/DetailSummaryCard';
import { useMobileUnit } from '@/components/mobile/unit/useMobileUnit';
import { Button, Panel } from '@/design-system/primitives';
import { summarizeUnitQc, unitQcEmptyReason, unitQcStamp, unitQcTally, unitQcVerdict } from '@/lib/qc/unit-qc';
import { UnitQcStepRow } from './UnitQcStepRow';
import { unitChecklistErrorText, useUnitChecklist } from './useUnitQc';

const MESSAGE = 'rounded-mode border border-mode-edge bg-mode-panel p-mode-page text-mode-body text-mode-muted';
const ERROR = 'rounded-mode border border-rose-200 bg-rose-50 p-mode-page text-mode-body font-semibold text-rose-700';

/** The card's verdict chip, in the same semantic tones as the step buttons. */
const VERDICT_CHIP = {
  failed: { label: 'Failed', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  passed: { label: 'Passed', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  open: { label: 'Open', className: 'border-mode-edge bg-mode-well text-mode-ink' },
} as const;

/**
 * The QC runner body for one unit — the compact summary card (the repair
 * hub's; it opens the unit hub for every fact), then the checklist with one
 * Fail · Add note · Pass row per step. Hosts own the `ModeRegion` and top bar
 * and mount this as a direct child of their flex column: it renders the padded
 * body and, with `onNext` (continuous QC), a sticky "Next unit" dock after it.
 *
 * `unitRef` is whatever the label carried (id, serial or unit_uid); writes key
 * on the resolved numeric id. Everything shown about a result — verdict, who,
 * when — is the server's re-read, never the phone clock.
 */
export function UnitQcRunner({ unitRef, onNext }: { unitRef: string; onNext?: () => void }) {
  const unitQuery = useMobileUnit(unitRef);
  const unit = unitQuery.data?.serial_unit ?? null;
  // Without a catalog row the route returns no steps; skip the round trip.
  const checklist = useUnitChecklist(unit?.sku_catalog_id != null ? unit.id : null);
  const steps = unit?.sku_catalog_id != null ? checklist.data : [];

  const emptyReason = unit && steps ? unitQcEmptyReason(unit, steps) : null;
  const summary = steps && steps.length > 0 ? summarizeUnitQc(steps) : null;

  return (
    <>
      <div className="flex-1 space-y-4 px-mode-page py-mode-page">
        {unitQuery.isPending ? (
          <p className="py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>
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

            <section aria-labelledby="qc-steps" className="space-y-2">
              <DetailSectionHeading id="qc-steps">Checklist</DetailSectionHeading>
              {checklist.error ? (
                <div role="alert" className={ERROR}>
                  {unitChecklistErrorText(checklist.error)}
                </div>
              ) : emptyReason ? (
                <p className={MESSAGE}>{emptyReason}</p>
              ) : steps ? (
                <Panel radius="none" padding="none" elevation="none" className="rounded-mode">
                  <ul>
                    {steps.map((step) => (
                      <UnitQcStepRow key={`${unit.id}:${step.step_id}:${step.verified_at ?? ''}`} unitId={unit.id} step={step} />
                    ))}
                  </ul>
                </Panel>
              ) : (
                <p className={MESSAGE}>Loading checklist…</p>
              )}
            </section>
          </>
        ) : null}
      </div>

      {onNext ? (
        // Sticky at the end of the host's flex column, like the repair dock:
        // it keeps its own box in flow, so the last step is never hidden under it.
        <div className="sticky bottom-0 z-sticky border-t border-mode-rule bg-mode-bar px-mode-page pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          <Button variant="primary" size="lg" radius="mode" className="w-full" onClick={onNext}>
            Next unit
          </Button>
        </div>
      ) : null}
    </>
  );
}
