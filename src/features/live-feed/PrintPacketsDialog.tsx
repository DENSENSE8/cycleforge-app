'use client';

/**
 * The Live feed's docs sheet — exact identification, then exact triage, for
 * the selected orders' shipping labels, packing slips and product paperwork
 * (operator 2026-10-06; layout spec
 * `docs/refactors/live-feed/SPEC-docs-triage-popover.md`, "Rulings round 2").
 * Near full-viewport.
 *
 *   header   title · order count · Orders | Grid (two or more orders) · Close
 *   orders   rail (two or more orders; folds; "12 of 31 complete"; filter by
 *            what is owed) | work column (~40%: identity strip, the three
 *            tabs, the tab's rows, suggestions, search, verbs) | the viewer
 *            (full height, portrait: the selected document — on file, or a
 *            library document before it is linked) — `OrderSheet`, keyed by
 *            order
 *   grid     orders × the three tabs, full width (`DocsMatrix`); a cell peeks
 *            its document on hover and opens that order on that tab
 *   footer   where Print sends what (count, paper, station), then Print
 *            (bottom right): the open tab's documents for every selected
 *            order through the desk press, the reprint question first
 *
 * Keys (never while typing): 1 2 3 tabs · J / K orders · ⌘↵ / Ctrl+Enter
 * links the previewed document · P prints the open tab · Esc clears the
 * viewer's selection, then closes. The rail's fold and the last tab are
 * remembered per staffer. Another station's change re-reads the sheet.
 *
 * Packets come from `/api/shipping/label-intake/orders?ids=` — the Orders
 * desk's read; every write is that desk's writer.
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, PanelLeft, Printer, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/design-system/components/Dialog';
import { SegmentedGlyphSwitch } from '@/design-system/components/SegmentedGlyphSwitch';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { Button } from '@/design-system/primitives/Button';
import { IconButton } from '@/design-system/primitives/IconButton';
import { Spinner } from '@/design-system/primitives/Spinner';
import { usePrintStations } from '@/hooks/usePrintStations';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hotkeyMatches } from '@/lib/keyboard/key-registry';
import { isPacketGap } from '@/lib/label-prints/order-packet-contracts';
import { fetchOrderPackets, ORDER_PACKETS_KEY_ROOT, orderPacketsKey } from '@/lib/label-prints/order-packets-client';
import type { DeskDocument } from '@/lib/label-prints/print-labels';
import { marryByCardOrder } from '@/features/labels-docs/desk-press';
import { packetDocuments, packetReprintWarning } from '@/features/labels-docs/orders/pane/packet-press';
import { useDeskPress } from '@/features/labels-docs/use-desk-press';
import { usePrintRoutes } from '@/features/labels-docs/use-print-routes';
import { DOC_TAB_LABEL, DOC_TABS, docTabState, type DocTab } from './docs-triage/doc-tabs';
import { DocsMatrix } from './docs-triage/DocsMatrix';
import { OrderRail } from './docs-triage/OrderRail';
import { OrderSheet, type SheetKeys } from './docs-triage/OrderSheet';
import { isPacketComplete, printPreview, railRowsFor, type RailFilter, type SheetPlace } from './docs-triage/sheet-model';
import { readSheetPrefs, writeSheetPrefs } from './docs-triage/sheet-prefs';
import { useSheetRealtime } from './docs-triage/use-sheet-realtime';

type View = 'rail' | 'grid';

const VIEW_OPTIONS = [
  { value: 'rail', label: 'Orders', Glyph: PanelLeft, testId: 'docs-view-rail' },
  { value: 'grid', label: 'Grid', Glyph: LayoutGrid, testId: 'docs-view-grid' },
] as const;

/** The sheet's arrival: a short scale + fade (reduced motion: the fade). */
const SHEET_OPEN = { initial: { opacity: 0, scale: 0.985 }, animate: { opacity: 1, scale: 1 } };

const LINK_HOTKEY = 'mod+enter';

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
  const rows = useMemo(() => packets.data?.rows ?? [], [packets.data]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tab, setTab] = useState<DocTab>(initialTab ?? 'label');
  const [view, setView] = useState<View>('rail');
  const [railFilter, setRailFilter] = useState<RailFilter>('all');
  const [railFolded, setRailFolded] = useState(false);
  const keys = useRef<SheetKeys>({ link: null, clearSelection: () => false });
  useEffect(() => {
    if (!open) return;
    const prefs = readSheetPrefs(staffId);
    setActiveId(null);
    setTab(initialTab ?? prefs.tab ?? 'label');
    setRailFolded(prefs.railFolded);
    setView('rail');
    setRailFilter('all');
  }, [open, initialTab, staffId]);

  const chooseTab = (next: DocTab) => {
    setTab(next);
    writeSheetPrefs(staffId, { railFolded, tab: next });
  };
  const foldRail = (next: boolean) => {
    setRailFolded(next);
    writeSheetPrefs(staffId, { railFolded: next, tab });
  };
  const goTo = ({ orderId, tab: next }: SheetPlace) => {
    setActiveId(orderId);
    chooseTab(next);
    setView('rail');
  };

  const railRows = railRowsFor(rows, railFilter);
  const active = rows.find((packet) => packet.orderId === activeId) ?? railRows[0] ?? rows[0] ?? null;
  const complete = rows.filter(isPacketComplete).length;

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

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.repeat || isEditableKeyTarget(event.target)) return;
    if (hotkeyMatches(LINK_HOTKEY, event)) {
      const link = keys.current.link;
      if (!link) return;
      event.preventDefault();
      link();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const digit = ['1', '2', '3'].indexOf(key);
    if (digit >= 0 && view === 'rail' && active) {
      event.preventDefault();
      chooseTab(DOC_TABS[digit]!);
    } else if ((key === 'j' || key === 'k') && view === 'rail' && active && railRows.length > 0) {
      event.preventDefault();
      const at = railRows.findIndex((packet) => packet.orderId === active.orderId);
      const next = at < 0 ? 0 : Math.min(railRows.length - 1, Math.max(0, at + (key === 'j' ? 1 : -1)));
      setActiveId(railRows[next]!.orderId);
    } else if (key === 'p') {
      event.preventDefault();
      printAll();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0"
        onKeyDown={onKeyDown}
        onEscapeKeyDown={(event) => {
          // Esc first clears what the viewer shows; the next Esc closes the sheet.
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
                <SegmentedGlyphSwitch options={VIEW_OPTIONS} value={view} onChange={setView} ariaLabel="View" testId="docs-view" />
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
            <DocsMatrix packets={rows} onOpen={(orderId, next) => goTo({ orderId, tab: next })} />
          ) : (
            <div className="flex min-h-0 flex-1">
              {rows.length > 1 ? (
                <OrderRail
                  rows={railRows}
                  activeId={active.orderId}
                  onPick={setActiveId}
                  filter={railFilter}
                  onFilter={setRailFilter}
                  complete={complete}
                  total={rows.length}
                  folded={railFolded}
                  onFolded={foldRail}
                />
              ) : null}
              <OrderSheet key={active.orderId} packet={active} rows={rows} tab={tab} onTab={chooseTab} onGo={goTo} keys={keys} />
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
