'use client';

import { Barcode, PackageOpen, PackageCheck } from '@/components/Icons';
import type { ReceivingDetailsLog } from '@/components/station/receiving-details-log';
import type { CartonReadiness } from '@/lib/receiving/carton-readiness';
import {
  MilestonePipeline,
  type Milestone,
  type MilestoneScan,
} from '@/design-system/components/milestone-pipeline';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';

const GLYPH = 'h-[15px] w-[15px]';

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

/**
 * The carton's receiving pipeline — Scanned · Unboxed · Received.
 *
 * A thin mapper onto {@link MilestonePipeline}, the same anatomy the order
 * pipeline uses. It used to render the stepper AND a list of attributed rows
 * underneath, which printed all three stage names twice and the receiver's name
 * three times — six lines to say what three say.
 */
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
  // receive instant, credit the receiver, and say "At receive" so the stamp is
  // never read as a distinct earlier event. Never fabricate a separate time.
  const receivedDone = hasStamp(log.received_at);
  const unboxStamped = hasStamp(log.unboxed_at);
  const unboxFolded = !unboxStamped && receivedDone;
  const unboxCoStamped = unboxStamped && String(log.unboxed_at) === String(log.received_at);
  const unboxAt = unboxStamped ? log.unboxed_at : unboxFolded ? log.received_at : null;
  const unboxName2 = unboxStamped ? unboxName : unboxFolded ? receiveName : unboxName;
  const unboxNote: MilestoneScan[] =
    unboxFolded || unboxCoStamped ? [{ kind: 'note', value: 'At receive' }] : [];

  const tracking = String(log.tracking || "").trim();

  const milestones: Milestone[] = [
    {
      key: 'scanned',
      label: 'Scanned',
      icon: <Barcode className={GLYPH} />,
      at: log.tracking_scanned_at ?? null,
      actor: { staffId: log.tracking_scanned_by ?? null, name: scanName },
      // The door scan reads the carrier label.
      scans: tracking ? [{ kind: 'tracking', value: tracking }] : [],
      readyLabel: 'Pending door scan',
    },
    {
      key: 'unboxed',
      label: 'Unboxed',
      icon: <PackageOpen className={GLYPH} />,
      at: unboxAt ?? null,
      actor: { staffId: (unboxStamped ? log.unboxed_by : log.received_by) ?? null, name: unboxName2 },
      scans: unboxNote,
      readyLabel: 'Ready to unbox',
    },
    {
      key: 'received',
      label: 'Received',
      icon: <PackageCheck className={GLYPH} />,
      at: log.received_at ?? null,
      actor: { staffId: log.received_by ?? null, name: receiveName },
      scans: [],
      readyLabel: 'Ready to receive',
    },
  ];
  // A received carton has, by definition, been unboxed — keep the run honest
  // even when the distinct unbox step was folded into the receive.
  void readiness;

  return <MilestonePipeline milestones={milestones} ariaLabel="Carton progress" className="w-full" />;
}
