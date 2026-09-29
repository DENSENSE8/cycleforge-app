/** A carrier poll changed something an order/queue surface can render. */
export function shouldPublishCarrierSync(args: {
  previousStatus: string | null | undefined;
  nextStatus: string | null | undefined;
  wasDelivered: boolean;
  deliveredAt: string | null | undefined;
  eventsInserted: number;
}): boolean {
  const previous = String(args.previousStatus ?? '').trim().toUpperCase();
  const next = String(args.nextStatus ?? '').trim().toUpperCase();
  return args.eventsInserted > 0
    || previous !== next
    || (!args.wasDelivered && (next === 'DELIVERED' || Boolean(args.deliveredAt)));
}
