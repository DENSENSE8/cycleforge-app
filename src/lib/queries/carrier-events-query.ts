/**
 * The small carrier-event reads (`shipment_tracking_events`), one per record
 * that owns a shipment — the outbound order and the inbound carton. Both
 * return the same payload, newest event first, for `CarrierEventsRail`.
 */

export interface CarrierEvent {
  id: number;
  eventOccurredAt: string | null;
  category: string | null;
  label: string | null;
  description: string | null;
  city: string | null;
  state: string | null;
  exception: string | null;
  signedBy: string | null;
}

export interface CarrierEventsPayload {
  carrier: string | null;
  trackingNumber: string | null;
  /** The carrier's promised arrival — carried by the carton read (the order row carries its own). */
  estimatedDeliveryAt: string | null;
  deliveredAt: string | null;
  isDelivered: boolean;
  events: CarrierEvent[];
}

async function fetchCarrierEvents(url: string): Promise<CarrierEventsPayload> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Failed to fetch carrier events');
  const body = (await response.json()) as Partial<CarrierEventsPayload>;
  return {
    carrier: typeof body.carrier === 'string' ? body.carrier : null,
    trackingNumber: typeof body.trackingNumber === 'string' ? body.trackingNumber : null,
    estimatedDeliveryAt: typeof body.estimatedDeliveryAt === 'string' ? body.estimatedDeliveryAt : null,
    deliveredAt: typeof body.deliveredAt === 'string' ? body.deliveredAt : null,
    isDelivered: body.isDelivered === true,
    events: Array.isArray(body.events) ? body.events : [],
  };
}

export function orderCarrierEventsQuery(orderId: number) {
  return {
    queryKey: ['order-carrier-events', orderId] as const,
    queryFn: () => fetchCarrierEvents(`/api/orders/${orderId}/carrier-events`),
    enabled: Number.isInteger(orderId) && orderId > 0,
    staleTime: 30_000,
  };
}

/** The receiving carton's shipment scans (`receiving_carton.shipment_id`). */
export function cartonCarrierEventsQuery(receivingId: number) {
  return {
    queryKey: ['carton-carrier-events', receivingId] as const,
    queryFn: () => fetchCarrierEvents(`/api/receiving/${receivingId}/carrier-events`),
    enabled: Number.isInteger(receivingId) && receivingId > 0,
    staleTime: 30_000,
  };
}

/** The repair's inbound shipment scans (`repair_service.source_tracking_number`). */
export function repairCarrierEventsQuery(repairId: number) {
  return {
    queryKey: ['repair-carrier-events', repairId] as const,
    queryFn: () => fetchCarrierEvents(`/api/repair-service/${repairId}/carrier-events`),
    enabled: Number.isInteger(repairId) && repairId > 0,
    staleTime: 30_000,
  };
}
