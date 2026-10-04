'use client';

/**
 * Pair to order — the rail card that puts an unpaired label on its order.
 *
 * A ShipStation label pairs through the order record's own Link label
 * (`POST /api/orders/{id}/labels`: the order's label list, tracking, audit,
 * order note and realtime in one call), keyed by its ShipStation shipment,
 * under a purpose.
 *
 * An uploaded PDF the resolver could not place — the buyer named on it has
 * several open orders (the confirmation exception), or no order carries that
 * buyer — pairs by the operator's pick (`POST /api/v1/label-ingestions/{id}/
 * confirm-order`). The buyer's open orders are offered first, unlabeled ones
 * on top; search covers a buyer whose name differs from the order's. A
 * confirm also re-pairs the buyer's other waiting labels by rule.
 */

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button, SearchField } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { confirmLabelOrderHttp, fetchLabelPairingCandidates } from '@/lib/label-ingestions/http-client';
import type { LabelPrintRow } from '@/lib/label-prints/contracts';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { searchLinkableOrders, type LinkableOrderLine } from '@/lib/shipments/shipment-order-search';
import { LABEL_PURPOSES, LABEL_PURPOSE_FACE, type LabelPurpose } from '@/lib/shipping/label-purpose';
import { formatMonthDayTimePST } from '@/utils/date';
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

/** One pickable order in the card's list — a buyer candidate or a search hit. */
interface PickOption {
  orderId: number;
  orderRef: string | null;
  channel: string | null;
  detail: string;
  /** Right-hand fact: when it was ordered, or that it already holds a label. */
  note: string | null;
}

export function PairOrderCard({ row, onPaired }: { row: LabelPrintRow; onPaired: (orderRef: string | null, alsoPaired: number) => void }) {
  const uploaded = row.shipstationShipmentId == null;
  const confirmable = uploaded && row.state === 'QUARANTINED' && row.trackingNumber != null;
  const [query, setQuery] = useState(uploaded ? '' : (row.orderRef ?? ''));
  const [results, setResults] = useState<LinkableOrderLine[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [picked, setPicked] = useState<PickOption | null>(null);
  const [purpose, setPurpose] = useState<LabelPurpose>('outbound');
  // One key per intended pairing: a double press or a retry replays, never duplicates.
  const clientEventId = useRef(safeRandomUUID());

  const buyer = useQuery({
    queryKey: ['v1', 'label-ingestions', row.id, 'candidates', row.rowVersion],
    queryFn: ({ signal }) => fetchLabelPairingCandidates(row.id, signal),
    enabled: confirmable,
    staleTime: 15_000,
  });

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
    mutationFn: async (order: PickOption): Promise<number> => {
      if (uploaded) return (await confirmLabelOrderHttp(row.id, order.orderId, row.rowVersion)).repaired.length;
      await linkLabel({ orderId: order.orderId, shipmentId: row.shipstationShipmentId!, purpose, clientEventId: clientEventId.current });
      return 0;
    },
    onSuccess: (alsoPaired, order) => {
      clientEventId.current = safeRandomUUID();
      onPaired(order.orderRef, alsoPaired);
    },
  });

  if (uploaded && !confirmable) {
    return (
      <RecordGroup title="Pair to order" testId="pair-order-card">
        <p className="px-4 pb-3 pt-1 text-role-caption text-mode-muted">
          {row.trackingNumber == null
            ? 'No tracking number was read from this PDF, so it cannot be put on an order — print it unpaired, or buy / import the label in ShipStation.'
            : 'Reprocess this label in the label record to read it again.'}
        </p>
      </RecordGroup>
    );
  }

  const candidates: PickOption[] = (buyer.data?.candidates ?? []).map((candidate) => ({
    orderId: candidate.orderId,
    orderRef: candidate.orderRef,
    channel: candidate.accountSource,
    detail: candidate.lines.map((line) => (line.quantity > 1 ? `${line.quantity}× ${line.title}` : line.title)).join(' · ') || candidate.buyerName,
    note: candidate.labeled ? 'Has a label' : candidate.orderedAt ? formatMonthDayTimePST(candidate.orderedAt) : null,
  }));
  const hits: PickOption[] = results.map((line) => ({ orderId: line.orderRowId, orderRef: line.orderRef, channel: line.channel, detail: line.title, note: null }));

  const option = (order: PickOption) => (
    <li key={order.orderId}>
      <button
        type="button"
        role="option"
        aria-selected={picked?.orderId === order.orderId}
        onClick={() => setPicked(order)}
        className={cn(
          'grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 border-b border-mode-divide px-3 py-1.5 text-left last:border-b-0',
          focusRing('control'),
          picked?.orderId === order.orderId ? 'bg-mode-well' : 'hover:bg-mode-hover',
        )}
      >
        <span className="truncate font-semibold text-mode-ink">{order.orderRef ?? `#${order.orderId}`}</span>
        <span className="text-role-caption text-mode-faint">{order.note ?? order.channel ?? ''}</span>
        <span className="col-span-2 truncate text-role-caption text-mode-muted">{order.detail}</span>
      </button>
    </li>
  );

  return (
    <RecordGroup title={uploaded ? 'Confirm order' : 'Pair to order'} testId="pair-order-card">
      <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
        {uploaded ? (
          <>
            <p className="text-role-caption text-mode-muted" data-testid="pair-order-buyer">
              {buyer.data?.shipToName
                ? `Ship to ${buyer.data.shipToName} — ${candidates.length === 0 ? 'no open order carries this buyer.' : 'pick the order this label ships.'}`
                : buyer.isPending ? 'Reading the buyer on this label…' : 'No ship-to name was read — search for the order.'}
            </p>
            {candidates.length > 0 ? (
              <ul role="listbox" aria-label="The buyer's open orders" className="max-h-56 overflow-y-auto rounded-mode-control border border-mode-divide" data-testid="pair-order-candidates">
                {candidates.map(option)}
              </ul>
            ) : null}
            {buyer.error ? <p role="alert" className="text-role-caption text-text-danger">{buyer.error.message}</p> : null}
          </>
        ) : null}
        <SearchField value={query} onChange={setQuery} placeholder="Order #, tracking or title" isSearching={searching} size="compact" />
        {uploaded ? null : <TabSwitch tabs={PURPOSE_TABS} activeTab={purpose} onTabChange={(id) => setPurpose(id as LabelPurpose)} size="sm" />}
        {query.trim().length >= 2 || !uploaded ? (
          <ul role="listbox" aria-label="Matching orders" className="max-h-44 overflow-y-auto rounded-mode-control border border-mode-divide">
            {hits.map(option)}
            {hits.length === 0 ? (
              <li className="px-3 py-1.5 text-role-caption text-mode-faint">
                {searchError ?? (query.trim().length < 2 ? 'Type an order number, tracking or title.' : searching ? 'Searching…' : 'No order matches.')}
              </li>
            ) : null}
          </ul>
        ) : null}
        {pair.error ? <p role="alert" className="text-role-caption text-text-danger">{pair.error.message}</p> : null}
        <Button
          variant="ink"
          radius="control"
          disabled={!picked}
          loading={pair.isPending}
          onClick={() => picked && pair.mutate(picked)}
          data-testid="pair-order-confirm"
        >
          {picked ? `Pair to ${picked.orderRef ?? `#${picked.orderId}`}` : 'Pick an order'}
        </Button>
      </div>
    </RecordGroup>
  );
}
