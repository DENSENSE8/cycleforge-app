export interface OrderCarrierEvent {
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

export interface OrderCarrierEventsPayload {
  carrier: string | null;
  trackingNumber: string | null;
  events: OrderCarrierEvent[];
}

export function orderCarrierEventsQuery(orderId: number) {
  return {
    queryKey: ['order-carrier-events', orderId] as const,
    queryFn: async (): Promise<OrderCarrierEventsPayload> => {
      const response = await fetch(`/api/orders/${orderId}/carrier-events`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Failed to fetch carrier events');
      const body = (await response.json()) as Partial<OrderCarrierEventsPayload>;
      return {
        carrier: typeof body.carrier === 'string' ? body.carrier : null,
        trackingNumber: typeof body.trackingNumber === 'string' ? body.trackingNumber : null,
        events: Array.isArray(body.events) ? body.events : [],
      };
    },
    enabled: Number.isInteger(orderId) && orderId > 0,
    staleTime: 30_000,
  };
}
