'use client';

/**
 * Labels & docs › Orders — `/shipping/label-intake?view=orders` (operator
 * 2026-10-05): one row per ORDER shaped as the slots that ship with it, the
 * open order reviewed and paired in the pane beside the list.
 *
 *   sidebar   Find (`q`) · Status (`status`) · Missing slot (`gap`) · Channel (`channel`) · Sort (`sort`)
 *   list      `OrderPacketList` — slot strip per row, lines folded under the chevron (→ / ←)
 *   pane      `OrderPane` (the open order), or `LabelBuyCard` while `?buy=1`
 *
 * The pane is a `DeskSelectionDock` beside the list (a drawer when the desk is
 * too narrow for both). The first order opens on arrival; when the open order
 * leaves the list the one now in its place opens. Esc never clears the
 * check-set. Print order (⌘/Ctrl+P) prints the checked orders, else the open
 * one, through the desk press (partitioned by stock, labels then paperwork in
 * the same order, one reprint confirm). Upload (⌘O) opens the open order's
 * first missing slot's typed upload (the pane's `ORDER_UPLOAD_INTENT`); with
 * no order open it picks PDFs that land in Bulk's file list (no type choice).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Printer, X } from '@/components/Icons';
import { DeskSelectionDock } from '@/design-system/components/DeskSelectionDock';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { Button } from '@/design-system/primitives';
import { usePrintStations } from '@/hooks/usePrintStations';
import { chordKeys, useApplePlatform } from '@/lib/keyboard/chord-keys';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import { ORDER_PACKETS_KEY_ROOT } from '@/lib/label-prints/order-packets-client';
import { runNavIntent } from '@/lib/nav/intents';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { marryByCardOrder } from '../desk-press';
import { LabelBuyCard } from '../buy/LabelBuyCard';
import { usePrintFileUploads } from '../files/use-print-file-uploads';
import { LabelUploadTray } from '../upload/LabelUploadTray';
import { useFilePicker } from './pane/SlotFrame';
import { LABEL_DROP_TYPES } from './pane/slot-faces';
import { useDeskPress } from '../use-desk-press';
import { usePrintRoutes } from '../use-print-routes';
import { OrderPacketList } from './OrderPacketList';
import { ORDER_UPLOAD_INTENT, OrderPane } from './pane/OrderPane';
import { packetDocuments, packetReprintWarning } from './pane/packet-press';
import { useOrderChecks, useOrderPackets } from './use-order-packets';

const UPLOAD_CHORD = 'mod+o';
const PRINT_CHORD = 'mod+p';
/** Orders has no body status cut — the sidebar's `?status=` is the server's. */
const NO_STATUS: readonly never[] = [];

export function OrdersDesk() {
  const searchParams = useSearchParams();
  const pathname = usePathname() || '/';
  const router = useRouter();
  const queryClient = useQueryClient();
  const apple = useApplePlatform();
  const { refresh: refreshRoutes } = usePrintRoutes();
  const stations = usePrintStations();
  const { print, notice, setNotice } = useDeskPress(stations, refreshRoutes);
  const cut = useTriageCut({ statusKeys: NO_STATUS, recordParams: [] });
  const data = useOrderPackets(searchParams, cut.url);
  const { filters, rows } = data;
  const { selection, checkedPackets } = useOrderChecks(rows);
  const buyOpen = searchParams.get('buy') === '1';

  // ── The open order: the first on arrival; the one in its place when it leaves the list ──
  const [openId, setOpenId] = useState<number | null>(null);
  const [drawerHidden, setDrawerHidden] = useState(false);
  const openIndex = useRef(0);
  useEffect(() => {
    if (data.loading) return;
    const at = openId == null ? -1 : rows.findIndex((packet) => packet.orderId === openId);
    if (at >= 0) {
      openIndex.current = at;
      return;
    }
    setOpenId(rows[Math.min(openIndex.current, rows.length - 1)]?.orderId ?? null);
  }, [rows, openId, data.loading]);
  const open = useMemo(() => rows.find((packet) => packet.orderId === openId) ?? null, [rows, openId]);
  const openPacket = useCallback((packet: OrderPacket) => {
    setDrawerHidden(false);
    setOpenId(packet.orderId);
  }, []);

  // ── Print order(s): the checked orders, else the open one ──
  const printOrders = useCallback(() => {
    if (print.isPending) return;
    const targets = checkedPackets.length > 0 ? checkedPackets : open ? [open] : [];
    if (targets.length === 0) {
      setNotice('Open or check an order to print.');
      return;
    }
    const documents = targets.flatMap(packetDocuments);
    const ordered = marryByCardOrder(
      documents.filter((doc) => doc.stock === 'label'),
      documents.filter((doc) => doc.stock === 'paper'),
    );
    if (ordered.length === 0) {
      setNotice(targets.length === 1 ? `Order ${targets[0]!.orderRef} has nothing to print yet.` : 'The checked orders have nothing to print yet.');
      return;
    }
    print.mutate(
      { documents: ordered, reprint: targets.some((packet) => packet.printCount > 0), confirm: packetReprintWarning(targets) },
      { onSettled: () => void queryClient.invalidateQueries({ queryKey: ORDER_PACKETS_KEY_ROOT }) },
    );
  }, [print, checkedPackets, open, setNotice, queryClient]);

  // ── Upload: the open order's slot-typed upload, else PDFs into Bulk's file list ──
  const uploads = usePrintFileUploads();
  const picker = useFilePicker(LABEL_DROP_TYPES, uploads.submit);
  const openFilePicker = picker.open;
  const upload = useCallback(() => {
    if (open && !buyOpen && runNavIntent(ORDER_UPLOAD_INTENT)) return;
    openFilePicker();
  }, [open, buyOpen, openFilePicker]);

  // ── Buy a label (`?buy=1`): the desk's own compose in the pane ──
  const closeBuy = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('buy');
    const search = next.toString();
    router.push(search ? `${pathname}?${search}` : pathname);
  }, [searchParams, router, pathname]);

  // ── Header intents, chords ──
  useNavIntent('labels-docs:print-orders', printOrders);
  useNavIntent('labels-docs:upload', upload);
  useEffect(
    () =>
      registerShortcutOverviewGroup({
        id: 'labels-docs-orders',
        title: 'Labels & docs · Orders',
        rows: [
          { keys: ['J', 'K'], label: 'Next / previous order' },
          { keys: ['→', '←'], label: 'Show / hide the order’s lines' },
          { keys: ['X'], label: 'Check the order' },
          { keys: chordKeys(PRINT_CHORD, apple), label: 'Print the checked orders, else the open one' },
          { keys: chordKeys(UPLOAD_CHORD, apple), label: 'Upload to the open order’s missing slot' },
          { keys: ['Esc'], label: 'Leave a field (the checked orders stay)' },
        ],
      }),
    [apple],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || hasOpenOverlay()) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.shiftKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'p') {
        event.preventDefault();
        printOrders();
      } else if (key === 'o') {
        event.preventDefault();
        upload();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [printOrders, upload]);

  // ── Faces ──
  const checkedCount = checkedPackets.length;
  const bulkVerbs = useMemo<RecordActionVerb[]>(
    () => [
      {
        id: 'print-orders',
        label: `Print ${checkedCount} ${checkedCount === 1 ? 'order' : 'orders'}`,
        icon: <Printer />,
        disabled: print.isPending,
        disabledReason: 'Printing…',
        run: printOrders,
      },
    ],
    [checkedCount, print.isPending, printOrders],
  );
  const narrowed = Boolean(filters.status || filters.gap || filters.channel || filters.q);
  const paneOpen = (buyOpen || open != null) && !drawerHidden;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="labels-docs-desk">
      {picker.input}
      <DeskSelectionDock
        open={paneOpen}
        onDismiss={() => setDrawerHidden(true)}
        label={buyOpen ? 'Buy a label' : 'Open order'}
        testId="orders-dock"
        ledger={
          <OrderPacketList
            data={data}
            cut={cut}
            query={filters.q ?? ''}
            narrowed={narrowed}
            selection={selection}
            openId={openId}
            onOpen={openPacket}
            bulk={<RecordActionStrip verbs={bulkVerbs} label="Checked order actions" testId="orders-select-actions" />}
            banner={
              notice || uploads.items.length > 0 ? (
                <>
                  {notice ? (
                    <p aria-live="polite" className="text-role-caption text-mode-muted" data-testid="labels-docs-status">
                      {notice}
                    </p>
                  ) : null}
                  <LabelUploadTray uploads={uploads} kind="files" />
                </>
              ) : null
            }
          />
        }
        pane={(mode) =>
          buyOpen ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-4" data-testid="label-buy-record">
              {mode === 'drawer' ? (
                <div className="flex justify-end pb-2">
                  <Button variant="secondary" size="sm" radius="control" icon={<X aria-hidden />} onClick={closeBuy} data-testid="label-buy-close-header">
                    Close
                  </Button>
                </div>
              ) : null}
              <LabelBuyCard onClose={closeBuy} onChanged={() => void queryClient.invalidateQueries({ queryKey: ORDER_PACKETS_KEY_ROOT })} />
            </div>
          ) : open ? (
            <OrderPane packet={open} onClose={mode === 'drawer' ? () => setDrawerHidden(true) : undefined} />
          ) : null
        }
      />
    </div>
  );
}
