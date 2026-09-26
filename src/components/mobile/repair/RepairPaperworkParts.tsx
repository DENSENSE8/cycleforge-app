'use client';

import { Button } from '@/design-system/primitives';
import { ExternalLink, Printer } from '@/components/Icons';
import type { RepairPaperDoc } from '@/components/mobile/repair/useRepairPaperwork';
import {
  REPAIR_PRINT_DOCUMENT_TITLE,
  repairPrintWhere,
  type RepairPrintLogEntry,
} from '@/lib/repair/repair-print-log';
import { formatMonthDayTimePST } from '@/utils/date';

/**
 * Faces of `/m/rs/[id]/paperwork`: one document row (Open + Print to station)
 * and the print log. The printer picker is the shared `StaffPrintStationPicker`.
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
