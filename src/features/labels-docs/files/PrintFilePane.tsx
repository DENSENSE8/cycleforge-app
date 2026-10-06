'use client';

/**
 * Labels & docs › Bulk — the file pane (operator 2026-10-06), the dock's
 * right side (a drawer when the desk is too narrow).
 *
 *   one file   header: file name + printer gear · the ORIGINAL PDF · where its
 *              pages go (labels → the 4×6 station, paperwork → the Letter
 *              station) and how many matched an order · ONE Print / Reprint ·
 *              Delete while no page is on an order
 *   several    the checked files (remove one with ×) · Print N files
 *
 * Printing is the desk's (`FilesDesk` → `useDeskPress`): pages in page order,
 * each stock to its station, one reprint confirm.
 */

import { Printer, RotateCcw, Trash2, X } from '@/components/Icons';
import { ArmedDangerButton } from '@/design-system/components/ArmedDangerButton';
import { DocumentPreviewFrame } from '@/design-system/components/DocumentPreviewFrame';
import type { DeskSelectionPaneMode } from '@/design-system/components/DeskSelectionDock';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { Button } from '@/design-system/primitives';
import { IconButton } from '@/design-system/primitives/IconButton';
import { printFileStatus, type PrintFileDetail, type PrintFileRow } from '@/lib/label-prints/print-file-contracts';
import type { PrintStock } from '@/lib/label-prints/print-route';
import { PrinterSettingsGear } from '../PrinterSettingsGear';
import { printFileBadge, printFileLastPrint, printFilePages, printFileUploaded } from './print-file-model';

export interface PrintFilePaneProps {
  mode: DeskSelectionPaneMode;
  /** The previewed file (row click, J / K), else the one checked file. */
  file: PrintFileRow | null;
  /** The previewed file's pages — Delete waits for them. */
  detail: PrintFileDetail | undefined;
  /** Two or more checked: the pane lists them instead of previewing. */
  checked: readonly PrintFileRow[];
  onUncheck: (id: number) => void;
  /** The drawer's close button (narrow dock only). */
  onClose: () => void;
  onPrint: (files: readonly PrintFileRow[]) => void;
  printing: boolean;
  onDelete: (file: PrintFileRow) => Promise<void>;
  deleting: boolean;
  /** Why a stock cannot print right now (`usePrintStations().blockedReason`). */
  blockedReason: (stock: PrintStock) => string | null;
  /** Where each stock prints: "Thermal bench · 4×6". */
  stationFace: Readonly<Record<PrintStock, string>>;
}

/** Why these files cannot print now: printing already, or every stock they need is blocked. */
function printBlocked(files: readonly PrintFileRow[], printing: boolean, blockedReason: (stock: PrintStock) => string | null): string | null {
  if (printing) return 'Printing…';
  const stocks: PrintStock[] = [];
  if (files.some((file) => file.labelPages > 0)) stocks.push('label');
  if (files.some((file) => file.paperPages > 0)) stocks.push('paper');
  const reasons = stocks.map(blockedReason);
  return reasons.length > 0 && reasons.every(Boolean) ? reasons.join(' ') : null;
}

export function PrintFilePane(props: PrintFilePaneProps) {
  const { mode, checked, onClose } = props;
  const several = checked.length >= 2;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="print-file-pane">
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-mode-divide px-3 py-2">
        <h2 className="min-w-0 truncate text-role-body font-semibold text-text-default" title={several ? undefined : props.file?.fileName}>
          {several ? `${checked.length} files selected` : (props.file?.fileName ?? '')}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <PrinterSettingsGear />
          {mode === 'drawer' ? <IconButton icon={<X />} size="md" ariaLabel="Close the pane" onClick={onClose} data-testid="print-file-pane-close" /> : null}
        </div>
      </div>
      {several ? <CheckedFiles {...props} /> : props.file ? <OneFile {...props} file={props.file} /> : null}
    </div>
  );
}

function OneFile({ file, detail, onPrint, printing, onDelete, deleting, blockedReason, stationFace }: PrintFilePaneProps & { file: PrintFileRow }) {
  const reason = printBlocked([file], printing, blockedReason);
  const reprint = printFileStatus(file) === 'printed';
  const lastPrint = printFileLastPrint(file);
  // The server refuses a delete once any page holds an order; offer it only while none does.
  const deletable = detail != null && detail.id === file.id && detail.pages.every((page) => page.match === 'unmatched');
  const lines = [
    file.labelPages > 0 ? `${file.labelPages} label${file.labelPages === 1 ? '' : 's'} → ${stationFace.label}` : null,
    file.paperPages > 0 ? `${file.paperPages} paperwork → ${stationFace.paper}` : null,
    `${file.matchedPages} of ${file.pageCount} matched to orders`,
    `Uploaded ${printFileUploaded(file)}`,
    lastPrint ? `Last printed ${lastPrint}` : 'Never printed',
  ].filter((line): line is string => line != null);
  return (
    <>
      <DocumentPreviewFrame title={file.fileName} src={file.src} mimeHint="pdf" className="min-h-64" />
      <footer className="shrink-0 border-t border-mode-divide bg-surface-card px-3 py-3" data-testid="print-file-actions">
        <ul className="mb-2 min-w-0 text-role-caption text-text-muted" data-testid="print-file-summary">
          {lines.map((line) => (
            <li key={line} className="truncate" title={line}>
              {line}
            </li>
          ))}
        </ul>
        <Button
          variant="primary"
          size="md"
          icon={reprint ? <RotateCcw /> : <Printer />}
          className="w-full min-w-0"
          disabled={reason != null}
          loading={printing}
          onClick={() => onPrint([file])}
          data-testid="print-file-print"
        >
          {reprint ? 'Reprint' : 'Print'}
        </Button>
        {reason && !printing ? <p className="mt-2 min-w-0 text-role-caption text-text-warning">{reason}</p> : null}
        {deletable ? (
          <ArmedDangerButton
            label="Delete file"
            confirmLabel="Delete — press again"
            icon={<Trash2 />}
            size="sm"
            className="mt-2 w-full"
            loading={deleting}
            onConfirm={() => onDelete(file)}
            data-testid="print-file-delete"
          />
        ) : null}
      </footer>
    </>
  );
}

function CheckedFiles({ checked, onUncheck, onPrint, printing, blockedReason }: PrintFilePaneProps) {
  const reason = printBlocked(checked, printing, blockedReason);
  return (
    <>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="print-file-checked">
        {checked.map((file) => {
          const badge = printFileBadge(file);
          return (
            <li key={file.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 border-b border-mode-rule px-3 py-1.5" data-file-id={file.id}>
              <div className="min-w-0">
                <p className="min-w-0 truncate text-role-body text-text-default" title={file.fileName}>
                  {file.fileName}
                </p>
                <p className="min-w-0 truncate text-role-caption text-text-muted">{printFilePages(file)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {badge ? (
                  <LifecycleCode state={badge} srLabel={null}>
                    {badge.label}
                  </LifecycleCode>
                ) : null}
                <IconButton icon={<X />} size="sm" ariaLabel={`Remove ${file.fileName} from the selection`} onClick={() => onUncheck(file.id)} />
              </div>
            </li>
          );
        })}
      </ul>
      <footer className="shrink-0 border-t border-mode-divide bg-surface-card px-3 py-3">
        <Button
          variant="primary"
          size="md"
          icon={<Printer />}
          className="w-full min-w-0"
          disabled={reason != null}
          loading={printing}
          onClick={() => onPrint(checked)}
          data-testid="print-file-print-checked"
        >
          {`Print ${checked.length} files`}
        </Button>
        {reason && !printing ? <p className="mt-2 min-w-0 text-role-caption text-text-warning">{reason}</p> : null}
      </footer>
    </>
  );
}
