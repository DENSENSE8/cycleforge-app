'use client';

/**
 * A scanned unit SERIAL's order on `/m/pack` (owner 2026-09-29), from
 * `GET /api/packing/resolve-scan`: the order on the phone card face, then
 * order #, buyer, ship-by, picked-by, tote and serial, and the pack action
 * (the pack job, `/m/pack/start`). Read-only — every action is the existing
 * screen. An order outside the To-ship queue (no label yet, or past its
 * window) reads its own row.
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { Button } from '@/design-system/primitives';
import { orderCardModel, type OrderCardModel } from '@/lib/orders/order-card-model';
import { normalizeUnshippedOrdersPayload } from '@/lib/orders/order-record-normalize';
import { formatDateKeyMedium, toPSTDateKey } from '@/utils/date';
import type { ShippedOrder } from '@/types/orders';
import { PackOrderCard, packJobHref, packReadiness, pickOrderHref, useQueueCards, type PackScanOrder } from './pack-order-card';

/** One order row by `orders.id`, in any state (`GET /api/orders?orderId=`). */
async function fetchOrderRow(orderId: number): Promise<ShippedOrder | null> {
  const res = await fetch(`/api/orders?orderId=${orderId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't load the order (${res.status})`);
  const data = (await res.json()) as { orders?: unknown[] };
  return normalizeUnshippedOrdersPayload(data.orders ?? [], { includeFba: true }).find((row) => Number(row.id) === orderId) ?? null;
}

function stageLine(stage: { done: boolean; who: string | null; at: string | null } | undefined, pending: string): string {
  if (!stage?.done) return stage?.who ? `${pending} · assigned ${stage.who}` : pending;
  return [stage.who ?? 'Someone', stage.at].filter(Boolean).join(' · ');
}

/** The ship-by day in words beside its SLA face: "Tomorrow · Wed, Sep 30, 2026". */
function shipByFact(model: OrderCardModel): string {
  const key = toPSTDateKey(model.lead.deadline_at ?? model.lead.ship_by_date ?? null);
  if (!key || key === 'Unknown') return model.sla.face;
  return `${model.sla.face} · ${formatDateKeyMedium(key, { weekday: 'short', withYear: true })}`;
}

/** A scanned serial's order: the card, the facts a packer checks, and the pack action. */
export function PackOrderSheet({ scan, onClose }: { scan: PackScanOrder | null; onClose: () => void }) {
  const router = useRouter();
  const { cards, queue, todayKey, getStaffName } = useQueueCards();
  const orderId = scan?.orderId ?? null;
  const fromQueue = orderId == null ? null : cards.find((card) => card.ids.includes(orderId)) ?? null;
  // Outside the To-ship queue (no label yet, or past its window): the order's own row, any state.
  const single = useQuery({
    queryKey: ['pack-scan-order', orderId],
    queryFn: () => fetchOrderRow(orderId!),
    enabled: orderId != null && fromQueue == null && !queue.isPending,
    staleTime: 30_000,
  });
  const model = useMemo<OrderCardModel | null>(() => {
    if (fromQueue) return fromQueue;
    const row = single.data;
    return row ? orderCardModel(`${row.order_id ?? ''}#${row.id}`, [row], todayKey, getStaffName) : null;
  }, [fromQueue, single.data, todayKey, getStaffName]);

  const loading = orderId != null && !model && (queue.isPending || single.isPending);
  const readiness = model ? packReadiness(model) : null;
  const pick = model?.stages.find((stage) => stage.kind === 'pick');
  const hasLabel = Boolean(String(model?.lead.shipping_tracking_number ?? '').trim());
  const orderRef = model?.orderId ?? scan?.orderRef ?? (orderId != null ? String(orderId) : '');

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <BottomSheet
      open={scan != null}
      onClose={onClose}
      forceVariant="sheet"
      scrollBody
      title={scan?.serial ? `Serial ${scan.serial}` : `Order ${orderRef}`}
    >
      <div className="flex min-h-0 flex-col gap-3 pb-2 pt-2" data-testid="pack-order-sheet">
        {loading ? (
          <p className="py-6 text-center text-role-body text-text-muted" aria-live="polite">
            Loading order…
          </p>
        ) : model && orderId != null ? (
          <>
            <PackOrderCard model={model} onOpen={() => go(packJobHref(orderId))} testIdPrefix="pack-order-card" />
            <div className="flex flex-col" data-testid="pack-order-facts">
              <EvidenceFactRow label="Order">
                <span className="font-mono">{model.orderId}</span>
              </EvidenceFactRow>
              <EvidenceFactRow label="Buyer">{model.buyerName ?? '—'}</EvidenceFactRow>
              <EvidenceFactRow label="Ship by">{shipByFact(model)}</EvidenceFactRow>
              <EvidenceFactRow label="Picked by">{stageLine(pick, 'Not picked yet')}</EvidenceFactRow>
              <EvidenceFactRow label="Tote">
                {scan?.toteCode ? <span className="font-mono">{scan.toteCode}</span> : 'No tote'}
              </EvidenceFactRow>
              {scan?.serial ? (
                <EvidenceFactRow label="Serial">
                  <span className="font-mono">{scan.serial}</span>
                </EvidenceFactRow>
              ) : null}
              {model.pack.done ? <EvidenceFactRow label="Packed by">{stageLine(model.pack, '')}</EvidenceFactRow> : null}
            </div>
            {readiness !== 'packed' && !hasLabel ? (
              <Alert variant="warning">
                <AlertDescription>No shipping label yet — packing starts once the label is bought.</AlertDescription>
              </Alert>
            ) : null}
            {readiness === 'toPick' ? (
              <Button variant="secondary" size="lg" radius="mode" className="w-full" onClick={() => go(pickOrderHref(orderId))}>
                Pick it first
              </Button>
            ) : null}
            <Button
              variant="primary"
              size="xl"
              radius="mode"
              className="w-full"
              data-testid="pack-order-action"
              onClick={() => go(packJobHref(orderId))}
            >
              {readiness === 'packed' ? 'Open pack job' : `Pack ${model.orderId}`}
            </Button>
          </>
        ) : (
          <>
            <Alert variant="warning">
              <AlertDescription>
                Couldn&apos;t load order {orderRef}
                {scan?.productTitle ? ` (${scan.productTitle})` : ''}.
              </AlertDescription>
            </Alert>
            {orderId != null ? (
              <Button variant="secondary" size="lg" radius="mode" className="w-full" onClick={() => go(packJobHref(orderId))}>
                Open the order
              </Button>
            ) : null}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
