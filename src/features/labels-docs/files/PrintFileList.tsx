'use client';

/**
 * Labels & docs › Bulk — the file list (operator 2026-10-06): one `TriageRow`
 * per uploaded PDF on the shared triage face (`TriageCardList`
 * `density="row"`): checkbox · Shift-range · select visible · X · J / K, the
 * `TriageSelectBar` and its server pager. Day headers follow the sidebar's
 * Sort (`printFileBands`). Find, Sort, Print status and both date windows are
 * the sidebar's — this body paints files only. Nothing opens as a record: a
 * row click previews the file in the dock's pane (`FilesDesk`).
 *
 *   ☐ · uploaded time · [Printed | Printed 6/10 | —] · PDF file name · pages · uploader · last print
 */

import { useMemo, type ReactNode } from 'react';
import { FileText } from '@/components/Icons';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import {
  TriageCardList,
  type TriageCardModelBase,
  type TriageFeed,
  type TriageSelectionPort,
} from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import type { TriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import type { RowGroup } from '@/lib/group-rows';
import type { PrintFileRow } from '@/lib/label-prints/print-file-contracts';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { LABEL_INTAKE_UPLOADS_VIEW } from '@/lib/triage/views/label-intake';
import { formatMonthDayTimePST, getCurrentPSTDateKey } from '@/utils/date';
import {
  printFileBadge,
  printFileBandLabel,
  printFileBands,
  printFileLastPrint,
  printFilePages,
  printFileUploaded,
} from './print-file-model';
import type { PrintFilePage } from './use-print-files';

const VIEW = LABEL_INTAKE_UPLOADS_VIEW;
type PrintFileRowModel = TriageCardModelBase<PrintFileRow>;

const rowId = (file: PrintFileRow) => file.id;
const groupKey = (group: RowGroup<PrintFileRow>) => group.key;

/** One file as `TriageRow` data — the card-view adapter for `label-intake.uploads`. */
export function printFileRowFace(file: PrintFileRow): TriageRowFace {
  const badge = printFileBadge(file);
  const pages = printFilePages(file);
  const uploaded = printFileUploaded(file);
  const lastPrint = printFileLastPrint(file);
  const printed = lastPrint ? `Last printed ${lastPrint}` : 'Never printed';
  return {
    // The badge sits in the strip, which holds its width on a never-printed row (no badge, same columns).
    state: null,
    identity: formatMonthDayTimePST(file.uploadedAt),
    identityWidth: 'code',
    strip: (
      <span className="flex w-28" data-testid="print-file-badge">
        {badge ? (
          <LifecycleCode state={badge} srLabel={null} className="max-w-full">
            {badge.label}
          </LifecycleCode>
        ) : null}
      </span>
    ),
    title: file.fileName,
    titleIcon: <FileText className="size-3.5" aria-hidden />,
    titleTip: [file.fileName, pages, `Uploaded ${uploaded}`, printed].join(' · '),
    facts: [
      { id: 'pages', value: pages, width: 'long', tone: 'muted' },
      { id: 'uploaded-by', value: file.uploadedBy, width: 'short', tone: 'muted', tip: `Uploaded ${uploaded}` },
      { id: 'printed', value: lastPrint, width: 'long', tone: 'muted', tip: printed },
    ],
    next: null,
    aria: {
      row: `${file.fileName}, ${pages}, ${badge?.label ?? 'not printed'}`,
      open: `Preview ${file.fileName}`,
      check: `Select ${file.fileName}`,
    },
  };
}

export function PrintFileList({
  data,
  cut,
  narrowed,
  selection,
  openId,
  onOpen,
  onClose,
  bulk,
  banner,
}: {
  data: PrintFilePage;
  /** The face's page + held-new cut; the file list has no body status (the sidebar's `?printing=` is the server's). */
  cut: TriageCut<never>;
  /** Any sidebar filter or Find narrows the list. */
  narrowed: boolean;
  selection: TriageSelectionPort<PrintFileRow>;
  /** The previewed file — the J/K cursor. */
  openId: number | null;
  onOpen: (file: PrintFileRow) => void;
  onClose: () => void;
  /** The checked files' verbs in the select bar. */
  bulk: ReactNode;
  /** Notices and the upload tray above the rows. */
  banner: ReactNode;
}) {
  const { url, filterBands } = cut;
  const sort = data.filters.sort;
  const allBands = useMemo(() => printFileBands(data.rows, sort), [data.rows, sort]);
  const bands = useMemo(() => filterBands(allBands, groupKey, () => []), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  usePublishRecordCursor({
    surfaceId: 'labels-docs-files',
    scope: 'record',
    enabled: true,
    order: bands,
    openId,
    getId: rowId,
    onOpen,
    onClose,
  });

  const family = useMemo(() => {
    const today = getCurrentPSTDateKey();
    return {
      ...triageFamily<PrintFileRow, PrintFileRowModel>(VIEW, {
        rowId,
        groupKey,
        cardModel: (group) => ({ key: group.key, ids: [rowId(group.rows[0]!)], lead: group.rows[0]! }),
        renderCard: (props) => (
          <TriageRow
            key={props.model.key}
            {...props}
            open={props.model.lead.id === openId}
            face={printFileRowFace(props.model.lead)}
            testIdPrefix={VIEW.testIdPrefix}
            rowAttrs={{ 'data-file-id': props.model.lead.id }}
          />
        ),
      }),
      // Day headers are dated, so the band's label is computed, not declared.
      section: (band: string) => ({ label: printFileBandLabel(band, today), tone: 'muted' as const }),
    };
  }, [openId]);

  const q = data.filters.q ?? '';
  const feed = useMemo<TriageFeed<PrintFileRow>>(
    () => ({
      bands,
      allBands,
      painted,
      sectioned: true,
      total: data.total,
      statusOnServer: true,
      loading: data.loading,
      fetching: data.fetching,
      serverPages: { page: data.page, pageCount: data.pageCount, pageSize: data.pageSize, onPage: (page) => url.setPageIndex(page - 1) },
      search: { value: q, pending: data.fetching && q !== '' },
      selection,
      // Nothing opens in the record plane: the previewed file is the pane's, and the J/K cursor — X checks it.
      open: { id: null, cursorId: openId, open: onOpen, close: onClose },
    }),
    [bands, allBands, painted, data.total, data.loading, data.fetching, data.page, data.pageCount, data.pageSize, url, q, selection, openId, onOpen, onClose],
  );

  return (
    <TriageCardList
      family={family}
      feed={feed}
      cut={cut}
      density="row"
      record={{
        title: <span className="sr-only">Bulk</span>,
        noun: 'file',
        testId: 'print-file-record',
        summary: null,
        view: null,
        strip: null,
        // The list stands alone at the stage's width; the file pane is the dock's, not a record.
        rail: 'open',
      }}
      summary={null}
      bulk={bulk}
      banner={
        <div className="flex shrink-0 flex-col gap-2 px-3 pb-2 pt-2 empty:hidden">
          {banner}
          {data.error ? (
            <p aria-live="polite" className="text-role-caption text-text-danger" data-testid="print-files-error">
              The files could not be read — {data.error.message}. It retries on its own.
            </p>
          ) : null}
        </div>
      }
      searchEmpty={narrowed ? <p className="text-role-caption text-text-muted">No file matches these filters.</p> : null}
      allClear={<TriageAllClear title="No files yet" detail="Drop a PDF anywhere here, or Upload — labels and paperwork split by page size." />}
    />
  );
}
