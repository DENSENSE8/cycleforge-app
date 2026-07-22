'use client';

/**
 * Arrival door journey for the **Arrival receiving-details** Progress tab.
 *
 * Door → Classified → Staged → Ready. Unbox Scanned→Unboxed→Received stays in
 * {@link ReceivingCartonPipeline} (Unbox / History details only).
 */

import { useMemo } from 'react';
import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import { LinearWorkflowStepper, type LinearStep } from '@/components/receiving/workspace/ReceivingProgressStepper';
import { PipelineStageRow } from '@/design-system/components';
import { triageLaneLabel } from '@/lib/receiving/triage-lane-policy';
import { hasTriageBeenCompleted } from '@/lib/receiving/triage-complete-local';
import {
  arrivalReadinessHeadline,
  deriveArrivalPipelineStates,
  isArrivalClassified,
  isArrivalStaged,
  type ArrivalPipelineKey,
} from '@/lib/receiving/arrival-journey';

const ARRIVAL_STEPS: ReadonlyArray<LinearStep> = [
  { key: 'door', label: 'Door' },
  { key: 'classified', label: 'Classified' },
  { key: 'staged', label: 'Staged' },
  { key: 'ready', label: 'Ready' },
];

function toStepperStates(
  states: Record<ArrivalPipelineKey, 'done' | 'active' | 'pending'>,
): Record<string, 'done' | 'active' | 'pending'> {
  return states;
}
export function ArrivalCartonPipeline({ log }: { log: ReceivingDetailsLog }) {
  const receivingId = Number(log.id);
  const isReady =
    log.triage_complete === true ||
    (Number.isFinite(receivingId) ? hasTriageBeenCompleted(receivingId) : false);
  const classified = isArrivalClassified(log.source, log.intake_type);
  const staged = isArrivalStaged(log.staging_location_id, log.priority_lane);

  const states = useMemo(
    () =>
      deriveArrivalPipelineStates({
        doorAt: log.tracking_scanned_at,
        source: log.source,
        intakeType: log.intake_type,
        stagingLocationId: log.staging_location_id,
        priorityLane: log.priority_lane,
        triageComplete: isReady,
      }),
    [
      log.tracking_scanned_at,
      log.source,
      log.intake_type,
      log.staging_location_id,
      log.priority_lane,
      isReady,
    ],
  );

  const doorAt = log.tracking_scanned_at ?? null;
  const doorName = (log.tracking_scanned_by_name ?? '').trim();
  const tracking = (log.tracking ?? '').trim();
  const lane = log.priority_lane ? triageLaneLabel(log.priority_lane) : null;
  const pairNote =
    log.pairing_state && log.pairing_state !== 'UNFOUND'
      ? `Pairing · ${log.pairing_state}`
      : log.source === 'unmatched'
        ? 'Unfound'
        : undefined;
  const classifyLabel = classified
    ? [log.source_platform || (log.source === 'unmatched' ? 'Unfound' : null), log.intake_type]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-text-default">{arrivalReadinessHeadline(states)}</p>

      <LinearWorkflowStepper
        steps={ARRIVAL_STEPS}
        states={toStepperStates(states)}
        ariaLabel="Arrival progress"
        className="w-full"
        size="compact"
      />

      <div className="divide-y divide-border-hairline">
        <PipelineStageRow
          label="Door scanned"
          at={doorAt}
          staffName={doorName}
          emptyFallback="Pending door scan"
          note={tracking ? `TRK · ${tracking.slice(-8)}` : undefined}
        />
        <PipelineStageRow
          label="Classified"
          at={classified ? doorAt : null}
          staffName={classifyLabel}
          emptyFallback="Pending classify"
          note={pairNote}
          muted={classified}
        />
        <PipelineStageRow
          label="Staged"
          at={staged ? (log.triage_completed_at ?? doorAt) : null}
          staffName={staged ? (log.staging_location_label ?? 'Shelf set') : ''}
          emptyFallback="Pending shelf / lane"
          note={lane ?? undefined}
          muted={staged && !log.triage_completed_at}
        />
        <PipelineStageRow
          label="Ready for unbox"
          at={isReady ? (log.triage_completed_at ?? null) : null}
          staffName={isReady ? 'Saved for unbox' : ''}
          emptyFallback="Not saved for unbox"
        />
      </div>
    </div>
  );
}
