/**
 * Labels & docs › Orders (`label-intake.orders`) sidebar facets: Status
 * (Missing · Ready · Printed; absence = All), Missing slot (any-of) and
 * Channel (any-of). Counts are the list's OWN statement
 * (`countOrderPackets`, the `/api/shipping/label-intake/orders` read with the
 * page skipped), each group counted under every OTHER filter — never a second
 * predicate. Params parse exactly as the list route parses them.
 */

import type { NavFacetsResponse } from '@/lib/nav/context/schema';
import { NAV_FACET_GROUPS } from '@/lib/nav/facets/contexts';
import {
  ORDER_PACKET_CHANNEL_PARAM,
  ORDER_PACKET_GAP_LABEL,
  ORDER_PACKET_GAP_PARAM,
  ORDER_PACKET_GAPS,
  ORDER_PACKET_QUERY_PARAM,
  ORDER_PACKET_SORT_PARAM,
  ORDER_PACKET_STATUS_LABEL,
  ORDER_PACKET_STATUS_PARAM,
  ORDER_PACKET_STATUSES,
  type OrderPacketParsedQuery,
  type OrderPacketQueue,
} from '@/lib/label-prints/order-packet-contracts';
import { parseOrderPacketSearchParams } from '@/lib/label-prints/order-packets';

type ParamReader = Pick<URLSearchParams, 'get'>;
export type OrderPacketCountReader = (query: OrderPacketParsedQuery) => Promise<Omit<OrderPacketQueue, 'rows'>>;

/** The list's own params — the facets request also carries `context` / `view`, which the list never reads. */
const LIST_PARAMS = [
  ORDER_PACKET_STATUS_PARAM,
  ORDER_PACKET_GAP_PARAM,
  ORDER_PACKET_CHANNEL_PARAM,
  ORDER_PACKET_SORT_PARAM,
  ORDER_PACKET_QUERY_PARAM,
] as const;

export async function labelIntakeOrdersFacets(params: ParamReader, readCounts: OrderPacketCountReader): Promise<NavFacetsResponse> {
  const groups = NAV_FACET_GROUPS['label-intake.orders'];
  const group = (id: string) => groups.find((each) => each.id === id)!;
  const own = new URLSearchParams();
  for (const key of LIST_PARAMS) {
    const value = params.get(key);
    if (value) own.set(key, value);
  }
  const parsed = parseOrderPacketSearchParams(own);
  if (!parsed.success) {
    return { context: 'label-intake.orders', total: 0, groups: groups.map(({ id, label, param }) => ({ id, label, param, options: [] })) };
  }
  const counts = await readCounts(parsed.data);
  const status = group('status');
  const gap = group('gap');
  const channel = group('channel');
  return {
    context: 'label-intake.orders',
    total: counts.total,
    groups: [
      {
        id: status.id,
        label: status.label,
        param: status.param,
        options: ORDER_PACKET_STATUSES.map((value) => ({ value, label: ORDER_PACKET_STATUS_LABEL[value], count: counts.counts[value] })),
      },
      {
        id: gap.id,
        label: gap.label,
        param: gap.param,
        options: ORDER_PACKET_GAPS.map((value) => ({ value, label: ORDER_PACKET_GAP_LABEL[value], count: counts.gapCounts[value] })),
      },
      {
        id: channel.id,
        label: channel.label,
        param: channel.param,
        options: Object.entries(counts.channelCounts)
          .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
          .map(([value, count]) => ({ value, label: value, count })),
      },
    ],
  };
}
