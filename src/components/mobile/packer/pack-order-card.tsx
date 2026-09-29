'use client';

/**
 * The pack sheets' shared half (`/m/pack`, owner 2026-09-29): the To-ship
 * queue as order cards (the pick list's read — one cache, one realtime
 * invalidation), where an order stands between pick and pack, and the
 * orders adapter over the phone card face ({@link RecordCardMobile}: bin ·
 * SLA · photo · title · ×qty · condition · price · platform).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrandIdentityDot } from '@/components/ui/grid-cells';
import { RecordCardMobile } from '@/design-system/components/record-card/RecordCardMobile';
import { useOrderChannel } from '@/hooks/useCatalog';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { orderCardModel, orderRecordLine, type OrderCardModel } from '@/lib/orders/order-card-model';
import { toShipQueueOrders, toShipQueueQuery } from '@/lib/orders/to-ship-queue';
import type { PackScanResult } from '@/lib/packing/pack-scan';
import { platformDisplayName } from '@/lib/platform-display';
import { resolveOrderBin } from '@/lib/shipping/outbound-storage-path';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { OUTBOUND_TRIAGE_VIEW } from '@/lib/triage/views';
import { getCurrentPSTDateKey } from '@/utils/date';

export type PackScanOrder = Extract<PackScanResult, { kind: 'order' }>;
export type PackScanBin = Extract<PackScanResult, { kind: 'bin' }>;

/** Where the pack sheets return to after an action opens its screen. */
export const PACK_HREF = '/m/pack';

export const packJobHref = (orderId: number) => `/m/pack/start/${orderId}`;
export const pickOrderHref = (orderId: number) => `/m/pick?order=${orderId}`;

/** The To-ship queue as order cards (every line of each order), keyed for the sheets. */
export function useQueueCards() {
  const { getStaffName } = useStaffNameMap();
  const queue = useQuery(toShipQueueQuery());
  const todayKey = getCurrentPSTDateKey();
  const cards = useMemo(
    () =>
      toShipQueueOrders(queue.data ?? []).map((lines) =>
        orderCardModel(`${lines[0]?.order_id ?? ''}#${lines[0]?.id ?? ''}`, lines, todayKey, getStaffName),
      ),
    [queue.data, todayKey, getStaffName],
  );
  return { cards, queue, todayKey, getStaffName };
}

/** The order's pick / pack reading: picked, not yet packed = ready to pack. */
export function packReadiness(model: OrderCardModel): 'toPick' | 'readyToPack' | 'packed' {
  const pick = model.stages.find((stage) => stage.kind === 'pick');
  if (model.pack.done) return 'packed';
  return pick?.done ? 'readyToPack' : 'toPick';
}

/** The orders adapter over the phone card — the pick list's face (bin · SLA · photo · facts · platform). */
export function PackOrderCard({ model, onOpen, testIdPrefix }: { model: OrderCardModel; onOpen: () => void; testIdPrefix: string }) {
  const channel = useOrderChannel()(model.orderId, model.accountSource);
  const channelName = platformDisplayName(channel);
  const bin = resolveOrderBin(model.lead.storage_locations, model.lead.sku_home_location).path;
  const title = model.lines[0]?.title ?? '';
  return (
    <RecordCardMobile
      model={{
        key: model.key,
        leadId: model.lead.id,
        channel: channelName
          ? {
              label: channelName,
              dot: <BrandIdentityDot {...platformMetaBrandDot(channel.meta)} />,
              badge: model.fba ? 'FBA' : model.pickup ? 'Pickup' : null,
            }
          : null,
        deadline: model.sla,
        lines: model.lines.map(orderRecordLine),
        aria: { card: `${title}, order ${model.orderId}${bin ? `, bin ${bin}` : ''}`, open: `Open order ${model.orderId}` },
      }}
      factColumns={OUTBOUND_TRIAGE_VIEW.facts}
      location={{ path: bin }}
      onOpen={onOpen}
      testIdPrefix={testIdPrefix}
    />
  );
}
