'use client';

/**
 * Arrival door journey for the **Arrival receiving-details** Progress tab.
 *
 * Door → Classified → Staged → Ready. Unbox Scanned→Unboxed→Received stays in
 * {@link ReceivingCartonPipeline} (Unbox / History details only).
 */

import { useMemo } from 'react';
import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import { Barcode, ClipboardList, Inbox, PackageOpen } from '@/components/Icons';
import {
  MilestonePipeline,
  type Milestone,
  type MilestoneScan,
} from '@/design-system/components/milestone-pipeline';
import { triageLaneLabel } from '@/lib/receiving/triage-lane-policy';
import { hasTriageBeenCompleted } from '@/lib/receiving/triage-complete-local';
import {
  arrivalReadinessHeadline,
  deriveArrivalPipelineStates,
  isArrivalClassified,
  isArrivalStaged,
} from '@/lib/receiving/arrival-journey';

const GLYPH = 'h-[15px] w-[15px]';
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
  // Channel face is PlatformMark elsewhere — never paint raw source_platform
  // slug as staff-facing prose here. Keep intake type / Unfound only.
  const classifyLabel = classified
    ? [log.source === 'unmatched' ? 'Unfound' : null, log.intake_type]
        .filter(Boolean)
        .join(' · ')
    : '';

  /**
   * Only the door scan has a PERSON. Classified / Staged / Ready are states the
   * record reached, not things a named operator signed for — so they carry a
   * `detail` instead of an actor. They used to be passed as `staffName`, which
   * put "Shelf set" and "Saved for unbox" in a person's slot; on the shared
   * anatomy that would have minted an avatar out of a location label.
   */
  const milestones: Milestone[] = [
    {
      key: 'door',
      label: 'Door',
      icon: <Inbox className={GLYPH} />,
      at: doorAt,
      actor: { staffId: log.tracking_scanned_by ?? null, name: doorName },
      // The door scan reads the carrier label — through the house chip, not a
      // hand-rolled `slice(-8)`.
      scans: tracking ? ([{ kind: 'tracking', value: tracking }] as MilestoneScan[]) : [],
      readyLabel: 'Pending door scan',
    },
    {
      key: 'classified',
      label: 'Classified',
      icon: <ClipboardList className={GLYPH} />,
      at: classified ? doorAt : null,
      detail: classifyLabel || null,
      scans: pairNote ? ([{ kind: 'note', value: pairNote }] as MilestoneScan[]) : [],
      readyLabel: 'Pending classify',
    },
    {
      key: 'staged',
      label: 'Staged',
      icon: <PackageOpen className={GLYPH} />,
      at: staged ? (log.triage_completed_at ?? doorAt) : null,
      detail: staged ? (log.staging_location_label ?? 'Shelf set') : null,
      scans: lane ? ([{ kind: 'note', value: lane }] as MilestoneScan[]) : [],
      readyLabel: 'Pending shelf / lane',
    },
    {
      key: 'ready',
      label: 'Ready',
      icon: <Barcode className={GLYPH} />,
      at: isReady ? (log.triage_completed_at ?? null) : null,
      detail: isReady ? 'Saved for unbox' : null,
      scans: [],
      readyLabel: 'Not saved for unbox',
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-text-default">{arrivalReadinessHeadline(states)}</p>
      <MilestonePipeline milestones={milestones} ariaLabel="Arrival progress" className="w-full" />
    </div>
  );
}
