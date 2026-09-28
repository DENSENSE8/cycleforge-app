'use client';

/**
 * To ship: a wedge scan of an order number or tracking number opens that
 * order's record IN PLACE (DESIGN_SYSTEM.md § Disclosure ladder, L3). The desk
 * claims the global wedge's cancelable `wedge-scan` event — the page-handler
 * seam in `useGlobalWedgeScanner` — so the listener, its text-field rule (a
 * focused field keeps its keys) and command scans stay the waist's.
 *
 * - On the list → the record cursor's own open, intent `'scan'`. The record
 *   plane seats focus inside the record; Esc hands it back to the row.
 * - Known but not on the list (another filter, a page not loaded, shipped) →
 *   a toast naming it, with an Open action. A scan never re-filters the list.
 * - Unknown → a toast; filters, scroll and selection are untouched.
 * - Not ours (a bin, unit or carton label with its own route) → declined, so
 *   the waist still navigates it.
 */

import { useEffect, useRef } from 'react';
import type { ShippedOrder } from '@/types/orders';
import type { ScanRoute } from '@/lib/barcode-routing';
import { matchScannedOrder } from '@/lib/orders/scan-order-match';
import { getRecordCursorTop } from '@/lib/record-cursor/store';
import { resolveSearchOrderByPk } from '@/lib/search/resolve-search-order';
import { toast } from '@/lib/toast';

/** Both To ship faces (cards and the floor ledger) publish the record cursor under this id. */
const TO_SHIP_LIST_SURFACE = 'pending-grid-body';

export function useToShipScanOpen({
  enabled,
  records,
  onOpenRecord,
}: {
  enabled: boolean;
  /** The list's rows (loaded, desk lenses applied). */
  records: readonly ShippedOrder[];
  /** The list's own open for a record it does not show (the deep-link path). */
  onOpenRecord: (record: ShippedOrder) => void;
}): void {
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const onOpenRecordRef = useRef(onOpenRecord);
  onOpenRecordRef.current = onOpenRecord;

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let latest = 0;

    const openOnList = (id: number): boolean => {
      const top = getRecordCursorTop('record');
      if (top?.surfaceId !== TO_SHIP_LIST_SURFACE) return false;
      return top.open(id, { intent: 'scan', revealFoldKey: null });
    };

    const offerOutside = (orderNumber: string, load: () => Promise<ShippedOrder | null>) => {
      toast.info(`Order ${orderNumber} isn't in this list`, {
        description: 'Outside the current filters, or not loaded yet.',
        action: {
          label: 'Open',
          onClick: () => {
            void load().then((order) => {
              if (order) onOpenRecordRef.current(order);
              else toast.error(`Couldn't open order ${orderNumber}`);
            });
          },
        },
      });
    };

    const resolveRemote = async (scan: string, ticket: number) => {
      let found: { id: number; orderNumber: string } | null = null;
      try {
        const res = await fetch(`/api/orders/lookup/${encodeURIComponent(scan)}`, { cache: 'no-store' });
        if (res.ok) {
          const order = ((await res.json()) as { order?: { id?: unknown; order_id?: unknown } | null }).order;
          const id = Number(order?.id);
          if (Number.isSafeInteger(id) && id > 0) found = { id, orderNumber: String(order?.order_id ?? id) };
        } else if (res.status !== 404) {
          throw new Error(`orders-lookup ${res.status}`);
        }
      } catch {
        if (live && ticket === latest) toast.error(`Couldn't look up ${scan}`);
        return;
      }
      // A newer scan (or leaving the desk) supersedes this answer.
      if (!live || ticket !== latest) return;
      if (!found) {
        toast.warning(`No order or tracking matches ${scan}`);
        return;
      }
      const { id, orderNumber } = found;
      if (recordsRef.current.some((row) => Number(row.id) === id) && openOnList(id)) return;
      offerOutside(orderNumber, async () => {
        const resolved = await resolveSearchOrderByPk(id);
        return resolved.status === 'ok' ? resolved.order : null;
      });
    };

    const onWedge = (event: Event) => {
      if (event.defaultPrevented) return;
      const detail = (event as CustomEvent<{ value?: string; route?: ScanRoute | null }>).detail;
      const scan = detail?.value?.trim();
      if (!scan) return;
      const row = matchScannedOrder(scan, recordsRef.current);
      if (!row && detail.route?.redirect) return;
      event.preventDefault();
      const ticket = ++latest;
      if (!row) {
        void resolveRemote(scan, ticket);
        return;
      }
      // On the rows but hidden from the screen's order (a status chip, held-new).
      if (!openOnList(Number(row.id))) offerOutside(row.order_id, async () => row);
    };

    window.addEventListener('wedge-scan', onWedge);
    return () => {
      live = false;
      window.removeEventListener('wedge-scan', onWedge);
    };
  }, [enabled]);
}
