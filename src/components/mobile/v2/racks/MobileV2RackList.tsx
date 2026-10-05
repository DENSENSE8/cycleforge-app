'use client';

/**
 * `/m/racks` — every movable rack of the org (door: the phone menu › Inventory › Racks). One
 * `MobileRecordCard` per rack: identity `Rack 12`, last moved top-right, the
 * derived placement as the title, `5 shelves · 2 arrival` under it, the most
 * urgent shelf tier as the status. The room is only a filter chip, never a
 * step. The floating CTA starts New rack; Print labels opens Rack → Shelves →
 * Print. A card opens the rack record (`/m/loc/RK12`).
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { listRacks, racksQueryKey } from '@/lib/locations/racks-client';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { WAREHOUSE_PATHS } from '@/lib/nav/route-tree';
import { cn } from '@/utils/_cn';
import { formatMonthDayTimePST } from '@/utils/date';
import { rackPlacementText, rackShelfCountText } from '@/lib/locations/rack-display';
import { plural, rackErrorSentence } from './rack-presentation';

const RACKS_HREF = WAREHOUSE_PATHS.racks;
const ALL_ROOMS = 'all';

export function MobileV2RackList() {
  const router = useRouter();
  const { has } = useAuth();
  const canManage = has('sku_stock.manage');
  const query = useQuery({ queryKey: racksQueryKey(), queryFn: () => listRacks() });
  const racks = useMemo(() => query.data?.racks ?? [], [query.data]);
  const [room, setRoom] = useState<string>(ALL_ROOMS);

  const rooms = useMemo(() => {
    const seen = new Map<string, { id: string; label: string; count: number }>();
    for (const rack of racks) {
      const key = String(rack.room?.id ?? 'none');
      const entry = seen.get(key);
      if (entry) entry.count += 1;
      else seen.set(key, { id: key, label: rack.room?.name ?? 'No room', count: 1 });
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [racks]);
  const shown = room === ALL_ROOMS ? racks : racks.filter((rack) => String(rack.room?.id ?? 'none') === room);

  const verbs: DetailDockVerb<'print' | 'new'>[] = [
    // Two pills share the fixed float width: labels only, so neither wraps.
    ...(racks.length > 0 ? [{ id: 'print' as const, label: 'Print labels', icon: null, testId: 'racks-print-labels' }] : []),
    ...(canManage ? [{ id: 'new' as const, label: 'New rack', icon: null, primary: true, testId: 'racks-new' }] : []),
  ];

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="m-racks">
      {rooms.length > 1 ? (
        <nav className="flex gap-2 overflow-x-auto border-b border-mode-rule px-mode-page py-2" aria-label="Filter racks by room">
          {[{ id: ALL_ROOMS, label: 'All rooms', count: racks.length }, ...rooms].map((chip) => (
            <button
              key={chip.id}
              type="button"
              aria-pressed={room === chip.id}
              onClick={() => setRoom(chip.id)}
              className={cn(
                'h-9 shrink-0 rounded-full border px-3 text-xs font-semibold',
                room === chip.id ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-mode-rule bg-mode-panel text-mode-ink',
              )}
              data-testid="racks-room-chip"
            >
              {chip.label} <span className="tabular-nums opacity-75">· {chip.count}</span>
            </button>
          ))}
        </nav>
      ) : null}

      <div className="flex-1">
        {query.isPending ? (
          <p className="break-words px-mode-page py-10 text-center text-role-caption text-text-muted">Loading racks…</p>
        ) : query.isError ? (
          <p role="alert" className="break-words px-mode-page py-10 text-center text-role-caption font-semibold text-text-danger">
            {rackErrorSentence(query.error, 'Could not load racks.')}
          </p>
        ) : shown.length === 0 ? (
          <p className="break-words px-mode-page py-10 text-center text-role-caption text-text-muted">
            {canManage ? 'No racks yet. Start one with New rack.' : 'No racks yet.'}
          </p>
        ) : (
          <MobileRecordCardList label={plural(shown.length, 'rack')}>
            {shown.map((rack) => (
              <MobileRecordCard
                key={rack.id}
                identity={rack.name}
                timestamp={formatMonthDayTimePST(rack.lastMovedAt)}
                title={rackPlacementText(rack)}
                detail={rackShelfCountText(rack.shelfCount)}
                onOpen={() => router.push(withJobReturn(locationHubPath(rack.code), RACKS_HREF))}
                testId="rack-card"
              />
            ))}
          </MobileRecordCardList>
        )}
      </div>

      {verbs.length > 0 ? (
        <DetailDock
          label="Racks"
          placement="float"
          verbs={verbs}
          onVerb={(id) => router.push(id === 'new' ? WAREHOUSE_PATHS.newRack : WAREHOUSE_PATHS.rackLabels)}
        />
      ) : null}
    </div>
  );
}
