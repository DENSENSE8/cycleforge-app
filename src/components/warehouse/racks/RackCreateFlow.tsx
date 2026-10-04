'use client';

/**
 * New rack on the desk — the phone's four steps (Place → Shelves → Review →
 * Print) in a phone-width centre column (SURFACE_LAW §4 frame law), driven by
 * the shared step model (`rack-create-model.ts`). Review is the server's
 * `dryRun` plan; Create commits it under the same client event id; Print runs
 * the placard and every shelf through `useLocationLabelPrint`.
 */

import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Minus, Plus } from '@/components/Icons';
import { MobileStepProgress } from '@/design-system/components/MobileStepProgress';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { EVIDENCE_CONTROL_CLASS, EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button, DeferredQtyInput, IconButton } from '@/design-system/primitives';
import {
  RACK_CREATE_STEPS,
  RACK_CREATE_STEP_LABELS,
  blockedReason,
  initialRackCreateState,
  toCreateRackBody,
  withShelfCount,
  withShelfTier,
  type RackCreateState,
  type RackCreateStep,
} from '@/lib/locations/rack-create-model';
import { rackErrorMessage, rackPlacementText, rackShelfCountText } from '@/lib/locations/rack-display';
import { RACK_MAX_SHELVES, type PlannedRack, type RackDetail } from '@/lib/locations/rack-types';
import { createRack, rackQueryKey } from '@/lib/locations/racks-client';
import { ARRIVAL_TIERS, arrivalTierLabel, asArrivalTier } from '@/lib/receiving/arrival-tier';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { cn } from '@/utils/_cn';
import { RackPlacementField } from './RackPlacementField';
import { RackPrintPanel } from './RackPrintPanel';
import { RACK_FLOW_COLUMN_CLASS, RACK_RECORD_ROOT_CLASS } from './RackRecord';

const STEPS = RACK_CREATE_STEPS.map((id) => ({ id, label: RACK_CREATE_STEP_LABELS[id] }));

export function RackCreateFlow({
  onCreated,
  onOpenRack,
}: {
  /** The rack exists — the host refreshes its list. */
  onCreated: (rack: RackDetail) => void;
  /** Done printing — open the new rack's record. */
  onOpenRack: (code: string) => void;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<RackCreateState>(() => initialRackCreateState(safeRandomUUID()));
  const [step, setStep] = useState<RackCreateStep>('place');
  const [plan, setPlan] = useState<PlannedRack | null>(null);
  const [created, setCreated] = useState<RackDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = blockedReason(state, step);
  const stepIndex = RACK_CREATE_STEPS.indexOf(step);

  const goTo = (next: RackCreateStep) => {
    setError(null);
    setStep(next);
  };

  const review = async (from: RackCreateState = state) => {
    if (blockedReason(from, 'review')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createRack(toCreateRackBody(from, true));
      if (res.dryRun) {
        setPlan(res.planned);
        setStep('review');
      }
    } catch (err) {
      setError(rackErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await createRack(toCreateRackBody(state, false));
      if (!res.dryRun) {
        queryClient.setQueryData(rackQueryKey(res.rack.code), { rack: res.rack });
        setCreated(res.rack);
        setStep('print');
        onCreated(res.rack);
      }
    } catch (err) {
      setError(rackErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  let body: ReactNode;
  let primary: ReactNode;
  if (step === 'place') {
    body = (
      <RecordGroup title="Where does the rack stand?">
        <div className="px-4 pb-3">
          <RackPlacementField
            value={state.placement}
            onChange={(placement) => setState((s) => ({ ...s, placement }))}
            onSubmit={(placement) => {
              setState((s) => ({ ...s, placement }));
              goTo('shelves');
            }}
            testId="rack-create-place"
          />
        </div>
      </RecordGroup>
    );
    primary = (
      <Button variant="primary" icon={<ArrowRight aria-hidden />} disabled={Boolean(blocked)} onClick={() => goTo('shelves')} data-testid="rack-create-next">
        {blocked ?? `Next · ${state.placement?.name ?? ''}`}
      </Button>
    );
  } else if (step === 'shelves') {
    body = (
      <>
        <RecordGroup title="How many shelves?">
          <div className="flex items-center gap-3 px-4 pb-3">
            <IconButton
              icon={<Minus aria-hidden />}
              ariaLabel="One shelf fewer"
              size="md"
              radius="control"
              disabled={state.shelves <= 1}
              onClick={() => setState((s) => withShelfCount(s, s.shelves - 1))}
            />
            <DeferredQtyInput
              value={state.shelves}
              min={1}
              max={RACK_MAX_SHELVES}
              onChange={(n) => setState((s) => withShelfCount(s, n))}
              aria-label="Shelves"
              className={cn(EVIDENCE_CONTROL_CLASS, 'w-20 text-center tabular-nums')}
            />
            <IconButton
              icon={<Plus aria-hidden />}
              ariaLabel="One shelf more"
              size="md"
              radius="control"
              disabled={state.shelves >= RACK_MAX_SHELVES}
              onClick={() => setState((s) => withShelfCount(s, s.shelves + 1))}
            />
          </div>
        </RecordGroup>
        <RecordGroup title="Arrival shelves (optional)">
          <ul className="flex flex-col px-4 pb-1">
            {Array.from({ length: state.shelves }, (_, i) => i + 1).map((shelf) => (
              <li key={shelf} className="flex items-center gap-3 border-b border-mode-fact py-1.5 last:border-b-0">
                <span className="w-20 shrink-0 text-role-data font-semibold text-mode-ink">Shelf {shelf}</span>
                <select
                  value={state.tiers[shelf] != null ? String(state.tiers[shelf]) : ''}
                  onChange={(event) => setState((s) => withShelfTier(s, shelf, asArrivalTier(event.target.value)))}
                  aria-label={`Arrival urgency of shelf ${shelf}`}
                  className={cn(EVIDENCE_CONTROL_CLASS, 'min-w-0 flex-1')}
                >
                  <option value="">Not an arrival shelf</option>
                  {ARRIVAL_TIERS.map((tier) => (
                    <option key={tier} value={String(tier)}>
                      Arrival · {arrivalTierLabel(tier)}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </RecordGroup>
      </>
    );
    primary = (
      <Button variant="primary" icon={<ArrowRight aria-hidden />} loading={busy} disabled={Boolean(blocked)} onClick={() => void review()} data-testid="rack-create-review">
        {blocked ?? 'Review'}
      </Button>
    );
  } else if (step === 'review') {
    body = plan ? (
      <>
        <RecordGroup title={`${plan.name} · ${plan.code}`} testId="rack-create-plan">
          <div className="flex flex-col px-4 pb-1 [&>*:last-child]:border-b-0">
            <EvidenceFactRow label="Stands at">{rackPlacementText(plan)}</EvidenceFactRow>
            <EvidenceFactRow label="Shelves">{rackShelfCountText(plan.shelves.length)}</EvidenceFactRow>
          </div>
        </RecordGroup>
        <RecordGroup title="Labels it will print">
          <ul className="flex flex-col px-4 pb-1">
            <li className="flex flex-wrap items-baseline gap-x-2 border-b border-mode-fact py-2">
              <span className="text-role-data font-semibold text-mode-ink">Rack placard</span>
              <span className="font-mono text-role-data text-mode-muted">{plan.code}</span>
            </li>
            {plan.shelves.map((shelf) => (
              <li key={shelf.code} className="flex flex-wrap items-baseline gap-x-2 border-b border-mode-fact py-2 last:border-b-0">
                <span className="text-role-data font-semibold text-mode-ink">Shelf {shelf.shelf}</span>
                <span className="font-mono text-role-data text-mode-muted">{shelf.code}</span>
                {shelf.tier != null ? <span className="text-role-data text-text-info">Arrival · {arrivalTierLabel(shelf.tier)}</span> : null}
              </li>
            ))}
          </ul>
        </RecordGroup>
      </>
    ) : null;
    primary = (
      <Button variant="primary" loading={busy} disabled={!plan} onClick={() => void create()} data-testid="rack-create-commit">
        {plan ? `Create ${plan.name}` : 'Review the plan first'}
      </Button>
    );
  } else {
    body = created ? <RackPrintPanel rack={created} testId="rack-create-print" /> : null;
    primary = created ? (
      <Button variant="secondary" onClick={() => onOpenRack(created.code)} data-testid="rack-create-open">
        Open {created.name}
      </Button>
    ) : null;
  }

  return (
    <div className={RACK_RECORD_ROOT_CLASS} data-testid="rack-create">
      <div className={RACK_FLOW_COLUMN_CLASS}>
        <MobileStepProgress
          steps={STEPS}
          currentIndex={stepIndex}
          // Back to a finished step until the rack exists; after Create the plan is spent.
          onStepPress={created ? undefined : (index) => goTo(RACK_CREATE_STEPS[index]!)}
          testId="rack-create-steps"
        />
        {body}
        {error ? <EvidenceNotice tone="warn">{error}</EvidenceNotice> : null}
        {primary}
      </div>
    </div>
  );
}
