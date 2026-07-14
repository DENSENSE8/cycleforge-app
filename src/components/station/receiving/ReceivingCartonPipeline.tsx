'use client';

import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import type { CartonReadiness, CartonPipelineKey } from '@/lib/receiving/carton-readiness';
import { LinearWorkflowStepper, type LinearStep } from '@/components/receiving/workspace/ReceivingProgressStepper';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { PipelineStageRow } from '@/design-system/components';

const STEPS: ReadonlyArray<LinearStep> = [
  { key: 'scanned', label: 'Scanned' },
  { key: 'unboxed', label: 'Unboxed' },
  { key: 'received', label: 'Received' },
];

function hasStamp(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

function resolveStaffLabel(
  nameFromApi: string | null | undefined,
  staffId: number | null | undefined,
  getStaffName: (id: number | null | undefined) => string,
): string {
  const trimmed = String(nameFromApi ?? '').trim();
  if (trimmed) return trimmed;
  if (staffId) return getStaffName(staffId);
  return '';
}

function keyToStepperKey(key: CartonPipelineKey): string {
  return key;
}

export function ReceivingCartonPipeline({
  log,
  readiness,
}: {
  log: ReceivingDetailsLog;
  readiness: CartonReadiness;
}) {
  const { getStaffName } = useStaffNameMap();

  const scanName = resolveStaffLabel(
    log.tracking_scanned_by_name,
    log.tracking_scanned_by,
    getStaffName,
  );
  const unboxName = resolveStaffLabel(log.unboxed_by_name, log.unboxed_by, getStaffName);
  const receiveName = resolveStaffLabel(log.received_by_name, log.received_by, getStaffName);

  // A carton can be received in one motion (scan → receive) without a distinct,
  // operator-acknowledged unbox — no manual condition/serial edit, sometimes no
  // serial at all. In that case "Unboxed" was folded into the receive: show the
  // receive instant with an "At receive" tag instead of a misleading "Pending
  // unbox", and credit the receiver. Never fabricate a separate earlier time.
  const receivedDone = hasStamp(log.received_at);
  const unboxStamped = hasStamp(log.unboxed_at);
  const unboxFolded = !unboxStamped && receivedDone;
  const unboxCoStamped = unboxStamped && String(log.unboxed_at) === String(log.received_at);

  const unboxAt = unboxStamped ? log.unboxed_at : unboxFolded ? log.received_at : null;
  const unboxDisplayName = unboxStamped ? unboxName : unboxFolded ? receiveName : unboxName;
  const unboxNote = unboxFolded || unboxCoStamped ? 'At receive' : undefined;

  const states: Record<string, 'done' | 'active' | 'pending'> = {
    scanned: readiness.pipelineStates.scanned,
    // A received carton has, by definition, been unboxed — keep the stepper
    // honest even when the distinct unbox step was folded into the receive.
    unboxed: unboxFolded ? 'done' : readiness.pipelineStates.unboxed,
    received: readiness.pipelineStates.received,
  };

  return (
    <div className="space-y-3">
      <LinearWorkflowStepper
        steps={STEPS.map((s) => ({ ...s, key: keyToStepperKey(s.key as CartonPipelineKey) }))}
        states={states}
        ariaLabel="Carton progress"
        className="w-full"
        size="compact"
      />

      <div className="divide-y divide-border-hairline">
        <PipelineStageRow
          label="Scanned"
          at={log.tracking_scanned_at}
          staffName={scanName}
          emptyFallback="Pending scan"
        />
        <PipelineStageRow
          label="Unboxed"
          at={unboxAt}
          staffName={unboxDisplayName}
          emptyFallback="Pending unbox"
          note={unboxNote}
          muted={unboxFolded}
        />
        <PipelineStageRow
          label="Received"
          at={log.received_at}
          staffName={receiveName}
          emptyFallback="Not received"
        />
      </div>
    </div>
  );
}

