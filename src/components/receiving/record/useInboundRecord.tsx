'use client';

/**
 * The inbound record's reads — an incoming delivery or a carton — as a
 * `RecordModel` + verbs (its Actions panel) for the shared `useRecordSlot`.
 */

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCartonRecord } from '@/components/receiving/history/use-carton-record';
import { useIncomingDetails } from '@/components/sidebar/receiving/incoming-details/useIncomingDetails';
import { useAuth } from '@/contexts/AuthContext';
import type { RecordModel, RecordVerb } from '@/design-system/components/record-ledger/record-model';
import { cartonCarrierEventsQuery } from '@/lib/queries/carrier-events-query';
import { incomingDetailsTargetFromRow } from '@/lib/receiving/incoming-details-target';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { inboundCartonModel, inboundDeliveryModel } from './inbound-record-model';
import { buildInboundDeliveryVerbs, useInboundCartonVerbs, type IncomingDelivery } from './inbound-record-verbs';

/**
 * The open incoming delivery — its details read (`useIncomingDetails`), its
 * model and its verbs. `row` null keeps the read idle.
 */
export function useInboundDeliveryRecord({
  row,
  lines,
  onRemoved,
}: {
  row: ReceivingLineRow | null;
  /** Every loaded line of the open purchase (the open line included). */
  lines: readonly ReceivingLineRow[];
  onRemoved: () => void;
}): { model: RecordModel; verbs: RecordVerb[] } | null {
  const router = useRouter();
  const canSyncZoho = useAuth().has('integrations.zoho');
  const resolved = row ? incomingDetailsTargetFromRow(row) : null;
  const target = resolved?.ok ? resolved.target : null;
  const controller = useIncomingDetails({
    zohoPurchaseOrderId: target?.poId ?? null,
    poNumberHint: target?.poNumber ?? null,
    shipmentId: target?.shipmentId ?? null,
    inboundSourceType: target?.inboundSourceType ?? null,
    inboundSourceOrderId: target?.inboundSourceOrderId ?? null,
    focusReceivingId: target?.receivingId ?? null,
  });
  if (!row) return null;
  const delivery: IncomingDelivery = { resolved, controller };
  const data = controller.data?.success ? controller.data : undefined;
  return {
    model: inboundDeliveryModel(row, lines, {
      data,
      loading: controller.isLoading,
      error: controller.isError,
      unresolved: resolved && !resolved.ok ? resolved.toast || 'This delivery has no resolvable purchase identity.' : null,
      refetch: () => void controller.refetch(),
      invalidate: controller.invalidateIncoming,
    }),
    verbs: buildInboundDeliveryVerbs({ row, delivery, canSyncZoho, navigate: router.push, onRemoved }),
  };
}

/** The open carton — its carton + lines read (`useCartonRecord`), its carrier scans, model and verbs. */
export function useInboundCartonRecord(
  row: ReceivingLineRow | null,
  onClose: () => void,
): { model: RecordModel; verbs: RecordVerb[] } | null {
  const record = useCartonRecord(row);
  const verbs = useInboundCartonVerbs(record, onClose);
  const carrier = useQuery({ ...cartonCarrierEventsQuery(record?.receivingId ?? 0), enabled: record != null });
  if (!record || !row) return null;
  const model = inboundCartonModel(record, row.id, {
    events: carrier.data?.events ?? [],
    carrier: carrier.data?.carrier ?? null,
    estimatedDeliveryAt: carrier.data?.estimatedDeliveryAt ?? null,
    deliveredAt: carrier.data?.deliveredAt ?? null,
    isDelivered: carrier.data?.isDelivered ?? false,
    loading: carrier.isLoading,
    error: carrier.isError,
  });
  return { model, verbs };
}
