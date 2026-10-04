'use client';

import { useQuery } from '@tanstack/react-query';
import type { DetailNavItem } from '@/components/mobile/detail/DetailParts';
import { useUnitQcRow } from '@/components/mobile/qc/useUnitQc';
import { Activity, Archive, History, Inbox, ListChecks, MapPin, Package, ShoppingCart } from '@/components/Icons';
import { timeAgo } from '@/utils/_date';
import { newestUnitEvents, unitEventLabel } from './unitTimeline';
import type { SerialUnitResponse } from '@/lib/serial/use-serial-unit';

interface PackScanResponse {
  success: boolean;
  error?: string;
  /** The pack hub for the unit's open order; it prints the order's bundle on entry. */
  packHref?: string;
}

export type UnitHubVerb = 'pair' | 'move' | 'line-test' | 'stash';

const NO_LINE = 'Not on a receiving line';

/**
 * The unit hub's door registry (mirror of `useRepairHubRows`). A new unit
 * screen plugs in here — its summary hook + one entry — and the hub layout
 * never changes. Hooks are called unconditionally so the hook order is fixed.
 */
export function useUnitHubRows(
  unitRef: string,
  data: SerialUnitResponse | undefined,
  openVerb: (verb: UnitHubVerb) => void,
): DetailNavItem[] {
  const unit = data?.serial_unit ?? null;
  const qc = useUnitQcRow(unit);
  const events = newestUnitEvents(data?.events ?? []);
  const latest = events[0] ?? null;
  // The unit's open order, resolved exactly as a pack-station scan of its label.
  const pack = useQuery<PackScanResponse>({
    queryKey: ['unit-hub.pack-order', unit?.id],
    enabled: unit != null,
    queryFn: async () => {
      const response = await fetch(`/api/packing/resolve-scan?scan=${encodeURIComponent(`U-${unit!.id}`)}`, { cache: 'no-store' });
      return response.json() as Promise<PackScanResponse>;
    },
    refetchOnWindowFocus: false,
  });

  // The allocate route keeps current_status in lockstep with the open
  // allocation, so only an ALLOCATED unit names its order — read off the
  // pairing event the route wrote.
  const pairedRef =
    unit?.current_status === 'ALLOCATED'
      ? events.find((e) => e.event_type === 'ALLOCATED')?.payload?.order_ref
      : null;

  // Line test, Stash and the line door all write to / open the line the unit
  // is on NOW; without one they stay visible but inert.
  const lineId = unit?.current_receiving_line_id ?? null;
  const lastTest = events.find((e) => e.event_type.startsWith('TEST_'));

  return [
    { id: 'qc', title: 'Quality control', icon: <ListChecks />, href: qc.href, meta: qc.meta },
    {
      id: 'line-test',
      title: 'Line test',
      icon: <Activity />,
      onSelect: lineId ? () => openVerb('line-test') : undefined,
      meta: !lineId
        ? NO_LINE
        : lastTest
          ? `${unitEventLabel(lastTest.event_type)} · ${timeAgo(lastTest.occurred_at)}`
          : 'Start, pass or fail',
    },
    {
      id: 'pair',
      title: 'Pair with order',
      icon: <ShoppingCart />,
      onSelect: () => openVerb('pair'),
      meta: pairedRef ? `Paired with ${String(pairedRef)}` : 'Scan an order to pair',
    },
    {
      id: 'pack',
      title: 'Pack order',
      icon: <Package />,
      href: pack.data?.packHref ?? null,
      meta: pack.data?.packHref ? 'Pack and print its papers' : pack.data?.error || 'Not on an open order',
    },
    {
      id: 'move',
      title: 'Move to bin',
      icon: <MapPin />,
      onSelect: () => openVerb('move'),
      meta: unit?.current_location || 'Not in a bin',
    },
    {
      id: 'stash',
      title: 'Stash in bin',
      icon: <Archive />,
      onSelect: lineId ? () => openVerb('stash') : undefined,
      meta: lineId ? `Put away off line L-${lineId}` : NO_LINE,
    },
    {
      id: 'line',
      title: 'Receiving line',
      icon: <Inbox />,
      href: lineId ? `/m/l/${lineId}` : null,
      meta: lineId ? `L-${lineId}` : NO_LINE,
    },
    {
      id: 'history',
      title: 'History',
      icon: <History />,
      href: `/m/u/${unitRef}/history`,
      meta: latest ? `${unitEventLabel(latest.event_type)} · ${timeAgo(latest.occurred_at)}` : 'No events yet',
    },
  ];
}
