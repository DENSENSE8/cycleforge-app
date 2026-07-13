'use client';

import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import type { CartonReadiness, CartonPipelineKey } from '@/lib/receiving/carton-readiness';
import { LinearWorkflowStepper, type LinearStep } from '@/components/receiving/workspace/ReceivingProgressStepper';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { formatStageClockTimePST, formatDatePST } from '@/utils/date';
import { useTimeFormat } from '@/lib/time-format/useTimeFormat';

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

function StageRow({
  label,
  at,
  staffName,
  emptyFallback,
  note,
  muted = false,
}: {
  label: string;
  at: string | null | undefined;
  staffName: string;
  emptyFallback: string;
  /** Provenance tag when the stamp is inherited from a later milestone (e.g. "At receive"). */
  note?: string;
  /** Render the inherited time softer, so a folded step doesn't read as a distinct stamp. */
  muted?: boolean;
}) {
  const hasAt = hasStamp(at);
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{label}</p>
        {/* Attribution rides with the milestone: show a stage's staff name ONLY
            when that stage's own timestamp exists. A name without a timestamp
            (e.g. a stale received_by while the carton is still "NOT RECEIVED")
            is misleading — the Received name/time appear only when the Receive
            button actually stamps received_at. */}
        {hasAt && staffName ? (
          <p className="truncate text-sm font-bold text-text-default">{staffName}</p>
        ) : (
          <p className="text-sm font-bold text-text-faint">—</p>
        )}
      </div>
      {hasAt ? (
        <div className="shrink-0 text-right tabular-nums">
          <p className="text-role-eyebrow font-bold uppercase tracking-widest text-text-muted">
            {formatDatePST(at, { withLeadingZeros: true })}
          </p>
          <p className={`text-sm font-bold ${muted ? 'text-text-muted' : 'text-text-default'}`}>
            {formatStageClockTimePST(at)}
          </p>
          {note ? (
            <p className="text-role-eyebrow font-bold uppercase tracking-widest text-text-faint">{note}</p>
          ) : null}
        </div>
      ) : (
        <p className="shrink-0 text-role-eyebrow font-bold uppercase tracking-widest text-text-faint">
          {emptyFallback}
        </p>
      )}
    </div>
  );
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
  // Re-render the stage rows the instant the clock-format preference flips.
  useTimeFormat();

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
        <StageRow
          label="Scanned"
          at={log.tracking_scanned_at}
          staffName={scanName}
          emptyFallback="Pending scan"
        />
        <StageRow
          label="Unboxed"
          at={unboxAt}
          staffName={unboxDisplayName}
          emptyFallback="Pending unbox"
          note={unboxNote}
          muted={unboxFolded}
        />
        <StageRow
          label="Received"
          at={log.received_at}
          staffName={receiveName}
          emptyFallback="Not received"
        />
      </div>
    </div>
  );
}

