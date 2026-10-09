'use client';

/**
 * The Live feed's docs sheet — exact identification, then exact triage, for
 * the selected orders' shipping labels, packing slips and product paperwork
 * (operator 2026-10-06; layout spec
 * `docs/refactors/live-feed/SPEC-docs-triage-popover.md`, "Rulings round 2").
 * Near full-viewport.
 *
 *   header   title · order count · Orders | Grid (two or more orders) · Close
 *   orders   rail (two or more orders; folds; "12 of 31 complete"; the owed
 *            filter with a count per option) | work column (~40%: identity
 *            strip, the three tabs, the tab's rows, suggestions, search,
 *            verbs) | the viewer (full height, portrait: the selected
 *            document — on file, or a library document before it is linked;
 *            or the detailed label-buy form while Buy label is open) —
 *            `OrderSheet`, keyed by order
 *   grid     the owed filter, then the orders it shows × the three tabs, full
 *            width (`DocsMatrix`); a cell peeks its document on hover and
 *            opens that order on that tab
 *   footer   where Print sends what (count, paper, station), Keys, then Print
 *            (bottom right): the open tab's documents for every selected
 *            order through the desk press, the reprint question first
 *
 * Keys (`docs-triage/sheet-keys.ts`; `?` lists them): 1 2 3 tabs · J / K
 * orders within the filter · Enter opens the grid's row · N next owed · G
 * Orders / Grid · F the owed filter · B buy label · O open in a new tab ·
 * ⌘↵ link · P print · Esc closes a label buy, then clears the viewer's
 * selection, then closes. Nothing pressed here reaches the Live feed board
 * behind it. The rail's fold, the last tab and the owed filter are
 * remembered per staffer. Another station's change re-reads the sheet.
 *
 * Packets come from `/api/shipping/label-intake/orders?ids=` — the Orders
 * desk's read; every write is that desk's writer.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Keyboard, LayoutGrid, PanelLeft, Printer, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { LabelBuyPurpose } from '@/components/outbound/labels/replacement/ReplacementForm';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/design-system/components/Dialog';
import { SegmentedGlyphSwitch } from '@/design-system/components/SegmentedGlyphSwitch';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { Spinner } from '@/design-system/primitives/Spinner';
import { usePrintStations } from '@/hooks/usePrintStations';
import { openShortcutOverview } from '@/lib/keyboard/shortcut-overview';
import { isPacketGap, type OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import { fetchOrderPackets, ORDER_PACKETS_KEY_ROOT, orderPacketsKey } from '@/lib/label-prints/order-packets-client';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import { marryByCardOrder } from '@/features/labels-docs/desk-press';
import { labelBuyPurpose } from '@/features/labels-docs/orders/pane/label-buy-purpose';
import { packetDocuments, packetReprintWarning } from '@/features/labels-docs/orders/pane/packet-press';
import { useDeskPress } from '@/features/labels-docs/use-desk-press';
import { usePrintRoutes } from '@/features/labels-docs/use-print-routes';
import { DOC_TAB_LABEL, docTabState, type DocTab } from './docs-triage/doc-tabs';
import { DocsMatrix } from './docs-triage/DocsMatrix';
import { OrderRail } from './docs-triage/OrderRail';
import { IDLE_SHEET_KEYS, OrderSheet, type SheetKeys } from './docs-triage/OrderSheet';
import { isPacketComplete, printPreview, railRowsFor, type RailFilter, type SheetPlace } from './docs-triage/sheet-model';
import { onSheetKeyDown, useSheetKeyboard, type SheetView } from './docs-triage/sheet-keys';
import { readSheetPrefs, writeSheetPrefs } from './docs-triage/sheet-prefs';
import { useSheetRealtime } from './docs-triage/use-sheet-realtime';

const VIEW_OPTIONS = [
  { value: 'rail', label: 'Orders', Glyph: PanelLeft, testId: 'docs-view-rail' },
  { value: 'grid', label: 'Grid', Glyph: LayoutGrid, testId: 'docs-view-grid' },
] as const;

/** The sheet's arrival: a short scale + fade (reduced motion: the fade). */
const SHEET_OPEN = { initial: { opacity: 0, scale: 0.985 }, animate: { opacity: 1, scale: 1 } };

/** A desk document belongs to a tab by its kind. */
function inTab(doc: DeskDocument, tab: DocTab): boolean {
  if (tab === 'label') return doc.stock === 'label';
  if (tab === 'slip') return doc.kind === 'packing_slip';
  return doc.stock === 'paper' && doc.kind !== 'packing_slip';
}

const NOUN: Readonly<Record<DocTab, [string, string]>> = {
  label: ['label', 'labels'],
  slip: ['slip', 'slips'],
  paperwork: ['document', 'documents'],
};

export function PrintPacketsDialog({
  open,
  onOpenChange,
  orderRowIds,
  tab: initialTab,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderRowIds: readonly number[];
  /** The tab it opens on — the card mark pressed, or the bulk verb. Absent = the tab this staffer had open last. */
  tab?: DocTab;
}) {
  const queryClient = useQueryClient();
  const staffId = useAuth().user?.staffId ?? null;
  const query = useMemo(() => ({ ids: [...orderRowIds].sort((a, b) => a - b), limit: 100 }), [orderRowIds]);
  const packets = useQuery({
    queryKey: orderPacketsKey(query),
    queryFn: () => fetchOrderPackets(query),
    enabled: open && orderRowIds.length > 0,
  });
  useSheetRealtime(open);
  useSheetKeyboard(open);
  const rows = useMemo(() => packets.data?.rows ?? [], [packets.data]);
  const [activeId, setActiveId] = useState<number | null>(null);
  // The grid's highlighted row (J / K there; Enter opens it).
  const [gridId, setGridId] = useState<number | null>(null);
  const [tab, setTab] = useState<DocTab>(initialTab ?? 'label');
  const [view, setView] = useState<SheetView>('rail');
  const [railFilter, setRailFilter] = useState<RailFilter>('all');
  const [railFolded, setRailFolded] = useState(false);
  // The label buy open in the viewer column — one order's, at a time.
  const [buy, setBuy] = useState<{ orderId: number; purpose: LabelBuyPurpose } | null>(null);
  const keys = useRef<SheetKeys>({ ...IDLE_SHEET_KEYS });
  useEffect(() => {
    if (!open) return;
    const prefs = readSheetPrefs(staffId);
    setActiveId(null);
    setGridId(null);
    setBuy(null);
    setTab(initialTab ?? prefs.tab ?? 'label');
    setRailFolded(prefs.railFolded);
    setRailFilter(prefs.filter);
    setView('rail');
  }, [open, initialTab, staffId]);

  const railRows = railRowsFor(rows, railFilter);
  const active = rows.find((packet) => packet.orderId === activeId) ?? railRows[0] ?? rows[0] ?? null;
  const highlighted = railRows.find((packet) => packet.orderId === gridId) ?? railRows[0] ?? null;
  // Where the keys act: the rail's open order, or the grid's highlighted row.
  const here = view === 'grid' ? highlighted : active;
  const complete = rows.filter(isPacketComplete).length;

  const pick = (orderId: number) => {
    setActiveId(orderId);
    setBuy(null);
  };
  const chooseTab = (next: DocTab) => {
    setTab(next);
    if (next !== 'label') setBuy(null);
    writeSheetPrefs(staffId, { tab: next });
  };
  const foldRail = (next: boolean) => {
    setRailFolded(next);
    writeSheetPrefs(staffId, { railFolded: next });
  };
  const chooseFilter = (next: RailFilter) => {
    setRailFilter(next);
    writeSheetPrefs(staffId, { filter: next });
    // The open order leaves with the filter: the first order it shows takes over.
    const shown = railRowsFor(rows, next);
    if (active && shown.length > 0 && !shown.some((packet) => packet.orderId === active.orderId)) pick(shown[0]!.orderId);
  };
  const goTo = ({ orderId, tab: next }: SheetPlace) => {
    pick(orderId);
    chooseTab(next);
    setView('rail');
  };
  const switchView = (next: SheetView) => {
    if (next === 'grid') setGridId(active?.orderId ?? null);
    else if (highlighted) pick(highlighted.orderId);
    setView(next);
  };
  const step = (delta: 1 | -1) => {
    if (!here || railRows.length === 0) return;
    const at = railRows.findIndex((packet) => packet.orderId === here.orderId);
    const next = railRows[at < 0 ? 0 : Math.min(railRows.length - 1, Math.max(0, at + delta))]!.orderId;
    if (view === 'grid') setGridId(next);
    else if (next !== here.orderId) pick(next);
  };
  const openBuy = (packet: OrderPacket) => {
    if (!isPacketGap(docTabState(packet, 'label'))) return;
    goTo({ orderId: packet.orderId, tab: 'label' });
    setBuy({ orderId: packet.orderId, purpose: labelBuyPurpose(packet) });
  };

  const { routes, refresh: refreshRoutes } = usePrintRoutes();
  const stations = usePrintStations();
  const { print, notice } = useDeskPress(stations, refreshRoutes);
  const stock = tab === 'label' ? 'label' : 'paper';
  const sheetOpen = useMotionPresence(SHEET_OPEN);
  const sheetTransition = useMotionTransition(motionTransition.workbenchPaneMount);

  // Every selected order's documents in the open tab, married in card order.
  const documents = useMemo(() => {
    const all = rows.flatMap(packetDocuments).filter((doc) => inTab(doc, tab));
    return stock === 'label' ? marryByCardOrder(all, []) : marryByCardOrder([], all);
  }, [rows, tab, stock]);
  const preview = printPreview(documents, stations.target, stations.blockedReason, routes);
  const owed = rows.filter((packet) => isPacketGap(docTabState(packet, tab)));
  const blocked = stations.blockedReason(stock);
  const [one, many] = NOUN[tab];
  const reason = print.isPending
    ? 'Printing…'
    : documents.length === 0
      ? `No ${DOC_TAB_LABEL[tab].toLowerCase()} on file to print yet.`
      : blocked;

  const printAll = () => {
    if (reason) return;
    print.mutate(
      { documents, reprint: rows.some((packet) => packet.printCount > 0), confirm: packetReprintWarning(rows) },
      { onSettled: () => void queryClient.invalidateQueries({ queryKey: ORDER_PACKETS_KEY_ROOT }) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0"
        onKeyDown={(event) =>
          onSheetKeyDown(event, {
            view,
            tab,
            rows,
            filter: railFilter,
            here,
            keys,
            chooseTab,
            step,
            goTo,
            switchView,
            chooseFilter,
            openBuy,
            print: printAll,
          })
        }
        onEscapeKeyDown={(event) => {
          // Esc first closes a label buy, then clears what the viewer shows; the next Esc closes the sheet.
          if (keys.current.clearSelection()) event.preventDefault();
        }}
        data-testid="live-feed-print-dialog"
      >
        <motion.div
          className="flex min-h-0 min-w-0 flex-1 flex-col"
          initial={sheetOpen.initial}
          animate={sheetOpen.animate}
          transition={sheetTransition}
        >
          <header className="flex min-w-0 items-center gap-3 border-b border-border-soft px-5 py-2.5" data-testid="docs-sheet-header">
            <DialogTitle>Labels &amp; paperwork</DialogTitle>
            <DialogDescription className="min-w-0 truncate text-sm">
              {orderRowIds.length} order{orderRowIds.length === 1 ? '' : 's'}
              {owed.length > 0 ? ` · ${owed.length} owed ${DOC_TAB_LABEL[tab].toLowerCase()}` : ''}
            </DialogDescription>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {rows.length > 1 ? (
                <SegmentedGlyphSwitch options={VIEW_OPTIONS} value={view} onChange={switchView} ariaLabel="View" testId="docs-view" />
              ) : null}
              <IconButton
                icon={<X />}
                size="md"
                radius="control"
                ariaLabel="Close"
                onClick={() => onOpenChange(false)}
                data-testid="live-feed-print-dialog-close"
              />
            </div>
          </header>

          {packets.isLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-text-muted">
              <Spinner size="sm" /> Loading orders…
            </div>
          ) : packets.isError ? (
            <p className="p-6 text-sm text-text-danger">{(packets.error as Error).message}</p>
          ) : !active ? (
            <p className="p-6 text-sm text-text-muted">No open order in this selection has documents to show.</p>
          ) : view === 'grid' ? (
            <DocsMatrix
              packets={railRows}
              all={rows}
              filter={railFilter}
              onFilter={chooseFilter}
              highlightId={highlighted?.orderId ?? null}
              onOpen={(orderId, next) => goTo({ orderId, tab: next })}
            />
          ) : (
            <div className="flex min-h-0 flex-1">
              {rows.length > 1 ? (
                <OrderRail
                  rows={railRows}
                  all={rows}
                  activeId={active.orderId}
                  onPick={pick}
                  filter={railFilter}
                  onFilter={chooseFilter}
                  complete={complete}
                  folded={railFolded}
                  onFolded={foldRail}
                />
              ) : null}
              <OrderSheet
                key={active.orderId}
                packet={active}
                rows={rows}
                filter={railFilter}
                tab={tab}
                onTab={chooseTab}
                onGo={goTo}
                buying={buy?.orderId === active.orderId ? buy.purpose : null}
                onBuy={(purpose) => setBuy(purpose ? { orderId: active.orderId, purpose } : null)}
                keys={keys}
              />
            </div>
          )}

          <footer className="flex items-center gap-3 border-t border-border-soft px-5 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <p
                className="min-w-0 truncate text-sm text-text-muted"
                title={notice || preview.map((line) => line.text).join('\n') || undefined}
                data-testid="docs-print-preview"
              >
                {notice || preview.map((line) => line.text).join(' · ')}
              </p>
              {owed.length > 0 && documents.length > 0 ? (
                <p className="min-w-0 truncate text-role-caption text-text-faint">
                  {owed.length} order{owed.length === 1 ? ' is' : 's are'} still owed {DOC_TAB_LABEL[tab].toLowerCase()} and will be skipped.
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              radius="control"
              icon={<Keyboard className="size-4" />}
              aria-keyshortcuts="?"
              title="Keys (?)"
              onClick={openShortcutOverview}
              data-testid="docs-sheet-keys"
            >
              Keys
            </Button>
            <Button
              type="button"
              variant="primary"
              icon={<Printer className="size-4" />}
              disabled={Boolean(reason)}
              title={reason ?? 'P'}
              aria-keyshortcuts="P"
              onClick={printAll}
              data-testid="live-feed-print-dialog-print"
            >
              {print.isPending ? 'Printing…' : `Print ${documents.length > 0 ? `${documents.length} ` : ''}${documents.length === 1 ? one : many}`}
            </Button>
          </footer>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
