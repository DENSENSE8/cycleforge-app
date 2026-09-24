'use client';

import { Button } from '@/design-system/primitives';
import { ExternalLink, Printer } from '@/components/Icons';
import { MobilePrintOptionsDropdown } from '@/components/mobile/print/MobilePrintPrinterStep';
import { StaffPrintStationPicker } from '@/components/mobile/print/StaffPrintStationPicker';
import type { RepairPaperDoc } from '@/components/mobile/repair/useRepairPaperwork';
import type { StaffPrintPatch } from '@/hooks/useStaffPrintBridgeClient';
import {
  roleReady,
  type StaffPrintRole,
  type StaffPrintStation,
  type StaffPrintStatus,
} from '@/lib/print/staff-print-bridge';
import {
  REPAIR_PRINT_DOCUMENT_TITLE,
  repairPrintWhere,
  type RepairPrintLogEntry,
} from '@/lib/repair/repair-print-log';
import { formatMonthDayTimePST } from '@/utils/date';

/**
 * Faces of `/m/rs/[id]/paperwork`: one document row (Open + Print to station),
 * the station card (which named station prints, its printers), and the print log.
 */

const OPEN_LINK_CLASS =
  'inline-flex min-h-mode-hit items-center gap-1.5 rounded-mode border border-mode-edge bg-mode-panel px-3 text-role-caption font-semibold text-mode-ink active:bg-mode-hover [&>svg]:h-4 [&>svg]:w-4';

export function RepairDocumentRow({
  doc,
  printBlockedReason,
  printing,
  onPrint,
}: {
  doc: RepairPaperDoc;
  /** Why the station cannot take this document right now; null when it can. */
  printBlockedReason: string | null;
  printing: boolean;
  onPrint: () => void;
}) {
  return (
    <li className="space-y-2 border-b border-mode-rule px-mode-page py-3 last:border-b-0" data-doc={doc.key}>
      <div className="min-w-0">
        <p className="text-mode-body font-semibold text-mode-ink">{doc.title}</p>
        <p className="text-role-caption text-mode-muted">{doc.detail}</p>
        <p className="text-role-caption text-mode-muted">
          {doc.lastPrint
            ? `Last printed ${formatMonthDayTimePST(doc.lastPrint.at)} · ${repairPrintWhere(doc.lastPrint)}`
            : 'Not printed yet'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {doc.openHref ? (
          <a className={OPEN_LINK_CLASS} href={doc.openHref} target="_blank" rel="noreferrer">
            <ExternalLink />
            Open
          </a>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          icon={<Printer />}
          loading={printing}
          disabled={printBlockedReason != null}
          onClick={onPrint}
        >
          Print to station
        </Button>
      </div>
      {printBlockedReason ? <p className="text-role-caption text-text-warning">{printBlockedReason}</p> : null}
    </li>
  );
}

function StationRole({ status, role }: { status: StaffPrintStatus; role: StaffPrintRole }) {
  const face = role === 'paper' ? status.paper : status.label;
  return (
    <p className="flex items-baseline justify-between gap-3 text-role-caption">
      <span className="font-semibold text-mode-ink">{role === 'paper' ? 'Paper' : 'Label'}</span>
      <span className={roleReady(status, role) ? 'text-text-success' : 'text-text-warning'}>
        {roleReady(status, role) ? `Ready — ${face.name ?? 'printer'}` : face.name ? `${face.name} not ready` : 'No printer'}
      </span>
    </p>
  );
}

export function RepairStationCard({
  staffName,
  stations,
  target,
  now,
  onPick,
  onPatch,
  onRefresh,
}: {
  staffName: string;
  stations: readonly StaffPrintStation[];
  target: StaffPrintStation | null;
  now: number;
  onPick: (stationId: string | null) => void;
  onPatch: (patch: StaffPrintPatch) => void;
  onRefresh: () => void;
}) {
  const status = target?.status ?? null;
  return (
    <div className="space-y-2 rounded-mode border border-mode-edge bg-mode-panel p-mode-page">
      <StaffPrintStationPicker
        stations={stations}
        target={target}
        now={now}
        staffName={staffName}
        onPick={onPick}
        onRefresh={onRefresh}
      />
      {status ? (
        <>
          <StationRole status={status} role="label" />
          <StationRole status={status} role="paper" />
          {status.profiles.length > 0 ? (
            <div className="grid gap-2 pt-1">
              <MobilePrintOptionsDropdown status={status} role="label" onPatch={onPatch} />
              <MobilePrintOptionsDropdown status={status} role="paper" onPatch={onPatch} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function RepairPrintLogList({
  entries,
  documents,
}: {
  entries: RepairPrintLogEntry[];
  documents: RepairPaperDoc[];
}) {
  if (entries.length === 0) {
    return <p className="text-role-caption text-mode-muted">Nothing printed yet.</p>;
  }
  return (
    <ol className="space-y-2" data-testid="print-log">
      {entries.map((entry) => {
        const manual =
          entry.document === 'manual' ? documents.find((d) => d.job.manualId === entry.manualId)?.title : null;
        return (
          <li key={entry.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-mode-body font-semibold text-mode-ink">
                {manual ?? REPAIR_PRINT_DOCUMENT_TITLE[entry.document]}
                {entry.reprint ? <span className="ml-1.5 font-normal text-mode-muted">reprint</span> : null}
              </span>
              <span className="block text-role-caption text-mode-muted">{repairPrintWhere(entry)}</span>
            </span>
            <time dateTime={entry.at} className="shrink-0 text-role-caption text-mode-muted">
              {formatMonthDayTimePST(entry.at)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
