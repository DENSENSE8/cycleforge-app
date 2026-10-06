'use client';

/**
 * Labels & docs › Orders — the order pane (2026-10-05): one order as the
 * slots that ship with it. Header: platform mark, the FULL order number, line
 * count, the printer gear (and a close on the narrow drawer). Body, in pack
 * order: Shipping label (`LabelSlot`), Packing slip (`SlipSlot`), Product
 * paperwork (one `LinePaperworkSlot placement="pane"` per line). Footer
 * (sticky): Print order — every printable document, each stock to its
 * station (`useDeskPress` → `planPress`), the reprint question first when
 * anything was printed before, disabled with the reason when nothing can
 * print — and the order-level "Order needs no paperwork" exemption.
 *
 * Tab walks the slots; with a slot focused P pairs, U uploads, N marks it not
 * required (`SlotFrame`). The header's Upload (nav intent
 * `labels-docs:upload-order`) opens the first gap slot's upload. Layout is
 * container-driven: every text wrapper `min-w-0`, truncation carries a title.
 */

import { useRef } from 'react';
import { Printer, RotateCcw, X } from '@/components/Icons';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { RecordFullId } from '@/design-system/components/record-ledger/RecordFullId';
import { Button, Checkbox, IconButton } from '@/design-system/primitives';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { useResolvePaperworkException } from '@/hooks/exceptions';
import { useOrderChannel } from '@/hooks/useCatalog';
import { usePrintStations } from '@/hooks/usePrintStations';
import type { OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import type { PrintStock } from '@/lib/label-prints/print-route';
import { resolveMarketplaceChipIdentity } from '@/lib/marketplace-order-id';
import { useNavIntent } from '@/lib/nav/use-nav-intent';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { stationFace } from '../../PrintStationsCard';
import { PrinterSettingsGear } from '../../PrinterSettingsGear';
import { PRINT_STOCKS } from '../../desk-press';
import { useDeskPress } from '../../use-desk-press';
import { usePrintRoutes } from '../../use-print-routes';
import { LabelSlot } from './LabelSlot';
import { LinePaperworkSlot } from './LinePaperworkSlot';
import { packetDocuments, packetReprintWarning } from './packet-press';
import { SlipSlot } from './SlipSlot';
import { usePacketRefresh } from './use-packet-refresh';

/** The header's Upload while an order is open: the first gap slot's typed upload. */
export const ORDER_UPLOAD_INTENT = 'labels-docs:upload-order';

const STOCK_NOUN: Readonly<Record<PrintStock, string>> = { label: 'Labels', paper: 'Paperwork' };

export function OrderPane({ packet, onClose }: { packet: OrderPacket; onClose?: () => void }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const refresh = usePacketRefresh();
  const channel = useOrderChannel();
  const platform = channel(packet.orderRef, packet.accountSource).label;
  const dot = platformMetaBrandDot(resolveMarketplaceChipIdentity(packet.orderRef, platform).meta);

  const { refresh: refreshRoutes } = usePrintRoutes();
  const stations = usePrintStations();
  const { print, notice } = useDeskPress(stations, refreshRoutes);
  const documents = packetDocuments(packet);
  const stocks = PRINT_STOCKS.filter((stock) => documents.some((doc) => doc.stock === stock));
  const blocked = stocks.map((stock) => ({ stock, reason: stations.blockedReason(stock) }));
  const reprint = documents.length > 0 && packetReprintWarning([packet]) != null;
  const reason = print.isPending
    ? 'Printing…'
    : documents.length === 0
      ? packet.gapCount > 0
        ? 'Nothing to print yet — fill a slot first.'
        : 'Nothing on this order prints.'
      : blocked.every((each) => each.reason)
        ? blocked.map((each) => each.reason).join(' ')
        : null;
  const printOrder = () => {
    if (reason) return;
    print.mutate(
      { documents, reprint, confirm: packetReprintWarning([packet]) },
      { onSettled: () => void refresh() },
    );
  };

  const exemption = useResolvePaperworkException();
  const setExempt = async (value: boolean) => {
    try {
      for (const line of packet.lines) await exemption.mutateAsync({ action: 'docs-not-required', orderId: line.orderLineId, value });
      toast.undo(value ? `${packet.orderRef} needs no paperwork` : `${packet.orderRef} needs its paperwork again`, {
        onUndo: () => void setExempt(!value),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the exemption.');
    } finally {
      void refresh();
    }
  };

  useNavIntent(ORDER_UPLOAD_INTENT, () => {
    const slots = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('[data-slot-state]') ?? []);
    const target = slots.find((slot) => slot.dataset.slotState === 'missing' || slot.dataset.slotState === 'review') ?? slots[0];
    if (!target) return;
    target.focus();
    // The slot's own U: its typed upload, on its own target.
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'u', bubbles: true }));
  });

  const lineCount = `${packet.lines.length} line${packet.lines.length === 1 ? '' : 's'}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="order-pane" data-order-id={packet.orderId}>
      <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-mode-divide px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <BrandIdentityDot className={dot.className} style={dot.style} />
          {platform ? (
            <span className="max-w-[8rem] shrink-0 truncate text-role-caption text-text-muted" title={platform}>
              {platform}
            </span>
          ) : null}
          <RecordFullId value={packet.orderRef} label="order number" className="text-role-body font-semibold" />
          <span className="shrink-0 text-role-caption tabular-nums text-text-muted">· {lineCount}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <PrinterSettingsGear />
          {onClose ? <IconButton icon={<X />} size="md" ariaLabel="Close the order" onClick={onClose} data-testid="order-pane-close" /> : null}
        </span>
      </header>

      <div ref={bodyRef} className="flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain py-2" data-testid="order-pane-slots">
        <LabelSlot packet={packet} />
        <SlipSlot packet={packet} />
        <section className="flex min-w-0 flex-col" aria-label="Product paperwork" data-testid="order-pane-paperwork">
          <h3 className={cn(RECORD_LABEL_CLASS, 'px-3 pt-2 text-mode-faint')}>Product paperwork</h3>
          {packet.lines.map((line) => (
            <LinePaperworkSlot key={line.orderLineId} packet={packet} line={line} placement="pane" />
          ))}
        </section>
      </div>

      <footer className="shrink-0 border-t border-mode-divide bg-surface-card px-3 py-3" data-testid="order-pane-actions">
        <Button
          variant="primary"
          size="md"
          icon={reprint ? <RotateCcw /> : <Printer />}
          className="w-full min-w-0"
          disabled={reason != null}
          loading={print.isPending}
          onClick={printOrder}
          data-testid="order-pane-print"
        >
          <span className="truncate">{reprint ? 'Reprint order' : 'Print order'}</span>
        </Button>
        <p className="mt-2 min-w-0 text-role-caption text-text-muted" data-testid="order-pane-print-reason">
          {reason ?? stocks.map((stock) => `${STOCK_NOUN[stock]} → ${stationFace(stations.target[stock], stock)}`).join(' · ')}
        </p>
        {!reason && blocked.some((each) => each.reason) ? (
          <p className="min-w-0 text-role-caption text-text-warning">
            {blocked.filter((each) => each.reason).map((each) => `${STOCK_NOUN[each.stock]}: ${each.reason}`).join(' ')} Print order sends only the other stock.
          </p>
        ) : null}
        {notice ? (
          <p aria-live="polite" className="min-w-0 text-role-caption text-text-muted" data-testid="order-pane-print-notice">
            {notice}
          </p>
        ) : null}
        <label className="mt-2 flex min-w-0 items-center gap-2 text-role-caption text-text-default">
          <Checkbox
            checked={packet.docsNotRequired}
            disabled={exemption.isPending}
            onCheckedChange={(next) => void setExempt(next === true)}
            data-testid="order-pane-docs-not-required"
          />
          <span className="min-w-0 truncate" title="The packing slip and product paperwork are not required for this order">
            Order needs no paperwork
          </span>
        </label>
      </footer>
    </div>
  );
}
