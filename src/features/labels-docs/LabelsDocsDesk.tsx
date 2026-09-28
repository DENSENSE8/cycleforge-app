'use client';

/**
 * Labels & docs — `/shipping/label-intake`. The sidebar views ARE the print
 * jobs, one station each (owner 2026-09-27), under bare keys 1 · 2 · 3:
 *
 *   Labels     every stored shipping label not yet printed   → label station · 4×6
 *   Paperwork  packing slips + manuals not yet printed        → paperwork station · letter
 *   Printed    the print history of both, newest first
 *
 * A view prints ONLY its own stock; the explicit "Print order (labels +
 * paperwork)" verb and the both-stocks bulk verbs still split by station.
 * Triage only: one job, so no Floor and no industrial face.
 *
 * The HOST of the desk family on the shared triage face ({@link TriageCardList}):
 * the Shipping desk frame and contextual sidebar own the title, the views
 * (`?view=`), Find (the desk store) and the header verbs (run through nav
 * intents). One fixed-width view: the cards are a narrow rail at the left, the
 * open order's documents fill the rest; the first card opens on arrival and
 * the rail always has one open (no ✕ — the record header ends in Print).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Printer, RotateCcw } from '@/components/Icons';
import { IncomingStatusChips, type IncomingStatusChipSet } from '@/components/receiving/incoming/IncomingStatusChips';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { TriageCardList, type TriageFeed, type TriageSelectionPort } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { Button } from '@/design-system/primitives';
import { HOTKEY_SCRIM_HOST_CLASS, HotkeyScrim } from '@/design-system/primitives/HotkeyScrim';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { usePrintStations } from '@/hooks/usePrintStations';
import type { GroupedRenderOrder } from '@/lib/group-rows';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { applyLabelIngestionHttp, LABEL_INGESTIONS_QUERY_KEY, retryLabelIngestionHttp } from '@/lib/label-ingestions/http-client';
import type { LabelPrintQueue, LabelPrintRow, LabelPrintView, PaperworkPrintRow } from '@/lib/label-prints/contracts';
import { currentPrintRoute } from '@/lib/label-prints/current-print-route';
import { fetchLabelPrintQueue, LABEL_PRINTS_QUERY_ROOT, labelPrintQueueKey } from '@/lib/label-prints/http-client';
import { printDocuments, type DeskDocument, type PrintOutcome } from '@/lib/label-prints/print-labels';
import type { PrintStock } from '@/lib/label-prints/print-route';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { useDeskSearch } from '@/lib/outbound/desk-search-store';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { readPrintStation } from '@/lib/print/print-station';
import { stationDocumentRef } from '@/lib/print/print-station-documents';
import { MAX_STATION_DOCUMENTS } from '@/lib/print/staff-print-bridge';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  LABEL_INTAKE_LABELS_VIEW,
  LABEL_INTAKE_PAPERWORK_VIEW,
  LABEL_INTAKE_PRINTED_VIEW,
  LABEL_PAIRING_KEYS,
  LABEL_PAIRING_PARAM,
  type LabelPairingKey,
} from '@/lib/triage/views/label-intake';
import { cn } from '@/utils/_cn';
import { planPress, marryByCardOrder, PRINT_STOCKS } from './desk-press';
import {
  deskBands,
  deskCardKey,
  deskCardModel,
  deskExactFind,
  deskPairingKey,
  deskRows,
  findDeskRows,
  labelDocuments,
  paperworkDocuments,
  unprintedPaperworkKeys,
  type DeskCardModel,
  type DeskRow,
} from './desk-rows';
import { DocumentStage } from './DocumentStage';
import { LabelCard } from './LabelCard';
import { LabelRecordCard } from './LabelRecordCard';
import { PairOrderCard } from './PairOrderCard';
import { PaperworkIntakeCard } from './PaperworkIntakeCard';
import { PrinterConnectCard } from './PrinterConnectCard';
import { PrintStationsCard, stationFace } from './PrintStationsCard';
import { CHANNEL_FACE } from './print-faces';
import { LabelUploadTray } from './upload/LabelUploadTray';
import { SlipUploadTray } from './upload/SlipUploadTray';
import { useLabelUploads } from './upload/use-label-uploads';
import { useSlipUploads } from './upload/use-slip-uploads';
import type { SlipCandidate } from './upload/slip-matching';
import { useDeskDocuments } from './use-desk-documents';
import { usePrintRoutes } from './use-print-routes';

const PRINT_VIEW_CHORD = 'mod+p';
const UPLOAD_CHORD = 'mod+o';
const PAIRING_LABEL: Record<LabelPairingKey, string> = { unpaired: 'No order', paired: 'Paired' };
const STOCK_WORD: Record<PrintStock, [string, string]> = { label: ['label', 'labels'], paper: ['paperwork doc', 'paperwork docs'] };
const DECLS = { labels: LABEL_INTAKE_LABELS_VIEW, paperwork: LABEL_INTAKE_PAPERWORK_VIEW, printed: LABEL_INTAKE_PRINTED_VIEW } as const;

const deskRowId = (row: DeskRow) => row.id;
const rowPairing = (row: DeskRow): readonly LabelPairingKey[] => [deskPairingKey(row)];
const count = (n: number, stock: PrintStock) => `${n} ${STOCK_WORD[stock][n === 1 ? 0 : 1]}`;

function readView(raw: string | null): LabelPrintView {
  return raw === 'paperwork' || raw === 'printed' ? raw : 'labels';
}

/** Paperwork a press takes for these rows: on Printed everything printable (a reprint), else what was never printed. */
function paperFor(rows: readonly PaperworkPrintRow[], reprint: boolean): DeskDocument[] {
  const { documents } = paperworkDocuments(rows);
  if (reprint) return documents;
  const fresh = unprintedPaperworkKeys(rows);
  return documents.filter((doc) => fresh.has(doc.key));
}

/** Enter on the open record prints — unless a control that owns Enter has focus. */
function ownsEnter(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return isEditableKeyTarget(target) || target.closest('button, a[href], [role="checkbox"], [role="switch"], [role="tab"], [role="option"]') != null;
}

interface PressResult {
  lines: string[];
}

export function LabelsDocsDesk() {
  const queryClient = useQueryClient();
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const apple = useApplePlatform();
  const labelPicker = useRef<HTMLInputElement>(null);
  const slipPicker = useRef<HTMLInputElement>(null);
  const { routes, refresh: refreshRoutes } = usePrintRoutes();
  const stations = usePrintStations();

  const view = readView(searchParams.get('view'));
  const decl = DECLS[view];
  // One view (owner 2026-09-27): the fixed-width rail + record — no In place /
  // Split choice. The frame's ⌘/Ctrl+Shift+S chord cannot move it off.
  const stage = useDeskStageOptional();
  const stageView = stage?.view;
  const setStageView = stage?.setView;
  useEffect(() => {
    if (stageView && stageView !== 'in-place') setStageView?.('in-place');
  }, [stageView, setStageView]);
  const [query, setQuery] = useDeskSearch(pathname);
  const cut = useTriageCut({ statusKeys: LABEL_PAIRING_KEYS, recordParams: decl.recordParams, statusParam: LABEL_PAIRING_PARAM });
  const { statusFilter, toggleStatus, resetStatus } = cut.url;
  const [notice, setNotice] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Labels + Paperwork are always read: the both-stocks verbs marry them, and
  // the slip matcher needs every order on the desk. Printed only when shown.
  const queueOptions = (which: LabelPrintView, enabled = true) => ({
    queryKey: labelPrintQueueKey(which),
    queryFn: () => fetchLabelPrintQueue(which),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    enabled,
  });
  const labelsQueue = useQuery(queueOptions('labels'));
  const paperworkQueue = useQuery(queueOptions('paperwork'));
  const printedQueue = useQuery(queueOptions('printed', view === 'printed'));
  const queue = view === 'labels' ? labelsQueue : view === 'paperwork' ? paperworkQueue : printedQueue;
  const counts = (queue.data ?? labelsQueue.data)?.counts ?? null;

  const rows = useMemo(() => deskRows(queue.data as LabelPrintQueue | undefined), [queue.data]);
  const found = useMemo(() => findDeskRows(rows, query), [rows, query]);
  const allBands = useMemo(() => deskBands(found), [found]);
  const { filterBands } = cut;
  const bands = useMemo(() => filterBands(allBands, deskCardKey, rowPairing), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);
  const cards = useMemo(() => bands.flatMap(([, groups]) => groups.map(deskCardModel)), [bands]);
  // Counts are CARDS (orders; an unpaired label is its own card) — what the rail paints and the bar selects.
  const foundGroups = useMemo(() => allBands.flatMap(([, groups]) => groups), [allBands]);
  const foundCount = foundGroups.length;
  const unpaired = useMemo(() => foundGroups.filter((group) => group.rows[0]?.orderId == null).length, [foundGroups]);

  // ── The open card: the first on arrival; the next one when it leaves the list ──
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => {
    if (openId != null && painted.some((row) => row.id === openId)) return;
    setOpenId(painted[0]?.id ?? null);
  }, [painted, openId]);
  const openCard = useMemo<DeskCardModel | null>(
    () => (openId == null ? null : (cards.find((card) => card.ids.includes(openId)) ?? null)),
    [cards, openId],
  );
  const openRow = useCallback((row: DeskRow) => setOpenId(row.id), []);
  // The rail always has an open card: Esc leaves a text field, never empties the pane.
  const keepOpen = useCallback(() => undefined, []);

  // J / K walk the CARDS: each card publishes its first row only.
  const cursorOrder = useMemo<GroupedRenderOrder<DeskRow>>(
    () => bands.map(([band, groups]) => [band, groups.map((group) => ({ key: group.key, rows: group.rows.slice(0, 1) }))] as const),
    [bands],
  );
  usePublishRecordCursor({
    surfaceId: 'labels-docs-rail',
    scope: 'record',
    enabled: true,
    order: cursorOrder,
    openId,
    getId: deskRowId,
    onOpen: openRow,
    onClose: keepOpen,
  });

  // ── The check-set (select-all = the visible page) ─────────────────────────
  const [checked, setChecked] = useState<ReadonlySet<number>>(() => new Set());
  const visibleIds = useRef<readonly number[]>([]);
  useEffect(() => setChecked(new Set()), [view]);
  const selection = useMemo<TriageSelectionPort<DeskRow>>(
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
  const checkedCards = useMemo(() => cards.filter((card) => card.ids.some((id) => checked.has(id))), [cards, checked]);

  // ── The open card's documents: which one is previewed, which are checked ──
  const docs = useDeskDocuments(openCard, view);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [included, setIncluded] = useState<ReadonlySet<string>>(new Set());
  const activeLabel = openCard?.labels.find((row) => activeKey === `label:${row.id}`) ?? openCard?.labels[0] ?? null;
  const seenKeys = useRef<{ cardKey: string | null; keys: Set<string> }>({ cardKey: null, keys: new Set() });
  const openKey = openCard?.key ?? null;
  const defaultTaken = useMemo(() => {
    // Paperwork takes what was never printed (all of it when everything was); every other view takes all.
    if (view !== 'paperwork' || !openCard) return null;
    const fresh = unprintedPaperworkKeys(openCard.paperwork);
    return fresh.size > 0 ? fresh : null;
  }, [view, openCard]);
  useEffect(() => {
    const fresh = seenKeys.current.cardKey !== openKey;
    if (fresh) {
      seenKeys.current = { cardKey: openKey, keys: new Set() };
      setActiveKey(docs.documents[0]?.key ?? null);
    }
    const added = docs.documents.filter((doc) => !seenKeys.current.keys.has(doc.key));
    if (!fresh && added.length === 0) return;
    for (const doc of added) seenKeys.current.keys.add(doc.key);
    setIncluded((current) => {
      const next = new Set(fresh ? [] : current);
      for (const doc of added) if (!defaultTaken || defaultTaken.has(doc.key)) next.add(doc.key);
      return next;
    });
  }, [docs.documents, openKey, defaultTaken]);
  const checkedDocs = useMemo(() => docs.documents.filter((doc) => included.has(doc.key)), [docs.documents, included]);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: LABEL_PRINTS_QUERY_ROOT }),
      // The ingestion ledger AND every label's print log (`['v1', 'label-ingestions', id, 'prints']`).
      queryClient.invalidateQueries({ queryKey: LABEL_INGESTIONS_QUERY_KEY }),
    ]);
  }, [queryClient]);

  // ── One press: split by stock, each stock to ITS station ────────────────
  const print = useMutation({
    mutationFn: async ({ documents, reprint }: { documents: DeskDocument[]; reprint: boolean }): Promise<PressResult> => {
      const plan = planPress(documents, stations.target, stations.blockedReason, MAX_STATION_DOCUMENTS);
      const total = plan.local.length + plan.remote.reduce((sum, job) => sum + job.documents.length, 0);
      let before = 0;
      const tick = (done: number) => setProgress({ done: before + done, total });
      setProgress({ done: 0, total });
      const lines: string[] = [];
      try {
        if (plan.local.length > 0) {
          const here = readPrintStation();
          const outcome = await printDocuments(plan.local, currentPrintRoute, {
            onProgress: (done) => tick(done),
            station: here.id ? { id: here.id, name: here.name } : null,
          });
          lines.push(...localLines(outcome, reprint));
          before += plan.local.length;
        }
        for (const job of plan.remote) {
          const acked = await stations.sendDocuments(job.station.stationId, job.stock, safeRandomUUID(), job.documents.flatMap((doc) => stationDocumentRef(doc) ?? []), (done) => tick(done));
          lines.push(
            acked
              ? `${count(job.documents.length, job.stock)} → ${job.station.stationName}`
              : `${job.station.stationName} did not answer — ${count(job.documents.length, job.stock)} not sent`,
          );
          before += job.documents.length;
        }
        for (const block of plan.blocked) lines.push(`${count(block.count, block.stock)} not sent — ${block.reason}`);
      } finally {
        refreshRoutes();
      }
      return { lines };
    },
    onSuccess: ({ lines }) => setNotice(lines.join(' · ') || 'Nothing printed.'),
    onError: (error) => setNotice(error instanceof Error ? error.message : 'Printing failed.'),
    onSettled: async () => {
      setProgress(null);
      await refresh();
    },
  });

  // ── Bulk print by stock (§3.2): the whole queue, or the painted cut of the view on screen ──
  const reprinting = view === 'printed';
  const labelQueueDocs = useCallback((): DeskDocument[] => {
    if (view === 'labels') return labelDocuments(cards.flatMap((card) => card.labels));
    return labelDocuments(labelsQueue.data?.view === 'labels' ? labelsQueue.data.rows : []);
  }, [view, cards, labelsQueue.data]);
  const paperQueueDocs = useCallback((): DeskDocument[] => {
    if (view === 'paperwork') return paperFor(cards.flatMap((card) => card.paperwork), false);
    return paperFor(paperworkQueue.data?.view === 'paperwork' ? paperworkQueue.data.rows : [], false);
  }, [view, cards, paperworkQueue.data]);
  const paperworkByOrder = useMemo(() => {
    const byOrder = new Map<number, PaperworkPrintRow>();
    if (paperworkQueue.data?.view === 'paperwork') for (const row of paperworkQueue.data.rows) byOrder.set(row.orderId, row);
    return byOrder;
  }, [paperworkQueue.data]);

  const pressAll = useCallback(
    (stocks: readonly PrintStock[]) => {
      if (print.isPending) return;
      const labels = stocks.includes('label') ? labelQueueDocs() : [];
      const paper = stocks.includes('paper') ? paperQueueDocs() : [];
      const documents = marryByCardOrder(labels, paper);
      if (documents.length === 0) {
        setNotice(stocks.length === 2 ? 'Nothing left to print.' : `No ${stocks[0] === 'label' ? 'labels' : 'paperwork'} left to print.`);
        return;
      }
      print.mutate({ documents, reprint: false });
    },
    [print, labelQueueDocs, paperQueueDocs],
  );
  const printViewStock = useCallback(() => {
    if (view === 'printed') {
      setNotice('Printed is the history. Enter reprints the open order’s checked documents.');
      return;
    }
    pressAll([view === 'labels' ? 'label' : 'paper']);
  }, [view, pressAll]);

  /** The checked cards' documents of these stocks, card order kept (Law 5: the same verbs at 1 and N). */
  const checkedDocsOf = useCallback(
    (stocks: readonly PrintStock[]): DeskDocument[] => {
      const labels = stocks.includes('label') ? labelDocuments(checkedCards.flatMap((card) => card.labels)) : [];
      const paperRows = stocks.includes('paper')
        ? checkedCards.flatMap((card) => {
            if (card.paperwork.length > 0) return card.paperwork;
            const orderId = card.lead.orderId;
            const queued = orderId != null ? paperworkByOrder.get(orderId) : undefined;
            return queued ? [queued] : [];
          })
        : [];
      return marryByCardOrder(labels, paperFor(paperRows, reprinting));
    },
    [checkedCards, paperworkByOrder, reprinting],
  );

  const printChecked = useCallback(() => {
    if (print.isPending || !openCard || checkedDocs.length === 0) return;
    print.mutate({ documents: checkedDocs, reprint: reprinting || openCard.labels.some((row) => row.printCount > 0) });
  }, [print, openCard, checkedDocs, reprinting]);

  const printOrder = useCallback(() => {
    if (print.isPending || !openCard) return;
    const documents = marryByCardOrder(labelDocuments(openCard.labels), docs.orderPaperwork);
    if (documents.length > 0) print.mutate({ documents, reprint: openCard.labels.some((row) => row.printCount > 0) });
  }, [print, openCard, docs.orderPaperwork]);

  // ── Uploads (§3.3): label PDFs (split per page) and packing slips (matched to orders) ──
  const labelUploads = useLabelUploads({ onSettled: refresh });
  const slipCandidates = useMemo<SlipCandidate[]>(() => {
    const byOrder = new Map<number, SlipCandidate>();
    const labelRows = labelsQueue.data?.view === 'labels' ? labelsQueue.data.rows : [];
    for (const row of labelRows) {
      if (row.orderId == null || !row.orderRef || byOrder.has(row.orderId)) continue;
      byOrder.set(row.orderId, { orderId: row.orderId, orderRef: row.orderRef, accountSource: row.orderAccountSource, refs: [row.orderRef] });
    }
    for (const row of paperworkByOrder.values()) {
      if (!byOrder.has(row.orderId)) byOrder.set(row.orderId, { orderId: row.orderId, orderRef: row.orderRef, accountSource: row.orderAccountSource, refs: [row.orderRef] });
    }
    return [...byOrder.values()];
  }, [labelsQueue.data, paperworkByOrder]);
  const slipUploads = useSlipUploads(slipCandidates, { onSettled: refresh });

  const submitLabels = useCallback(
    (list: FileList | null | undefined) => {
      const files = [...(list ?? [])];
      const pdfs = files.filter((file) => !file.type || file.type === 'application/pdf');
      if (pdfs.length < files.length) setNotice(`${files.length - pdfs.length} file(s) skipped — label uploads are PDFs.`);
      if (pdfs.length > 0) labelUploads.submit(pdfs);
    },
    [labelUploads],
  );
  const submitSlips = useCallback(
    (list: FileList | null | undefined) => {
      const files = [...(list ?? [])];
      if (files.length > 0) slipUploads.submit(files);
    },
    [slipUploads],
  );

  const ledgerAction = useMutation({
    mutationFn: ({ row, action }: { row: LabelPrintRow; action: 'apply' | 'retry' }) =>
      action === 'apply' ? applyLabelIngestionHttp(row.id, row.rowVersion) : retryLabelIngestionHttp(row.id).then(() => undefined),
    onSuccess: (_data, { action }) => setNotice(action === 'apply' ? 'Applied to packed units.' : 'Label reprocessed.'),
    onError: (error) => setNotice(error instanceof Error ? error.message : 'Request failed.'),
    onSettled: refresh,
  });

  // The desk header's verbs (the sidebar declares them; this body runs them).
  const openLabelPicker = useCallback(() => labelPicker.current?.click(), []);
  const openSlipPicker = useCallback(() => slipPicker.current?.click(), []);
  useNavIntent('labels-docs:print-labels', () => pressAll(['label']));
  useNavIntent('labels-docs:print-paperwork', () => pressAll(['paper']));
  useNavIntent('labels-docs:print-all', () => pressAll(['label', 'paper']));
  useNavIntent('labels-docs:upload', openLabelPicker);
  useNavIntent('labels-docs:upload-slips', openSlipPicker);

  useEffect(
    () =>
      registerShortcutOverviewGroup({
        id: 'labels-docs',
        title: 'Labels & docs',
        rows: [
          { keys: ['1'], label: 'Labels — 4×6 labels to print' },
          { keys: ['2'], label: 'Paperwork — packing slips + manuals to print' },
          { keys: ['3'], label: 'Printed — print history' },
          { keys: ['J', 'K'], label: 'Next / previous order' },
          { keys: ['Enter'], label: 'Print the open order’s checked documents' },
          { keys: chordKeys(PRINT_VIEW_CHORD, apple), label: 'Print all of this view (its own station)' },
          { keys: chordKeys(UPLOAD_CHORD, apple), label: 'Upload label PDFs' },
        ],
      }),
    [apple],
  );

  // ⌘/Ctrl P never reaches the browser's own print dialog here; Enter on the
  // open record (focus in its body, not on a control) prints it.
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
        printViewStock();
      } else if (key === 'o') {
        event.preventDefault();
        openLabelPicker();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [printViewStock, printChecked, openLabelPicker, openId]);

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    // A drop files the view's own stock: slips on Paperwork, label PDFs elsewhere.
    if (view === 'paperwork') submitSlips(event.dataTransfer.files);
    else submitLabels(event.dataTransfer.files);
  };

  // ── Face slots ────────────────────────────────────────────────────────────
  const family = useMemo(
    () =>
      triageFamily(decl, {
        rowId: deskRowId,
        groupKey: deskCardKey,
        cardModel: deskCardModel,
        exactFind: deskExactFind,
        renderCard: (props) => <LabelCard key={props.model.key} {...props} testIdPrefix={decl.testIdPrefix} />,
      }),
    [decl],
  );

  const feed = useMemo<TriageFeed<DeskRow>>(
    () => ({
      bands,
      allBands,
      painted,
      sectioned: false,
      total: foundCount,
      loading: queue.isPending,
      fetching: queue.isFetching,
      search: { value: query, pending: false },
      selection,
      open: { id: openId, open: openRow, close: keepOpen },
    }),
    [bands, allBands, painted, foundCount, queue.isPending, queue.isFetching, query, setQuery, selection, openId, openRow, keepOpen],
  );

  const chipSet = useMemo<IncomingStatusChipSet>(
    () => ({
      label: 'Filter by order pairing',
      disabledReason: null,
      onToggle: (id) => (id === 'all' ? resetStatus() : toggleStatus(id as LabelPairingKey)),
      chips: [
        { id: 'all', label: 'All', count: queue.isPending ? null : foundCount, tone: null, active: statusFilter.size === 0 },
        ...LABEL_PAIRING_KEYS.map((id) => ({
          id,
          label: PAIRING_LABEL[id],
          count: queue.isPending ? null : id === 'unpaired' ? unpaired : foundCount - unpaired,
          tone: id === 'unpaired' ? ('info' as const) : ('success' as const),
          active: statusFilter.has(id),
        })),
      ],
    }),
    [queue.isPending, foundCount, unpaired, statusFilter, resetStatus, toggleStatus],
  );

  const labelFace = stationFace(stations.target.label, 'label');
  const paperFace = stationFace(stations.target.paper, 'paper');
  const bulkVerbs = useMemo<RecordActionVerb[]>(() => {
    const labels = checkedDocsOf(['label']).length;
    const paper = checkedDocsOf(['paper']).length;
    const busy = print.isPending ? 'Printing…' : null;
    const verb = reprinting ? 'Reprint' : 'Print';
    return [
      {
        id: 'print-checked-labels',
        label: `${verb} ${count(labels, 'label')}`,
        icon: <Printer />,
        disabled: labels === 0 || print.isPending,
        disabledReason: busy ?? 'No labels on the checked orders',
        run: () => print.mutate({ documents: checkedDocsOf(['label']), reprint: reprinting }),
      },
      {
        id: 'print-checked-paperwork',
        label: `${verb} ${count(paper, 'paper')}`,
        icon: <Printer />,
        disabled: paper === 0 || print.isPending,
        disabledReason: busy ?? 'No paperwork left to print on the checked orders',
        run: () => print.mutate({ documents: checkedDocsOf(['paper']), reprint: reprinting }),
      },
      {
        id: 'print-checked-both',
        label: `${verb} both`,
        icon: <Layers />,
        disabled: labels + paper === 0 || print.isPending,
        disabledReason: busy ?? 'Nothing to print on the checked orders',
        run: () => print.mutate({ documents: checkedDocsOf(PRINT_STOCKS), reprint: reprinting }),
      },
    ];
  }, [checkedDocsOf, print, reprinting]);

  const reprint = reprinting || (openCard?.labels.some((row) => row.printCount > 0) ?? false);
  const checkedStocks = PRINT_STOCKS.filter((stock) => checkedDocs.some((doc) => doc.stock === stock));
  const printWhere = checkedStocks.map((stock) => (stock === 'label' ? `labels → ${labelFace}` : `paperwork → ${paperFace}`)).join(' · ');
  const recordActions = openCard ? (
    <Button
      variant="ink"
      size="sm"
      radius="control"
      className={HOTKEY_SCRIM_HOST_CLASS}
      icon={reprint ? <RotateCcw /> : <Printer />}
      loading={print.isPending}
      disabled={checkedDocs.length === 0}
      onClick={printChecked}
      aria-keyshortcuts="Enter"
      data-testid="labels-docs-print"
    >
      {checkedDocs.length === 0 ? 'Check a document' : `${reprint ? 'Reprint' : 'Print'} ${checkedDocs.length}`}
      <HotkeyScrim keys={['Enter']} action={printWhere ? `Print ${printWhere}` : 'Print checked documents'} />
    </Button>
  ) : undefined;

  const summaryFacts: [string, string][] = [
    ['Labels to print', counts ? String(counts.labels) : '–'],
    ['Paperwork to print', counts ? String(counts.paperwork) : '–'],
    ['Printed', counts ? String(counts.printed) : '–'],
    ['In this cut', String(cards.length)],
    ['Labels print to', labelFace],
    ['Paperwork prints to', paperFace],
  ];
  const summary = (
    <dl className="flex flex-col gap-1 px-4 py-4" data-testid="labels-docs-summary">
      {summaryFacts.map(([term, value]) => (
        <div key={term} className="grid grid-cols-[9rem_minmax(0,1fr)] items-baseline gap-x-2">
          <dt className={cn(RECORD_LABEL_CLASS, 'text-mode-faint')}>{term}</dt>
          <dd className="truncate text-role-caption tabular-nums text-mode-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );

  const status = progress
    ? `Printing ${progress.done} of ${progress.total}…`
    : queue.isError
      ? 'The print queue could not be read. It retries on its own.'
      : notice;

  const orderId = openCard?.lead.orderId ?? null;
  const recordView = openCard ? (
    <DeskRecordLayout
      main={
        <DocumentStage
          paired={orderId != null}
          state={docs}
          activeKey={activeKey}
          onActivate={setActiveKey}
          included={included}
          onInclude={(key, next) =>
            setIncluded((current) => {
              const updated = new Set(current);
              if (next) updated.add(key);
              else updated.delete(key);
              return updated;
            })
          }
        />
      }
      aside={
        <div className="flex min-w-0 flex-col gap-4" data-testid="print-rail">
          {view === 'labels' && orderId != null ? (
            <Button
              variant="secondary"
              size="sm"
              radius="control"
              icon={<Layers />}
              disabled={print.isPending || docs.loading}
              onClick={printOrder}
              data-testid="labels-docs-print-order"
            >
              Print order (labels + paperwork)
            </Button>
          ) : null}
          {orderId != null ? (
            <PaperworkIntakeCard key={orderId} orderId={orderId} orderRef={openCard.orderRef} onFiled={() => void refresh()} />
          ) : activeLabel ? (
            <PairOrderCard
              key={activeLabel.id}
              row={activeLabel}
              onPaired={(orderRef) => {
                setNotice(`Paired to ${orderRef ?? 'the order'} — its packing slip and manuals now ride with the label.`);
                void refresh();
              }}
            />
          ) : null}
          <PrintStationsCard port={stations} />
          <PrinterConnectCard routes={routes} onChanged={refreshRoutes} />
          {activeLabel ? (
            <LabelRecordCard row={activeLabel} actionRunning={ledgerAction.isPending} onAction={(row, action) => ledgerAction.mutate({ row, action })} />
          ) : null}
        </div>
      }
      className="p-4"
    />
  ) : null;

  const firstLabel = openCard?.labels[0] ?? null;
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
      onDrop={onDrop}
    >
      <input
        ref={labelPicker}
        className="sr-only"
        type="file"
        multiple
        accept="application/pdf"
        tabIndex={-1}
        aria-label="Label PDFs"
        onChange={(event) => {
          submitLabels(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={slipPicker}
        className="sr-only"
        type="file"
        multiple
        accept="application/pdf"
        tabIndex={-1}
        aria-label="Packing slip PDFs"
        onChange={(event) => {
          submitSlips(event.target.files);
          event.target.value = '';
        }}
      />
      <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        record={{
          title: openCard ? (openCard.orderRef ?? 'No order') : 'Order',
          subtitle: openCard
            ? openCard.labels.length > 1
              ? `${openCard.labels.length} labels`
              : firstLabel
                ? `${firstLabel.carrier ?? 'Label'} · ${firstLabel.trackingNumber ?? firstLabel.fileBasename}`
                : `${docs.documents.length} document${docs.documents.length === 1 ? '' : 's'}`
            : undefined,
          actions: recordActions,
          noun: decl.noun.one,
          testId: 'label-record',
          summary,
          view: recordView,
          strip: null,
          rail: true,
        }}
        summary={<IncomingStatusChips set={chipSet} face="cards" />}
        bulk={<RecordActionStrip verbs={bulkVerbs} label="Checked order actions" testId="labels-docs-bulk" />}
        banner={
          status || labelUploads.items.length > 0 || slipUploads.rows.length > 0 ? (
            <div className="flex shrink-0 flex-col gap-2 px-3 pb-1">
              {status ? (
                <p aria-live="polite" className="text-role-caption text-mode-muted" data-testid="labels-docs-status">
                  {status}
                </p>
              ) : null}
              <LabelUploadTray uploads={labelUploads} />
              <SlipUploadTray uploads={slipUploads} candidates={slipCandidates} />
            </div>
          ) : null
        }
        searchEmpty={query.trim() || statusFilter.size > 0 ? <p className="text-role-caption text-text-muted">No order matches this cut.</p> : null}
        allClear={
          <TriageAllClear
            title={view === 'labels' ? 'Every stored label is printed' : view === 'paperwork' ? 'Every slip and manual is printed' : 'Nothing printed yet'}
            detail={
              view === 'labels'
                ? 'Upload or drop label PDFs to add more.'
                : view === 'paperwork'
                  ? 'Drop packing slip PDFs here — they are matched to their orders before filing.'
                  : 'Prints land here with the station they went to.'
            }
          />
        }
      />
    </div>
  );
}

/** What the local run did, per stock, naming this computer's route. */
function localLines(outcome: PrintOutcome, reprint: boolean): string[] {
  const lines: string[] = [];
  for (const stock of PRINT_STOCKS) {
    const route = outcome.routes[stock];
    const n = outcome.printed.filter((doc) => doc.stock === stock).length;
    if (!route || n === 0) continue;
    lines.push(
      route.channel === 'BROWSER_DIALOG'
        ? `${count(n, stock)} → print dialog`
        : `${reprint ? 'Reprinted' : 'Printed'} ${count(n, stock)} · ${CHANNEL_FACE[route.channel]}${route.printerName ? ` · ${route.printerName}` : ''}`,
    );
  }
  const first = outcome.failed[0];
  if (first) lines.push(`${outcome.failed.length} failed — ${first.doc.title}: ${first.reason}`);
  if (outcome.logError) lines.push(`not logged: ${outcome.logError}`);
  return lines;
}
