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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Printer, RotateCcw, Trash2 } from '@/components/Icons';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { requestConfirm } from '@/design-system/components/confirm';
import { TriageCardList, type TriageFeed, type TriageSelectionPort } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { Button, Checkbox } from '@/design-system/primitives';
import { usePrintStations } from '@/hooks/usePrintStations';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import type { LabelBatchPage, LabelBatchRow } from '@/lib/label-batches/contracts';
import { deleteLabelBatch, fetchLabelBatch, fetchLabelBatches, LABEL_BATCHES_QUERY_ROOT, labelBatchesKey, labelBatchKey } from '@/lib/label-batches/http-client';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import type { OutboundDocument } from '@/lib/documents/types';
import { fetchUnlinkedDocuments, unlinkedDocumentsKey, uploadBulkPaperwork } from '@/lib/documents/unlinked-client';
import { deleteDocument } from '@/lib/orders/order-paperwork-client';
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
import { DocumentStage } from './DocumentStage';
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
const rowPrinting = (row: LabelBatchRow): readonly LabelBatchPrintingKey[] => [batchPrintingKey(row)];
/**
 * `batch` is a positive-integer route param. Keep bulk-paper document rows in
 * a disjoint, URL-safe range instead of negative synthetic ids (which the
 * route contract correctly removes before the card can open).
 */
const BULK_PAPERWORK_ROW_BASE = 8_000_000_000_000_000;
const bulkPaperworkRowId = (documentId: number) => BULK_PAPERWORK_ROW_BASE + documentId;
const isBulkPaperworkRowId = (rowId: number) => rowId >= BULK_PAPERWORK_ROW_BASE;

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
  const paperPicker = useRef<HTMLInputElement>(null);
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
  const bulkPaperwork = useQuery({
    queryKey: unlinkedDocumentsKey('packing_slip'),
    queryFn: () => fetchUnlinkedDocuments('packing_slip'),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const paperworkBySyntheticId = useMemo(
    () => new Map((bulkPaperwork.data?.documents ?? []).map((document) => [bulkPaperworkRowId(document.id), document])),
    [bulkPaperwork.data],
  );
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const papers = (bulkPaperwork.data?.documents ?? [])
      .filter((document) => !needle || (document.data.filename ?? '').toLowerCase().includes(needle))
      .map((document): LabelBatchRow => ({
        id: bulkPaperworkRowId(document.id),
        fileName: document.data.filename || `Paperwork ${document.id}`,
        sha256: document.data.sha256Hex ?? `document:${document.id}`,
        pageCount: 1,
        byteSize: document.data.fileSizeBytes ?? 0,
        uploadedAt: document.createdAt,
        uploadedBy: null,
        printedPages: 0,
        printCount: 0,
        lastPrintedAt: null,
        pairedPages: 0,
        confirmPages: 0,
      }));
    return [...(list.data?.rows ?? []), ...papers].sort(
      (a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt),
    );
  }, [bulkPaperwork.data, list.data, query]);
  const cut = useTriageCut({ statusKeys: LABEL_BATCH_PRINTING_KEYS, recordParams: DECL.recordParams, statusParam: LABEL_BATCH_PRINTING_PARAM });
  const { statusFilter } = cut.url;
  const allBands = useMemo(() => batchBands(rows), [rows]);
  const { filterBands } = cut;
  const bands = useMemo(() => filterBands(allBands, batchCardKey, rowPrinting), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

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
  const openPaperwork = openId == null ? null : (paperworkBySyntheticId.get(openId) ?? null);

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
    enabled: openId != null && !isBulkPaperworkRowId(openId),
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
  const paperDocument = useCallback((document: OutboundDocument): DeskDocument => ({
    key: `doc:${document.id}`,
    kind: 'packing_slip',
    title: document.data.filename || 'Packing slip',
    associationLabel: 'Bulk · no order',
    src: `/api/documents/${document.id}/content`,
    stock: 'paper',
    ingestionId: null,
    orderId: null,
    documentId: document.id,
    manualId: null,
  }), []);

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
    () => {
      if (openPaperwork) {
        press([paperDocument(openPaperwork)], false);
        return;
      }
      press(batchPageDocuments(checkedPages, false), checkedPages.some((page) => page.printCount > 0), reprintWarning(checkedPages.map(pageFace)));
    },
    [openPaperwork, paperDocument, press, checkedPages],
  );
  // A page's own Print / Reprint button is an explicit choice — it never asks.
  const printPage = useCallback((page: LabelBatchPage) => press(batchPageDocuments([page], false), page.printCount > 0), [press]);

  // ── The check-set (whole batches): their unprinted labels, or every label ──
  const [checked, setChecked] = useState<ReadonlySet<number>>(() => new Set());
  const visibleIds = useRef<readonly number[]>([]);
  // Shift-click checks the RANGE of painted batches from the last plain check to this one.
  const anchorId = useRef<number | null>(null);
  const selection = useMemo<TriageSelectionPort<LabelBatchRow>>(
    () => ({
      ids: checked,
      toggle: (row, event) => {
        const ids = painted.map(batchRowId);
        const from = event.shiftKey && anchorId.current != null ? ids.indexOf(anchorId.current) : -1;
        const to = ids.indexOf(row.id);
        if (from >= 0 && to >= 0) {
          const range = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
          setChecked((current) => new Set([...current, ...range]));
          return;
        }
        anchorId.current = row.id;
        setChecked((current) => {
          const next = new Set(current);
          if (next.has(row.id)) next.delete(row.id);
          else next.add(row.id);
          return next;
        });
      },
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
    [checked, painted],
  );
  const checkedRows = useMemo(() => painted.filter((row) => checked.has(row.id)), [painted, checked]);
  const pressBatches = useCallback(
    async (batches: readonly LabelBatchRow[], onlyUnprinted: boolean) => {
      if (print.isPending || batches.length === 0) return;
      const labelBatches = batches.filter((row) => !isBulkPaperworkRowId(row.id));
      const paperDocuments = batches.flatMap((row) => {
        const document = paperworkBySyntheticId.get(row.id);
        return document ? [paperDocument(document)] : [];
      });
      // One read per batch (cached when already open), then ONE press in list order.
      const details = await Promise.all(
        labelBatches.map((row) => queryClient.fetchQuery({ queryKey: labelBatchKey(row.id), queryFn: () => fetchLabelBatch(row.id) })),
      );
      const faces = onlyUnprinted ? [] : details.flatMap((one) => one.pages.map((page) => ({ ...pageFace(page), name: `${one.batch.fileName} · page ${page.pageNumber}` })));
      press(
        [...details.flatMap((one) => batchPageDocuments(one.pages, onlyUnprinted)), ...paperDocuments],
        !onlyUnprinted,
        reprintWarning(faces),
      );
    },
    [paperDocument, paperworkBySyntheticId, press, print.isPending, queryClient],
  );

  // ── Uploads: one PDF = one batch; a landed file opens ──
  const uploads = useLabelUploads({ onSettled: refresh, onUploaded: setOpenId, matchOrder: false });
  const paperworkUpload = useMutation({
    mutationFn: uploadBulkPaperwork,
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: unlinkedDocumentsKey('packing_slip') });
      setOpenId(bulkPaperworkRowId(document.id));
      setNotice(`Uploaded ${document.data.filename || 'paperwork'} with no order identity.`);
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'Paperwork upload failed.'),
  });
  const deleteOpenPaperwork = useMutation({
    mutationFn: (documentId: number) => deleteDocument(documentId),
    onSuccess: async () => {
      setOpenId(null);
      await queryClient.invalidateQueries({ queryKey: unlinkedDocumentsKey('packing_slip') });
      setNotice('Bulk paperwork deleted.');
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'Could not delete bulk paperwork.'),
  });
  const deleteOpenBatch = useMutation({
    mutationFn: deleteLabelBatch,
    onSuccess: async () => {
      setOpenId(null);
      await queryClient.invalidateQueries({ queryKey: LABEL_BATCHES_QUERY_ROOT });
      setNotice('Bulk label upload deleted.');
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'Could not delete the label upload.'),
  });
  const submit = useCallback(
    (list: FileList | null | undefined) => {
      const files = [...(list ?? [])];
      if (files.length > 0) uploads.submit(files);
    },
    [uploads],
  );
  const openPicker = useCallback(() => picker.current?.click(), []);
  const openPaperPicker = useCallback(() => paperPicker.current?.click(), []);
  const printOpenUnprinted = useCallback(() => {
    if (openPaperwork) press([paperDocument(openPaperwork)], false);
    else if (openBatch) press(batchPageDocuments(pages, true), false);
    else if (checkedRows.length > 0) void pressBatches(checkedRows, true);
    else setNotice('Open or check an upload to print its labels.');
  }, [openBatch, openPaperwork, paperDocument, press, pages, checkedRows, pressBatches, setNotice]);
  const printAllLabels = useCallback(() => {
    const labelRows = rows.filter((row) => !isBulkPaperworkRowId(row.id));
    if (labelRows.length > 0) void pressBatches(labelRows, true);
    else setNotice('No bulk labels to print.');
  }, [pressBatches, rows, setNotice]);
  const printAllPaperwork = useCallback(() => {
    const documents = [...paperworkBySyntheticId.values()].map(paperDocument);
    if (documents.length > 0) press(documents, false);
    else setNotice('No bulk paperwork to print.');
  }, [paperDocument, paperworkBySyntheticId, press, setNotice]);
  const printAllStock = useCallback(() => {
    if (rows.length > 0) void pressBatches(rows, true);
    else setNotice('No bulk files to print.');
  }, [pressBatches, rows, setNotice]);
  useNavIntent('labels-docs:upload', openPicker);
  useNavIntent('labels-docs:upload-slips', openPaperPicker);
  useNavIntent('labels-docs:print-labels', printAllLabels);
  useNavIntent('labels-docs:print-paperwork', printAllPaperwork);
  useNavIntent('labels-docs:print-all', printAllStock);

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
      total: rows.length,
      loading: list.isPending || bulkPaperwork.isPending,
      fetching: list.isFetching || bulkPaperwork.isFetching,
      search: { value: query, onChange: setQuery, pending: (list.isFetching || bulkPaperwork.isFetching) && query.trim() !== '' },
      selection,
      open: { id: openId, open: openRow, close: closeBatch },
    }),
    [bands, allBands, bulkPaperwork.isFetching, bulkPaperwork.isPending, list.isFetching, list.isPending, painted, query, rows.length, selection, openId, openRow, closeBatch],
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
  const paperFace = stationFace(stations.target.paper, 'paper');
  const reprint = checkedPages.some((page) => page.printCount > 0);
  const openPaperDoc = openPaperwork ? paperDocument(openPaperwork) : null;
  const paperState = openPaperwork && openPaperDoc ? {
    documents: [openPaperDoc],
    linkedDocuments: [openPaperwork],
    unprintable: [],
    orderPaperwork: [],
    loading: false,
    error: null,
  } : null;
  // The batch's verbs in ONE row at the header's right edge. A one-label batch
  // has one print verb; "Print all 1" would repeat it.
  const recordActions = openPaperwork && openPaperDoc ? (
    <RecordActionStrip
      face="inline"
      label={`${openPaperDoc.title} actions`}
      testId="bulk-paper-actions"
      verbs={[
        {
          id: 'print',
          label: 'Print paperwork',
          icon: <Printer />,
          disabled: print.isPending,
          disabledReason: 'Printing…',
          run: () => press([openPaperDoc], false),
        },
        {
          id: 'delete',
          label: 'Delete file',
          icon: <Trash2 />,
          tone: 'danger',
          disabled: deleteOpenPaperwork.isPending,
          disabledReason: 'Deleting…',
          run: () => deleteOpenPaperwork.mutate(openPaperwork.id),
        },
      ]}
    />
  ) : openBatch ? (
    <RecordActionStrip
      face="inline"
      label={`${openBatch.fileName} actions`}
      testId="bulk-label-actions"
      verbs={[
        ...(pages.length > 1 ? [{
          id: 'print-all',
          label: `Print all ${pages.length}`,
          icon: <RotateCcw />,
          disabled: print.isPending,
          disabledReason: 'Printing…',
          run: () => press(batchPageDocuments(pages, false), true, reprintWarning(pages.map(pageFace))),
        } satisfies RecordActionVerb] : []),
        {
          id: 'print-checked',
          label: checkedPages.length === 0 ? 'Check a label' : `${reprint ? 'Reprint' : 'Print'} ${checkedPages.length}`,
          icon: reprint ? <RotateCcw /> : <Printer />,
          disabled: checkedPages.length === 0 || print.isPending,
          disabledReason: print.isPending ? 'Printing…' : 'Check a label first',
          run: printChecked,
        },
        {
          id: 'delete',
          label: 'Delete upload',
          icon: <Trash2 />,
          tone: 'danger',
          disabled: deleteOpenBatch.isPending,
          disabledReason: 'Deleting…',
          run: async () => {
            const confirmed = await requestConfirm({
              title: 'Delete this bulk label upload?',
              description: 'Every still-unlinked page and its stored bytes will be deleted.',
              confirmLabel: 'Delete upload',
              cancelLabel: 'Cancel',
              tone: 'danger',
            });
            if (confirmed) deleteOpenBatch.mutate(openBatch.id);
          },
        },
      ]}
    />
  ) : undefined;


  const recordView = openPaperwork && openPaperDoc && paperState ? (
    <DeskRecordLayout
      main={
        <DocumentStage
          paired={false}
          state={paperState}
          activeKey={openPaperDoc.key}
          onActivate={() => undefined}
          included={new Set([openPaperDoc.key])}
          onInclude={() => undefined}
        />
      }
      aside={
        <div className="flex min-w-0 flex-col gap-4" data-testid="bulk-paper-rail">
          <RecordGroup title="Bulk file">
            <div className="flex flex-col gap-1 px-4 pb-3 pt-1 text-role-caption text-text-muted">
              <span>{openPaperDoc.title}</span>
              <span>Letter stock · no order identity</span>
            </div>
          </RecordGroup>
          <PrintStationsCard port={stations} />
        </div>
      }
      className="p-4"
    />
  ) : openBatch ? (
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
      <input
        ref={paperPicker}
        className="sr-only"
        type="file"
        multiple
        accept="application/pdf,image/png,image/jpeg"
        tabIndex={-1}
        aria-label="Bulk paperwork files"
        onChange={(event) => {
          for (const file of [...(event.target.files ?? [])]) paperworkUpload.mutate(file);
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
          title: <span className="sr-only">{openBatch?.fileName ?? 'Bulk file'}</span>,
          actions: recordActions,
          noun: 'file',
          testId: 'batch-record',
          summary: null,
          view: recordView,
          strip: null,
          rail: 'open',
        }}
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
            title="No bulk files uploaded yet"
            detail="Upload labels or paperwork here. Bulk files keep no order, marketplace, or item identity."
          />
        }
      />
    </div>
  );
}
