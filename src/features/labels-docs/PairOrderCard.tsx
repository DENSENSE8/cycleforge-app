'use client';

/**
 * Pair to order — the rail card that puts an unpaired label on its order.
 * The write is the order record's own Link label (`POST /api/orders/{id}/labels`:
 * the order's label list, tracking, audit, order note and realtime in one
 * call), keyed by the label's ShipStation shipment, under a purpose. A label
 * uploaded as a bare PDF has no ShipStation identity to link; it pairs by
 * Reprocess once its order reference is readable.
 */

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button, SearchField } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import type { LabelPrintRow } from '@/lib/label-prints/contracts';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { searchLinkableOrders, type LinkableOrderLine } from '@/lib/shipments/shipment-order-search';
import { LABEL_PURPOSES, LABEL_PURPOSE_FACE, type LabelPurpose } from '@/lib/shipping/label-purpose';
import { cn } from '@/utils/_cn';

const PURPOSE_TABS = LABEL_PURPOSES.map((id) => ({ id, label: LABEL_PURPOSE_FACE[id].label }));

async function linkLabel(input: { orderId: number; shipmentId: number; purpose: LabelPurpose; clientEventId: string }) {
  const response = await fetch(`/api/orders/${input.orderId}/labels`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shipstationShipmentId: input.shipmentId, purpose: input.purpose, clientEventId: input.clientEventId }),
  });
  const body = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!response.ok || body?.success === false) throw new Error(body?.error ?? `Could not pair the label (${response.status}).`);
}

export function PairOrderCard({ row, onPaired }: { row: LabelPrintRow; onPaired: (orderRef: string | null) => void }) {
  const [query, setQuery] = useState(row.orderRef ?? '');
  const [results, setResults] = useState<LinkableOrderLine[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [picked, setPicked] = useState<LinkableOrderLine | null>(null);
  const [purpose, setPurpose] = useState<LabelPurpose>('outbound');
  // One key per intended pairing: a double press or a retry replays, never duplicates.
  const clientEventId = useRef(safeRandomUUID());

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      searchLinkableOrders(q, controller.signal).then(
        (lines) => {
          setResults(lines);
          setSearchError(null);
          setSearching(false);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          setSearchError(error instanceof Error ? error.message : 'Order search failed.');
          setSearching(false);
        },
      );
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const pair = useMutation({
    mutationFn: (order: LinkableOrderLine) => {
      if (row.shipstationShipmentId == null) throw new Error('This label has no ShipStation identity to pair.');
      return linkLabel({ orderId: order.orderRowId, shipmentId: row.shipstationShipmentId, purpose, clientEventId: clientEventId.current });
    },
    onSuccess: (_data, order) => {
      clientEventId.current = safeRandomUUID();
      onPaired(order.orderRef);
    },
  });

  return (
    <RecordGroup title="Pair to order" testId="pair-order-card">
      {row.shipstationShipmentId == null ? (
        <p className="px-4 pb-3 pt-1 text-role-caption text-mode-muted">
          An uploaded PDF pairs when its order reference is read — Reprocess it in the label record, or buy / import the label in ShipStation.
        </p>
      ) : (
        <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
          <SearchField value={query} onChange={setQuery} placeholder="Order #, tracking or title" isSearching={searching} size="compact" />
          <TabSwitch tabs={PURPOSE_TABS} activeTab={purpose} onTabChange={(id) => setPurpose(id as LabelPurpose)} size="sm" />
          <ul role="listbox" aria-label="Matching orders" className="max-h-44 overflow-y-auto rounded-mode-control border border-mode-divide">
            {results.map((order) => (
              <li key={order.orderRowId}>
                <button
                  type="button"
                  role="option"
                  aria-selected={picked?.orderRowId === order.orderRowId}
                  onClick={() => setPicked(order)}
                  className={cn(
                    'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-b border-mode-divide px-3 py-1.5 text-left last:border-b-0',
                    focusRing('control'),
                    picked?.orderRowId === order.orderRowId ? 'bg-mode-well' : 'hover:bg-mode-hover',
                  )}
                >
                  <span className="truncate font-semibold text-mode-ink">{order.orderRef ?? `#${order.orderRowId}`}</span>
                  <span className="text-role-caption text-mode-faint">{order.channel ?? ''}</span>
                  <span className="col-span-2 truncate text-role-caption text-mode-muted">{order.title}</span>
                </button>
              </li>
            ))}
            {results.length === 0 ? (
              <li className="px-3 py-1.5 text-role-caption text-mode-faint">
                {searchError ?? (query.trim().length < 2 ? 'Type an order number, tracking or title.' : searching ? 'Searching…' : 'No order matches.')}
              </li>
            ) : null}
          </ul>
          {pair.error ? <p role="alert" className="text-role-caption text-text-danger">{pair.error.message}</p> : null}
          <Button
            variant="ink"
            radius="control"
            disabled={!picked}
            loading={pair.isPending}
            onClick={() => picked && pair.mutate(picked)}
          >
            {picked ? `Pair to ${picked.orderRef ?? `#${picked.orderRowId}`}` : 'Pick an order'}
          </Button>
        </div>
      )}
    </RecordGroup>
  );
}
