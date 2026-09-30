'use client';

/**
 * Labels & docs › Uploads — the bare route (owner 2026-09-28). Start simple:
 * every uploaded PDF is one card on a full-width list (the bar's measure); nothing sits
 * beside it until a card is clicked. Then the desk splits — the cards become
 * the rail at the left, and the batch opens beside them:
 *
 *   main   every label of the PDF inline, rastered as it prints, each with its
 *          print badge (Not printed / Printed ×N · when · who · station)
 *   aside  the paired orders' packing slips, where each stock prints, the file
 *
 * Search (the sidebar's Find) narrows by file name, a label's tracking or its
 * order; the sidebar's Uploaded range narrows by upload date (`?from` / `?to`).
 * Drop PDFs anywhere on the desk; ⌘O picks them. The same PDF uploaded twice
 * is the same batch — its print history carries over.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Printer, RotateCcw } from '@/components/Icons';
import { IncomingStatusChips, type IncomingStatusChipSet } from '@/components/receiving/incoming/IncomingStatusChips';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { TriageCardList, type TriageFeed, type TriageSelectionPort } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { Button, Checkbox } from '@/design-system/primitives';
import { HOTKEY_SCRIM_HOST_CLASS, HotkeyScrim } from '@/design-system/primitives/HotkeyScrim';
import { usePrintStations } from '@/hooks/usePrintStations';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import type { LabelBatchPage, LabelBatchRow } from '@/lib/label-batches/contracts';
import { fetchLabelBatch, fetchLabelBatches, labelBatchesKey, labelBatchKey } from '@/lib/label-batches/http-client';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { useDeskSearch } from '@/lib/outbound/desk-search-store';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import {
  LABEL_BATCH_PARAM,
  LABEL_BATCH_PRINTING_KEYS,
  LABEL_BATCH_PRINTING_PARAM,
  LABEL_INTAKE_UPLOADS_VIEW,
  type LabelBatchPrintingKey,
} from '@/lib/triage/views/label-intake';
import { cn } from '@/utils/_cn';
import { BatchCard } from './BatchCard';
import { BatchPages } from './BatchPages';
import {
  batchBands,
  batchCardKey,
  batchCardModel,
  batchExactFind,
  batchPageDocuments,
  batchPrintingKey,
  batchRowId,
} from './batch-model';
import { paperworkDocuments, unprintedPaperworkKeys } from './desk-rows';
import { PrintStationsCard, stationFace } from './PrintStationsCard';
import { LabelUploadTray } from './upload/LabelUploadTray';
import { useLabelUploads } from './upload/use-label-uploads';
import { reprintWarning, useDeskPress, type PrintedLabelFace } from './use-desk-press';
import { usePrintRoutes } from './use-print-routes';

const DECL = LABEL_INTAKE_UPLOADS_VIEW;
const UPLOAD_CHORD = 'mod+o';
const PRINT_CHORD = 'mod+p';
const PRINTING_LABEL: Record<LabelBatchPrintingKey, string> = { 'to-print': 'To print', printed: 'Printed' };
const rowPrinting = (row: LabelBatchRow): readonly LabelBatchPrintingKey[] => [batchPrintingKey(row)];

const pageFace = (page: LabelBatchPage): PrintedLabelFace => ({
  name: `Page ${page.pageNumber}`,
  printCount: page.printCount,
  lastPrintedAt: page.lastPrintedAt,
  lastPrintedBy: page.lastPrintedBy,
  lastStationName: page.lastStationName,
});

/** Enter on the open batch prints — unless a control that owns Enter has focus. */
function ownsEnter(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return isEditableKeyTarget(target) || target.closest('button, a[href], [role="checkbox"], [role="switch"], [role="tab"], [role="option"]') != null;
}

export function LabelBatchesDesk() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const apple = useApplePlatform();
  const picker = useRef<HTMLInputElement>(null);
  const { refresh: refreshRoutes } = usePrintRoutes();
  const stations = usePrintStations();
  const { print, notice, setNotice, refresh } = useDeskPress(stations, refreshRoutes);
  const [dragging, setDragging] = useState(false);

  // One view: the lone list, split on open. The frame's view chord cannot move it off.
  const stage = useDeskStageOptional();
  const stageView = stage?.view;
  const setStageView = stage?.setView;
  useEffect(() => {
    if (stageView && stageView !== 'in-place') setStageView?.('in-place');
  }, [stageView, setStageView]);

  // ── The list: search (desk Find) + upload date (the sidebar's range) ──
  const [query, setQuery] = useDeskSearch(pathname);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  const filters = useMemo(() => ({ q: query.trim(), from, to }), [query, from, to]);
  const list = useQuery({
    queryKey: labelBatchesKey(filters),
    queryFn: () => fetchLabelBatches(filters),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    placeholderData: (previous) => previous,
  });
  const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
  const cut = useTriageCut({ statusKeys: LABEL_BATCH_PRINTING_KEYS, recordParams: DECL.recordParams, statusParam: LABEL_BATCH_PRINTING_PARAM });
  const { statusFilter, toggleStatus, resetStatus } = cut.url;
  const allBands = useMemo(() => batchBands(rows), [rows]);
  const { filterBands } = cut;
  const bands = useMemo(() => filterBands(allBands, batchCardKey, rowPrinting), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);
  const toPrintCount = useMemo(() => rows.filter((row) => batchPrintingKey(row) === 'to-print').length, [rows]);

  // ── The open batch lives in the URL (`?batch=`), so a link opens it ──
  const openId = Number(searchParams.get(LABEL_BATCH_PARAM)) || null;
  const setOpenId = useCallback(
    (id: number | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id == null) next.delete(LABEL_BATCH_PARAM);
      else next.set(LABEL_BATCH_PARAM, String(id));
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );
  const openRow = useCallback((row: LabelBatchRow) => setOpenId(row.id), [setOpenId]);
  const closeBatch = useCallback(() => setOpenId(null), [setOpenId]);
  const openBatch = rows.find((row) => row.id === openId) ?? null;

  usePublishRecordCursor({
    surfaceId: 'labels-docs-batches',
    scope: 'record',
    enabled: true,
    order: bands,
    openId,
    getId: batchRowId,
    onOpen: openRow,
    onClose: closeBatch,
  });

  const detail = useQuery({
    queryKey: labelBatchKey(openId ?? 0),
    queryFn: () => fetchLabelBatch(openId!),
    enabled: openId != null,
    refetchInterval: 15_000,
  });
  const pages = useMemo(() => detail.data?.pages ?? [], [detail.data]);
  const paperwork = useMemo(() => detail.data?.paperwork ?? [], [detail.data]);

  // Checked pages: unprinted by default; a one-label batch always opens ready to print,
  // including a reprint (the existing reprint confirmation still owns that path).
  const [included, setIncluded] = useState<ReadonlySet<number>>(new Set());
  const [slipsIncluded, setSlipsIncluded] = useState<ReadonlySet<string>>(new Set());
  const seededFor = useRef<number | null>(null);
  useEffect(() => {
    if (!detail.data || seededFor.current === detail.data.batch.id) return;
    seededFor.current = detail.data.batch.id;
    setIncluded(
      new Set(
        detail.data.pages
          .filter((page) => detail.data.pages.length === 1 || page.printCount === 0)
          .map((page) => page.id),
      ),
    );
    setSlipsIncluded(unprintedPaperworkKeys(detail.data.paperwork));
  }, [detail.data]);
  const checkedPages = useMemo(() => pages.filter((page) => included.has(page.id)), [pages, included]);
  const slipDocs = useMemo(() => paperworkDocuments(paperwork).documents, [paperwork]);
  const checkedSlips = useMemo(() => slipDocs.filter((doc) => slipsIncluded.has(doc.key)), [slipDocs, slipsIncluded]);

  const press = useCallback(
    (documents: DeskDocument[], reprint: boolean, confirm: string | null = null) => {
      if (print.isPending) return;
      if (documents.length === 0) {
        setNotice('Nothing to print — check a label.');
        return;
      }
      print.mutate({ documents, reprint, confirm });
    },
    [print, setNotice],
  );
  const printChecked = useCallback(
    () => press(batchPageDocuments(checkedPages, false), checkedPages.some((page) => page.printCount > 0), reprintWarning(checkedPages.map(pageFace))),
    [press, checkedPages],
  );
  // A page's own Print / Reprint button is an explicit choice — it never asks.
  const printPage = useCallback((page: LabelBatchPage) => press(batchPageDocuments([page], false), page.printCount > 0), [press]);

  // ── The check-set (whole batches): their unprinted labels, or every label ──
  const [checked, setChecked] = useState<ReadonlySet<number>>(() => new Set());
  const visibleIds = useRef<readonly number[]>([]);
  const selection = useMemo<TriageSelectionPort<LabelBatchRow>>(
    () => ({
      ids: checked,
      toggle: (row) =>
        setChecked((current) => {
          const next = new Set(current);
          if (next.has(row.id)) next.delete(row.id);
          else next.add(row.id);
          return next;
        }),
      toggleGroup: (ids, on) =>
        setChecked((current) => {
          const next = new Set(current);
          for (const id of ids) {
            if (on) next.add(id);
            else next.delete(id);
          }
          return next;
        }),
      setAll: (on) => setChecked(on ? new Set(visibleIds.current) : new Set()),
      publishVisible: (ids) => {
        visibleIds.current = ids;
      },
    }),
    [checked],
  );
  const checkedRows = useMemo(() => painted.filter((row) => checked.has(row.id)), [painted, checked]);
  const pressBatches = useCallback(
    async (batches: readonly LabelBatchRow[], onlyUnprinted: boolean) => {
      if (print.isPending || batches.length === 0) return;
      // One read per batch (cached when already open), then ONE press in list order.
      const details = await Promise.all(
        batches.map((row) => queryClient.fetchQuery({ queryKey: labelBatchKey(row.id), queryFn: () => fetchLabelBatch(row.id) })),
      );
      const faces = onlyUnprinted ? [] : details.flatMap((one) => one.pages.map((page) => ({ ...pageFace(page), name: `${one.batch.fileName} · page ${page.pageNumber}` })));
      press(details.flatMap((one) => batchPageDocuments(one.pages, onlyUnprinted)), !onlyUnprinted, reprintWarning(faces));
    },
    [print.isPending, queryClient, press],
  );

  // ── Uploads: one PDF = one batch; a landed file opens ──
  const uploads = useLabelUploads({ onSettled: refresh, onUploaded: setOpenId });
  const submit = useCallback(
    (list: FileList | null | undefined) => {
      const files = [...(list ?? [])];
      if (files.length > 0) uploads.submit(files);
    },
    [uploads],
  );
  const openPicker = useCallback(() => picker.current?.click(), []);
  const printOpenUnprinted = useCallback(() => {
    if (openBatch) press(batchPageDocuments(pages, true), false);
    else if (checkedRows.length > 0) void pressBatches(checkedRows, true);
    else setNotice('Open or check an upload to print its labels.');
  }, [openBatch, press, pages, checkedRows, pressBatches, setNotice]);
  useNavIntent('labels-docs:upload', openPicker);
  useNavIntent('labels-docs:print-labels', printOpenUnprinted);

  useEffect(
    () =>
      registerShortcutOverviewGroup({
        id: 'labels-docs-uploads',
        title: 'Labels & docs · Uploads',
        rows: [
          { keys: ['J', 'K'], label: 'Next / previous upload' },
          { keys: ['Enter'], label: 'Print the open upload’s checked labels' },
          { keys: chordKeys(PRINT_CHORD, apple), label: 'Print the labels not yet printed' },
          { keys: chordKeys(UPLOAD_CHORD, apple), label: 'Upload label PDFs' },
          { keys: ['Esc'], label: 'Close the upload' },
        ],
      }),
    [apple],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || hasOpenOverlay()) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod && !event.shiftKey && !event.altKey && event.key === 'Enter') {
        if (openId == null || ownsEnter(event.target)) return;
        event.preventDefault();
        printChecked();
        return;
      }
      if (!mod || event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'p') {
        event.preventDefault();
        printOpenUnprinted();
      } else if (key === 'o') {
        event.preventDefault();
        openPicker();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, printChecked, printOpenUnprinted, openPicker]);

  // ── Face slots ────────────────────────────────────────────────────────────
  const family = useMemo(
    () =>
      triageFamily(DECL, {
        rowId: batchRowId,
        groupKey: batchCardKey,
        cardModel: batchCardModel,
        exactFind: batchExactFind,
        renderCard: (props) => <BatchCard key={props.model.key} {...props} testIdPrefix={DECL.testIdPrefix} />,
      }),
    [],
  );
  const feed = useMemo<TriageFeed<LabelBatchRow>>(
    () => ({
      bands,
      allBands,
      painted,
      sectioned: false,
      total: list.data?.total ?? rows.length,
      loading: list.isPending,
      fetching: list.isFetching,
      search: { value: query, onChange: setQuery, pending: list.isFetching && query.trim() !== '' },
      selection,
      open: { id: openId, open: openRow, close: closeBatch },
    }),
    [bands, allBands, painted, list.data, rows.length, list.isPending, list.isFetching, query, setQuery, selection, openId, openRow, closeBatch],
  );
  const chipSet = useMemo<IncomingStatusChipSet>(
    () => ({
      label: 'Filter by printing',
      disabledReason: null,
      onToggle: (id) => (id === 'all' ? resetStatus() : toggleStatus(id as LabelBatchPrintingKey)),
      chips: [
        { id: 'all', label: 'All', count: list.isPending ? null : rows.length, tone: null, active: statusFilter.size === 0 },
        ...LABEL_BATCH_PRINTING_KEYS.map((id) => ({
          id,
          label: PRINTING_LABEL[id],
          count: list.isPending ? null : id === 'to-print' ? toPrintCount : rows.length - toPrintCount,
          tone: id === 'to-print' ? ('warning' as const) : ('success' as const),
          active: statusFilter.has(id),
        })),
      ],
    }),
    [list.isPending, rows.length, toPrintCount, statusFilter, resetStatus, toggleStatus],
  );
  const bulkVerbs = useMemo<RecordActionVerb[]>(() => {
    const unprinted = checkedRows.reduce((sum, row) => sum + Math.max(0, row.pageCount - row.printedPages), 0);
    const every = checkedRows.reduce((sum, row) => sum + row.pageCount, 0);
    return [
      {
        id: 'print-unprinted',
        label: `Print ${unprinted} not yet printed`,
        icon: <Printer />,
        disabled: unprinted === 0 || print.isPending,
        disabledReason: print.isPending ? 'Printing…' : 'Every label on the checked uploads is printed',
        run: () => void pressBatches(checkedRows, true),
      },
      {
        id: 'print-every',
        label: `Print all ${every}`,
        icon: <RotateCcw />,
        disabled: every === 0 || print.isPending,
        disabledReason: print.isPending ? 'Printing…' : 'Check an upload',
        run: () => void pressBatches(checkedRows, false),
      },
    ];
  }, [checkedRows, print.isPending, pressBatches]);

  // ── The open batch ────────────────────────────────────────────────────────
  const labelFace = stationFace(stations.target.label, 'label');
  const paperFace = stationFace(stations.target.paper, 'paper');
  const reprint = checkedPages.some((page) => page.printCount > 0);
  // The batch's verbs in ONE row at the header's right edge. A one-label batch
  // has one print verb; "Print all 1" would repeat it.
  const recordActions = openBatch ? (
    <>
      {pages.length > 1 ? (
        <Button
          variant="secondary"
          size="sm"
          radius="control"
          icon={<RotateCcw />}
          disabled={print.isPending}
          onClick={() => press(batchPageDocuments(pages, false), true, reprintWarning(pages.map(pageFace)))}
          data-testid="batch-print-all"
        >
          Print all {pages.length}
        </Button>
      ) : null}
      <Button
        variant="ink"
        size="sm"
        radius="control"
        className={HOTKEY_SCRIM_HOST_CLASS}
        icon={reprint ? <RotateCcw /> : <Printer />}
        loading={print.isPending}
        disabled={checkedPages.length === 0}
        onClick={printChecked}
        aria-keyshortcuts="Enter"
        data-testid="batch-print"
      >
        {checkedPages.length === 0 ? 'Check a label' : `${reprint ? 'Reprint' : 'Print'} ${checkedPages.length}`}
        <HotkeyScrim keys={['Enter']} action={`Print checked labels → ${labelFace}`} />
      </Button>
    </>
  ) : undefined;


  const recordView = openBatch ? (
    <DeskRecordLayout
      main={
        <div className="flex min-w-0 flex-col gap-3">
          {detail.isPending ? (
            <p className="text-role-caption text-text-muted">Reading the labels…</p>
          ) : detail.isError ? (
            <p className="text-role-caption text-text-danger">{detail.error.message}</p>
          ) : (
            <BatchPages
              pages={pages}
              included={included}
              onInclude={(id, next) =>
                setIncluded((current) => {
                  const updated = new Set(current);
                  if (next) updated.add(id);
                  else updated.delete(id);
                  return updated;
                })
              }
              onPrintPage={printPage}
              printing={print.isPending}
            />
          )}
        </div>
      }
      aside={
        <div className="flex min-w-0 flex-col gap-4" data-testid="batch-rail">
          <RecordGroup title={`Packing slips · ${slipDocs.length}`} testId="batch-slips">
            <div className="flex flex-col gap-1.5 px-4 pb-3 pt-1">
              {slipDocs.length === 0 ? (
                <p className="text-role-caption text-text-muted">
                  {openBatch.pairedPages === 0 ? 'No label in this upload is on an order yet.' : 'The paired orders have no packing slips or manuals.'}
                </p>
              ) : (
                slipDocs.map((doc) => {
                  const order = paperwork.find((row) => row.orderId === doc.orderId);
                  return (
                    <label key={doc.key} className="flex min-w-0 items-center gap-2 text-role-caption">
                      <Checkbox
                        checked={slipsIncluded.has(doc.key)}
                        onCheckedChange={(next) =>
                          setSlipsIncluded((current) => {
                            const updated = new Set(current);
                            if (next === true) updated.add(doc.key);
                            else updated.delete(doc.key);
                            return updated;
                          })
                        }
                        aria-label={`Include ${doc.title}`}
                      />
                      <FileText className="size-4 shrink-0 text-text-muted" />
                      <span className="min-w-0 flex-1 truncate" title={doc.title}>
                        {order ? `${order.orderRef} · ` : ''}
                        {doc.title}
                      </span>
                    </label>
                  );
                })
              )}
              {slipDocs.length > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  radius="control"
                  icon={<Printer />}
                  disabled={checkedSlips.length === 0 || print.isPending}
                  onClick={() => press(checkedSlips, checkedSlips.some((doc) => paperwork.some((row) => row.documents.some((d) => d.key === doc.key && d.printCount > 0))))}
                  data-testid="batch-print-slips"
                >
                  Print {checkedSlips.length} → {paperFace}
                </Button>
              ) : null}
            </div>
          </RecordGroup>
          <PrintStationsCard port={stations} />
        </div>
      }
      className="p-4"
    />
  ) : null;

  const status = list.isError
    ? 'The uploads could not be read. It retries on its own.'
    : notice;
  const filtered = Boolean(query.trim() || from || to || statusFilter.size > 0);

  return (
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 flex-col', dragging && 'outline outline-2 -outline-offset-2 outline-mode-mark')}
      data-testid="labels-docs-desk"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setDragging(false);
        submit(event.dataTransfer.files);
      }}
    >
      <input
        ref={picker}
        className="sr-only"
        type="file"
        multiple
        accept="application/pdf"
        tabIndex={-1}
        aria-label="Label PDFs"
        onChange={(event) => {
          submit(event.target.files);
          event.target.value = '';
        }}
      />
      <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        record={{
          // The open card in the rail already names the file and its counts — the
          // header never repeats them (read by assistive tech only).
          title: <span className="sr-only">{openBatch?.fileName ?? 'Upload'}</span>,
          actions: recordActions,
          noun: DECL.noun.one,
          testId: 'batch-record',
          summary: null,
          view: recordView,
          strip: null,
          rail: 'open',
        }}
        summary={<IncomingStatusChips set={chipSet} />}
        bulk={<RecordActionStrip verbs={bulkVerbs} label="Checked upload actions" testId="batch-bulk" />}
        banner={
          status || uploads.items.length > 0 ? (
            <div className="flex shrink-0 flex-col gap-2 px-3 pb-1">
              {status ? (
                <p aria-live="polite" className="text-role-caption text-mode-muted" data-testid="labels-docs-status">
                  {status}
                </p>
              ) : null}
              <LabelUploadTray uploads={uploads} />
            </div>
          ) : null
        }
        searchEmpty={filtered ? <p className="text-role-caption text-text-muted">No upload matches this search or date range.</p> : null}
        allClear={
          <TriageAllClear
            title="No label PDFs uploaded yet"
            detail="Drop a PDF of labels anywhere here, or press ⌘O — every page becomes a label you can preview and print."
          />
        }
      />
    </div>
  );
}
