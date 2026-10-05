'use client';

/**
 * Labels & docs — `/shipping/label-intake`. The sidebar views, under bare
 * keys 1 · 2 · 3:
 *
 *   Bulk            (bare) files/pages with no order identity
 *   Shipping labels Allocate orders + their complete linked document file
 *   Packing slips   Allocate orders + their complete linked document file
 *
 * A print-job view prints ONLY its own stock; the explicit "Print order
 * (labels + paperwork)" verb and the both-stocks bulk verbs still split by
 * station. Triage only: one job and one readable face.
 *
 * The HOST of the desk family on the shared triage face ({@link TriageCardList}):
 * the Shipping desk frame and contextual sidebar own the title, the views
 * (`?view=`), Find (the desk store) and the header verbs (run through nav
 * intents). One fixed-width view (owner 2026-09-27): the cards are a narrow
 * rail at the left, the open order's documents fill the rest; the first card
 * opens on arrival and the rail always has one open (no ✕ — the record header
 * ends in Print). Uploads alone starts as a lone list (owner 2026-09-28).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, Link2, Printer, RefreshCw, RotateCcw, Trash2, Truck, Upload, X } from '@/components/Icons';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { requestConfirm } from '@/design-system/components/confirm';
import { TriageCardList, type TriageFeed, type TriageSelectionPort } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { Button } from '@/design-system/primitives';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { usePrintStations } from '@/hooks/usePrintStations';
import type { GroupedRenderOrder } from '@/lib/group-rows';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { applyLabelIngestionHttp, confirmLabelOrderHttp, retryLabelIngestionHttp } from '@/lib/label-ingestions/http-client';
import type { OutboundDocument } from '@/lib/documents/types';
import type { LabelPrintQueue, LabelPrintRow, LabelPrintView, PaperworkPrintRow } from '@/lib/label-prints/contracts';
import { fetchLabelPrintQueue, labelPrintQueueKey } from '@/lib/label-prints/http-client';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import { fetchAllocateOrdersData } from '@/lib/outbound/outbound-table-data';
import { fetchUnlinkedDocuments, removeUnlinkedDocuments, unlinkedDocumentsKey } from '@/lib/documents/unlinked-client';
import { deleteDocument, orderDocumentsKey, pairStoredOrderDocument, useOrderPaperworkActions } from '@/lib/orders/order-paperwork-client';
import type { PrintStock } from '@/lib/label-prints/print-route';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { useDeskSearch } from '@/lib/outbound/desk-search-store';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import {
  LABEL_INTAKE_LABELS_VIEW,
  LABEL_INTAKE_PAPERWORK_VIEW,
  LABEL_PAIRING_KEYS,
  LABEL_PAIRING_PARAM,
  type LabelPairingKey,
} from '@/lib/triage/views/label-intake';
import { cn } from '@/utils/_cn';
import { marryByCardOrder, PRINT_STOCKS } from './desk-press';
import { LabelBatchesDesk } from './LabelBatchesDesk';
import { LabelBuyCard } from './buy/LabelBuyCard';
import { reprintWarning, stockCount, useDeskPress, type PrintedLabelFace } from './use-desk-press';
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
import { LabelUploadTray } from './upload/LabelUploadTray';
import { SlipUploadTray } from './upload/SlipUploadTray';
import { useLabelUploads } from './upload/use-label-uploads';
import { useSlipUploads } from './upload/use-slip-uploads';
import type { SlipCandidate } from './upload/slip-matching';
import { useDeskDocuments } from './use-desk-documents';
import { usePrintRoutes } from './use-print-routes';

const PRINT_VIEW_CHORD = 'mod+p';
const UPLOAD_CHORD = 'mod+o';
const DECLS = { labels: LABEL_INTAKE_LABELS_VIEW, paperwork: LABEL_INTAKE_PAPERWORK_VIEW } as const;
type OrderDocumentView = keyof typeof DECLS;

const deskRowId = (row: DeskRow) => row.id;
const rowPairing = (row: DeskRow): readonly LabelPairingKey[] => [deskPairingKey(row)];

/** Uploads is the bare route; the print-job views ride `?view=`. */
function readDeskView(raw: string | null): 'uploads' | OrderDocumentView {
  return raw === 'labels' || raw === 'paperwork' ? raw : 'uploads';
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

/**
 * The desk: Uploads (the bare route — one card per uploaded PDF) or one of the
 * print-job views. `?view=` picks; the sidebar owns the switch.
 */
export function LabelsDocsDesk() {
  const searchParams = useSearchParams();
  const view = readDeskView(searchParams.get('view'));
  // `?buy=1` — the Buy a label compose record (owner 2026-10-01, replaces the
  // old `/shipping/buy-label` focus page; the rail stays the labels display).
  return view === 'uploads' ? <LabelBatchesDesk /> : <PrintQueueDesk view={view} buyOpen={searchParams.get('buy') === '1'} />;
}

function PrintQueueDesk({ view, buyOpen }: { view: OrderDocumentView; buyOpen: boolean }) {
  const queryClient = useQueryClient();
  const pathname = usePathname() || '/';
  const router = useRouter();
  const apple = useApplePlatform();
  const labelPicker = useRef<HTMLInputElement>(null);
  const slipPicker = useRef<HTMLInputElement>(null);
  const replacementPicker = useRef<HTMLInputElement>(null);
  const replacementSourceDocument = useRef<OutboundDocument | null>(null);
  const { routes, refresh: refreshRoutes } = usePrintRoutes();
  const stations = usePrintStations();

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
  const { statusFilter } = cut.url;
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
  const queue = view === 'labels' ? labelsQueue : paperworkQueue;
  const counts = (queue.data ?? labelsQueue.data)?.counts ?? null;

  const allocateOrders = useQuery({
    queryKey: ['fbm', 'allocate-orders', 'labels-docs'],
    queryFn: fetchAllocateOrdersData,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const rows = useMemo(() => {
    const queued = deskRows(queue.data as LabelPrintQueue | undefined).filter((row) => row.orderId != null);
    const queuedOrderRefs = new Set(queued.flatMap((row) => (row.orderRef ? [row.orderRef] : [])));
    const byOrder = new Map<string, NonNullable<typeof allocateOrders.data>>();
    for (const order of allocateOrders.data ?? []) {
      const ref = order.order_id?.trim() || String(order.id);
      const existing = byOrder.get(ref) ?? [];
      existing.push(order);
      byOrder.set(ref, existing);
    }
    const allocateRows: DeskRow[] = [];
    for (const [orderRef, lines] of byOrder) {
      if (queuedOrderRefs.has(orderRef)) continue;
      const lead = lines[0]!;
      allocateRows.push({
        id: -lead.id,
        label: null,
        paperwork: null,
        orderId: lead.id,
        orderRef,
        accountSource: lead.account_source,
        lines: lines.map((line) => ({
          orderLineId: line.id,
          itemNumber: line.item_number?.trim() || null,
          skuCatalogId: line.sku_catalog_id ?? null,
          sku: line.sku?.trim() || null,
          title: line.product_title?.trim() || line.sku?.trim() || 'Untitled item',
          quantity: Number.parseInt(line.quantity ?? '1', 10) || 1,
        })),
        lastPrintedAt: null,
      });
    }
    return [...queued, ...allocateRows];
  }, [allocateOrders.data, queue.data, view]);
  const found = useMemo(() => findDeskRows(rows, query), [rows, query]);
  const allBands = useMemo(() => deskBands(found), [found]);
  const { filterBands } = cut;
  const bands = useMemo(() => filterBands(allBands, deskCardKey, rowPairing), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);
  const cards = useMemo(() => bands.flatMap(([, groups]) => groups.map(deskCardModel)), [bands]);
  // Counts are CARDS (orders; an unpaired label is its own card) — what the rail paints and the bar selects.
  const foundGroups = useMemo(() => allBands.flatMap(([, groups]) => groups), [allBands]);
  const foundCount = foundGroups.length;

  // ── The open card: the first on arrival; the next one when it leaves the list ──
  // The first card opens on arrival; the next one when it leaves the list (owner 2026-09-27).
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
  // Shift-click checks the RANGE of painted rows from the last plain check to this one.
  const anchorId = useRef<number | null>(null);
  useEffect(() => setChecked(new Set()), [view]);
  const selection = useMemo<TriageSelectionPort<DeskRow>>(
    () => ({
      ids: checked,
      toggle: (row, event) => {
        const ids = painted.map(deskRowId);
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

  const { print, notice, setNotice, refresh } = useDeskPress(stations, refreshRoutes);
  const selectedOrderId = openCard?.lead.orderId ?? 0;
  const selectedOrderRef = openCard?.orderRef ?? String(selectedOrderId || '');
  const paperworkActions = useOrderPaperworkActions(selectedOrderId, selectedOrderRef, () => void refresh());
  const documentType = view === 'labels' ? 'shipping_label' as const : 'packing_slip' as const;
  const unlinked = useQuery({
    queryKey: unlinkedDocumentsKey(documentType),
    queryFn: () => fetchUnlinkedDocuments(documentType),
    enabled: true,
    staleTime: 15_000,
  });
  const activeFace = docs.documents.find((doc) => doc.key === activeKey) ?? docs.documents[0] ?? null;
  const activeDocument = activeFace?.documentId == null
    ? null
    : (docs.linkedDocuments.find((document) => document.id === activeFace.documentId) ?? null);
  const refreshFiles = useCallback(async () => {
    if (selectedOrderId > 0) {
      await queryClient.invalidateQueries({ queryKey: orderDocumentsKey(selectedOrderId) });
    }
    await queryClient.invalidateQueries({ queryKey: unlinkedDocumentsKey(documentType) });
    await refresh();
  }, [documentType, queryClient, refresh, selectedOrderId]);
  const pairStored = useMutation({
    mutationFn: async (target: { kind: 'document'; id: number } | { kind: 'ingestion'; id: number; rowVersion: number }) => {
      if (selectedOrderId <= 0) throw new Error('Select an Allocate order first.');
      if (target.kind === 'document') {
        const document = unlinked.data?.documents.find((candidate) => candidate.id === target.id);
        if (!document) throw new Error('That stored document is no longer unlinked.');
        await pairStoredOrderDocument(selectedOrderId, document);
        return;
      }
      const paired = await confirmLabelOrderHttp(target.id, selectedOrderId, target.rowVersion);
      await applyLabelIngestionHttp(paired.ingestion.id, paired.ingestion.rowVersion);
    },
    onSuccess: async () => {
      setNotice('Paired to the selected order without uploading the bytes again.');
      await refreshFiles();
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'Could not pair the stored document.'),
  });
  const removeUnlinked = useMutation({
    mutationFn: () => removeUnlinkedDocuments(documentType),
    onSuccess: async (result) => {
      const total = result.deletedDocumentIds.length + result.deletedIngestionIds.length;
      setNotice(`Removed ${total} unlinked ${total === 1 ? 'row' : 'rows'}. Linked order documents were kept.`);
      await refreshFiles();
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'Could not remove unlinked documents.'),
  });
  // Every label this desk has read, by ingestion id — the reprint warning names what a press would print again.
  const labelsById = useMemo(() => {
    const byId = new Map<number, LabelPrintRow>();
    for (const row of rows) if (row.label) byId.set(row.label.id, row.label);
    if (labelsQueue.data?.view === 'labels') for (const row of labelsQueue.data.rows) byId.set(row.id, row);
    return byId;
  }, [rows, labelsQueue.data]);
  const warnFor = useCallback(
    (documents: readonly DeskDocument[]) =>
      reprintWarning(
        documents.flatMap((doc): PrintedLabelFace[] => {
          const row = doc.ingestionId != null ? labelsById.get(doc.ingestionId) : undefined;
          if (!row) return [];
          const name = row.orderId != null && row.orderRef ? `Order ${row.orderRef}’s label` : `Label ${row.trackingNumber ?? row.fileBasename}`;
          return [{ name, printCount: row.printCount, lastPrintedAt: row.lastPrintedAt, lastPrintedBy: row.lastPrintedBy, lastStationName: row.lastStationName }];
        }),
      ),
    [labelsById],
  );

  // ── Bulk print by stock (§3.2): the whole queue, or the painted cut of the view on screen ──
  const reprinting = false;
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
      print.mutate({ documents, reprint: false, confirm: warnFor(documents) });
    },
    [print, labelQueueDocs, paperQueueDocs, warnFor],
  );
  const printViewStock = useCallback(() => {
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
    print.mutate({ documents: checkedDocs, reprint: reprinting || openCard.labels.some((row) => row.printCount > 0), confirm: warnFor(checkedDocs) });
  }, [print, openCard, checkedDocs, reprinting, warnFor]);

  const printOrder = useCallback(() => {
    if (print.isPending || !openCard) return;
    const documents = marryByCardOrder(labelDocuments(openCard.labels), docs.orderPaperwork);
    if (documents.length > 0) print.mutate({ documents, reprint: openCard.labels.some((row) => row.printCount > 0), confirm: warnFor(documents) });
  }, [print, openCard, docs.orderPaperwork, warnFor]);

  // ── Uploads (§3.3): label PDFs (split per page) and packing slips (matched to orders) ──
  const labelUploads = useLabelUploads({
    onSettled: refresh,
    targetOrderId: selectedOrderId > 0 ? selectedOrderId : undefined,
    targetOrderRef: selectedOrderRef || undefined,
  });
  const replacementLabelUploads = useLabelUploads({
    onSettled: refreshFiles,
    targetOrderId: selectedOrderId > 0 ? selectedOrderId : undefined,
    targetOrderRef: selectedOrderRef || undefined,
    onApplied: async () => {
      const replaced = replacementSourceDocument.current;
      if (!replaced) return;
      await deleteDocument(replaced.id);
      replacementSourceDocument.current = null;
      setNotice('Replacement label applied. The previous ingestion and document were removed.');
    },
  });
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
      if (pdfs.length > 0) {
        labelUploads.submit(pdfs);
      }
    },
    [labelUploads],
  );
  const submitSlips = useCallback(
    (list: FileList | null | undefined) => {
      const files = [...(list ?? [])];
      if (selectedOrderId > 0) {
        for (const file of files) paperworkActions.upload.mutate({ kind: 'packing_slip', file });
      } else if (files.length > 0) {
        slipUploads.submit(files);
      }
    },
    [paperworkActions.upload, selectedOrderId, slipUploads],
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
          { keys: ['1'], label: 'Bulk — files without order identity' },
          { keys: ['2'], label: 'Shipping labels — 4×6' },
          { keys: ['3'], label: 'Packing slips — letter' },
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
        label: `${verb} ${stockCount(labels, 'label')}`,
        icon: <Printer />,
        disabled: labels === 0 || print.isPending,
        disabledReason: busy ?? 'No labels on the checked orders',
        run: () => {
          const documents = checkedDocsOf(['label']);
          print.mutate({ documents, reprint: reprinting, confirm: warnFor(documents) });
        },
      },
      {
        id: 'print-checked-paperwork',
        label: `${verb} ${stockCount(paper, 'paper')}`,
        icon: <Printer />,
        disabled: paper === 0 || print.isPending,
        disabledReason: busy ?? 'No paperwork left to print on the checked orders',
        run: () => {
          const documents = checkedDocsOf(['paper']);
          print.mutate({ documents, reprint: reprinting, confirm: warnFor(documents) });
        },
      },
      {
        id: 'print-checked-both',
        label: `${verb} both`,
        icon: <Layers />,
        disabled: labels + paper === 0 || print.isPending,
        disabledReason: busy ?? 'Nothing to print on the checked orders',
        run: () => {
          const documents = checkedDocsOf(PRINT_STOCKS);
          print.mutate({ documents, reprint: reprinting, confirm: warnFor(documents) });
        },
      },
    ];
  }, [checkedDocsOf, print, reprinting, warnFor]);

  const reprint = reprinting || (openCard?.labels.some((row) => row.printCount > 0) ?? false);
  const unlinkedDocuments = unlinked.data?.documents ?? [];
  const unlinkedIngestions = unlinked.data?.unlinkedIngestions ?? [];
  const unlinkedCount = unlinkedDocuments.length + unlinkedIngestions.length;
  const recordVerbs: RecordActionVerb[] = openCard ? [
    {
      id: 'print',
      label: checkedDocs.length === 0 ? 'Check a document' : `${reprint ? 'Reprint' : 'Print'} ${checkedDocs.length}`,
      icon: reprint ? <RotateCcw /> : <Printer />,
      disabled: checkedDocs.length === 0 || print.isPending,
      disabledReason: print.isPending ? 'Printing…' : 'Check a document first',
      run: printChecked,
    },
    {
      id: 'upload',
      label: view === 'labels' ? 'Upload label' : 'Upload packing slip',
      icon: <Upload />,
      run: view === 'labels' ? openLabelPicker : openSlipPicker,
    },
    ...(view === 'paperwork' ? [{
      id: 'fetch-channel',
      label: 'Fetch from channel',
      icon: <RefreshCw />,
      disabled: paperworkActions.fetchFromPlatform.isPending,
      disabledReason: 'Fetching…',
      run: () => paperworkActions.fetchFromPlatform.mutate(['packing_slip']),
    } satisfies RecordActionVerb] : []),
    {
      id: 'replace',
      label: 'Replace open file',
      icon: <RefreshCw />,
      disabled: activeDocument == null || paperworkActions.replaceDocument.isPending || replacementLabelUploads.pending,
      disabledReason: activeDocument == null
        ? 'Open a stored document first'
        : paperworkActions.replaceDocument.isPending || replacementLabelUploads.pending
          ? 'Replacing…'
          : undefined,
      run: () => replacementPicker.current?.click(),
    },
    {
      id: 'pair-stored',
      label: `Pair stored${unlinkedCount > 0 ? ` (${unlinkedCount})` : ''}`,
      icon: <Link2 />,
      disabled: unlinkedCount === 0 || pairStored.isPending,
      disabledReason: pairStored.isPending ? 'Pairing…' : 'No unlinked rows of this stock',
      display: (done) => (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {unlinkedDocuments.map((document) => (
            <Button
              key={`document:${document.id}`}
              variant="secondary"
              size="sm"
              icon={<Link2 />}
              onClick={() => {
                pairStored.mutate({ kind: 'document', id: document.id }, { onSuccess: done });
              }}
            >
              {document.data.filename || `Document ${document.id}`}
            </Button>
          ))}
          {view === 'labels' ? unlinkedIngestions.map((ingestion) => (
            <Button
              key={`ingestion:${ingestion.id}`}
              variant="secondary"
              size="sm"
              icon={<Link2 />}
              onClick={() => {
                pairStored.mutate(
                  { kind: 'ingestion', id: ingestion.id, rowVersion: ingestion.rowVersion },
                  { onSuccess: done },
                );
              }}
            >
              {ingestion.fileBasename}
            </Button>
          )) : null}
        </div>
      ),
    },
    {
      id: 'remove-unlinked',
      label: `Remove unlinked${unlinkedCount > 0 ? ` (${unlinkedCount})` : ''}`,
      icon: <Trash2 />,
      tone: 'danger',
      disabled: unlinkedCount === 0 || removeUnlinked.isPending,
      disabledReason: removeUnlinked.isPending ? 'Removing…' : 'No unlinked rows of this stock',
      run: async () => {
        const confirmed = await requestConfirm({
          title: `Remove ${unlinkedCount} unlinked ${unlinkedCount === 1 ? 'row' : 'rows'}?`,
          description: 'Only rows with no order link are removed. Linked order documents stay in place.',
          confirmLabel: 'Remove unlinked',
          cancelLabel: 'Cancel',
          tone: 'danger',
        });
        if (confirmed) removeUnlinked.mutate();
      },
    },
    {
      id: 'delete-open',
      label: 'Delete open file',
      icon: <Trash2 />,
      tone: 'danger',
      disabled: activeDocument == null || paperworkActions.removeDocument.isPending,
      disabledReason: activeDocument == null ? 'Open a stored document first' : 'Deleting…',
      run: async () => {
        if (!activeDocument) return;
        const confirmed = await requestConfirm({
          title: 'Delete this linked document?',
          description: 'The selected order stays. This document row and its stored bytes are deleted.',
          confirmLabel: 'Delete document',
          cancelLabel: 'Cancel',
          tone: 'danger',
        });
        if (confirmed) paperworkActions.removeDocument.mutate(activeDocument);
      },
    },
    ...(view === 'labels' ? [{
      id: 'buy',
      label: 'Buy label',
      icon: <Truck />,
      run: () => router.push('/shipping/label-intake?view=labels&buy=1'),
    } satisfies RecordActionVerb] : []),
  ] : [];
  const recordActions = openCard ? (
    <RecordActionStrip verbs={recordVerbs} label={`Order ${selectedOrderRef} document actions`} face="inline" testId="labels-docs-record-actions" />
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

  const status = queue.isError
    ? 'The print queue could not be read. It retries on its own.'
    : notice;

  const orderId = selectedOrderId || null;
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
          {activeLabel ? (
            <Button
              variant="secondary"
              size="sm"
              radius="control"
              icon={<Upload />}
              onClick={openLabelPicker}
              data-testid="labels-docs-upload-inline"
            >
              Upload label PDF
            </Button>
          ) : (
            <Button
              variant="ink"
              size="sm"
              radius="control"
              icon={<Truck />}
              onClick={() => router.push('/shipping/label-intake?view=labels&buy=1')}
              data-testid="labels-docs-buy-label"
            >
              Buy label
            </Button>
          )}
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
            <PaperworkIntakeCard
              key={orderId}
              orderId={orderId}
              orderRef={openCard.orderRef}
              lines={openCard.lines}
              onFiled={() => void refresh()}
            />
          ) : activeLabel ? (
            <PairOrderCard
              key={activeLabel.id}
              row={activeLabel}
              onPaired={(orderRef, alsoPaired) => {
                setNotice(
                  `Paired to ${orderRef ?? 'the order'} — its packing slip and manuals now ride with the label.${
                    alsoPaired > 0 ? ` ${alsoPaired} more label${alsoPaired === 1 ? '' : 's'} for this buyer paired too.` : ''
                  }`,
                );
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
        accept="application/pdf,image/png,image/jpeg"
        tabIndex={-1}
        aria-label="Packing slip PDFs"
        onChange={(event) => {
          submitSlips(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        ref={replacementPicker}
        className="sr-only"
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        tabIndex={-1}
        aria-label="Replacement document file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && activeDocument) {
            if (activeDocument.data.labelIngestionId != null) {
              replacementSourceDocument.current = activeDocument;
              replacementLabelUploads.submit([file]);
            } else {
              paperworkActions.replaceDocument.mutate({ doc: activeDocument, file });
            }
          }
          event.target.value = '';
        }}
      />
      <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        record={buyOpen ? {
          title: 'Buy a label',
          subtitle: 'For an order with no label, or a typed address',
          actions: (
            <Button
              variant="secondary"
              size="sm"
              radius="control"
              icon={<X aria-hidden />}
              onClick={() => router.push('/shipping/label-intake?view=labels')}
              data-testid="label-buy-close-header"
            >
              Close
            </Button>
          ),
          noun: 'label buy',
          testId: 'label-buy-record',
          summary,
          view: (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4">
              <LabelBuyCard
                onClose={() => router.push('/shipping/label-intake?view=labels')}
                onChanged={() => void refresh()}
              />
            </div>
          ),
          strip: null,
          rail: true,
        } : {
          // The open card in the rail already names the order — the header only adds what the card does not say.
          title: <span className="sr-only">{openCard ? (openCard.orderRef ?? 'No order') : 'Order'}</span>,
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
        bulk={<RecordActionStrip verbs={bulkVerbs} label="Checked order actions" testId="labels-docs-bulk" />}
        banner={
          status || labelUploads.items.length > 0 || replacementLabelUploads.items.length > 0 || slipUploads.rows.length > 0 ? (
            <div className="flex shrink-0 flex-col gap-2 px-3 pb-1">
              {status ? (
                <p aria-live="polite" className="text-role-caption text-mode-muted" data-testid="labels-docs-status">
                  {status}
                </p>
              ) : null}
              <LabelUploadTray uploads={labelUploads} />
              <LabelUploadTray uploads={replacementLabelUploads} />
              <SlipUploadTray uploads={slipUploads} candidates={slipCandidates} />
            </div>
          ) : null
        }
        searchEmpty={query.trim() || statusFilter.size > 0 ? <p className="text-role-caption text-text-muted">No order matches this cut.</p> : null}
        allClear={
          <TriageAllClear
            title={view === 'labels' ? 'No Allocate orders match this cut' : 'No Allocate orders match this cut'}
            detail={
              view === 'labels'
                ? 'Upload or drop label PDFs to add more.'
                : 'Drop a packing slip here to file it on the selected order.'
            }
          />
        }
      />
    </div>
  );
}
