'use client';

/**
 * The rack branch of the location record (`/m/loc/RK12`, mounted by
 * `MobileV2LocationRecord` when the code is a rack placard). A rack holds no
 * stock itself: the record is where it stands (placement + derived room) and
 * its shelves as cards (identity `Shelf 3`, arrival tier as the toned status).
 * A shelf card opens the shelf record `/m/loc/RK12-3`. Dock: Print labels
 * (Rack → Shelves → Print, landed on this rack), Move rack (sheet), Add shelf.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Printer, Truck, Warehouse } from '@/components/Icons';
import { InboundPickerRow } from '@/components/mobile/v2/inbound/MobileV2InboundParts';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { useAuth } from '@/contexts/AuthContext';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { MobileRecordCard, MobileRecordCardList } from '@/design-system/components/MobileRecordCard';
import { rackPlacementText } from '@/lib/locations/rack-display';
import { editRackShelves, getRack, rackQueryKey } from '@/lib/locations/racks-client';
import { RACK_MAX_SHELVES } from '@/lib/locations/rack-types';
import { locationHubPath } from '@/lib/mobile/location-hub-href';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { rackLabelsHref } from '@/lib/nav/route-tree';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { plural, rackErrorSentence, rackShelvesLine, shelfTierStatus } from './rack-presentation';
import { MobileV2RackMoveSheet } from './MobileV2RackMoveSheet';

type DockId = 'print' | 'move' | 'add';

export function MobileV2RackRecord({ code, returnTo, backHref }: { code: string; returnTo: string; backHref: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { has } = useAuth();
  const canManage = has('sku_stock.manage');
  const query = useQuery({ queryKey: rackQueryKey(code), queryFn: () => getRack(code) });
  const rack = query.data?.rack ?? null;
  const [moving, setMoving] = useState(false);

  if (query.isPending) return <div className="min-h-full bg-mode-panel px-6 py-16 text-center text-sm text-text-soft">Loading rack…</div>;
  if (!rack) {
    return (
      <div role="alert" className="min-h-full bg-mode-panel px-6 py-16 text-center text-sm font-semibold text-text-danger">
        {rackErrorSentence(query.error, 'Rack not found')}
      </div>
    );
  }

  const addShelf = async () => {
    try {
      const response = await editRackShelves(rack.code, { add: 1, clientEventId: safeRandomUUID() });
      queryClient.setQueryData(rackQueryKey(code), { rack: response.rack });
      void queryClient.invalidateQueries({ queryKey: ['racks'] });
      toast.success(`Added ${response.added.join(', ')} — print its label from Print labels`);
    } catch (err) {
      toast.error(rackErrorSentence(err, 'Could not add a shelf.'));
    }
  };
  const verbs: DetailDockVerb<DockId>[] = [
    { id: 'print', label: 'Print labels', icon: <Printer />, primary: true, testId: 'rack-print-labels' },
    ...(canManage
      ? [
          { id: 'move' as const, label: 'Move rack', icon: <Truck />, testId: 'rack-move' },
          { id: 'add' as const, label: 'Add shelf', icon: <Plus />, disabled: rack.shelves.length >= RACK_MAX_SHELVES, testId: 'rack-add-shelf' },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-full flex-col bg-mode-panel" data-testid="mobile-v2-rack">
      <MobileV2DetailTopBar
        title={rack.name}
        subtitle={rackPlacementText(rack)}
        meta={rackShelvesLine(rack)}
        backHref={backHref}
        close
        lead={<Warehouse className="h-5 w-5 text-emerald-600" />}
        scanHref={`/m/scan?intent=location&returnTo=${encodeURIComponent(returnTo)}`}
      />

      <InboundPickerRow
        label="Stands in"
        value={rack.placement.name}
        placeholder="No placement"
        locked={!canManage}
        onOpen={() => setMoving(true)}
        testId="rack-placement-fact"
      />
      {/* One fact once: the Room row only when the rack stands on a spot INSIDE a room. */}
      {rack.room && rack.room.id !== rack.placement.id ? (
        <InboundPickerRow
          label="Room"
          value={rack.room.name}
          placeholder="Not in a room"
          locked
          onOpen={() => undefined}
          testId="rack-room-fact"
        />
      ) : null}

      <div className="flex-1">
        {rack.shelves.length === 0 ? (
          <p className="break-words px-mode-page py-10 text-center text-role-caption text-text-muted">No shelves on this rack.</p>
        ) : (
          <MobileRecordCardList label={plural(rack.shelves.length, 'shelf', 'shelves')}>
            {rack.shelves.map((shelf) => {
              const face = shelfTierStatus(shelf.tier);
              return (
                <MobileRecordCard
                  key={shelf.id}
                  identity={`Shelf ${shelf.shelf}`}
                  title={shelf.code}
                  detail={shelf.stockQty > 0 ? plural(shelf.stockQty, 'unit') : 'Empty'}
                  count={shelf.positions.length > 0 ? plural(shelf.positions.length, 'position') : null}
                  status={face.status}
                  tone={face.tone}
                  onOpen={() => router.push(withJobReturn(locationHubPath(shelf.code), returnTo))}
                  testId="rack-shelf-card"
                />
              );
            })}
          </MobileRecordCardList>
        )}
      </div>

      <DetailDock
        label="Rack actions"
        verbs={verbs}
        onVerb={(id) => {
          if (id === 'print') router.push(withJobReturn(rackLabelsHref({ rack: rack.code }), returnTo));
          else if (id === 'move') setMoving(true);
          else return addShelf();
        }}
      />

      <MobileV2RackMoveSheet
        rack={rack}
        open={moving}
        onClose={() => setMoving(false)}
        onMoved={(moved) => queryClient.setQueryData(rackQueryKey(code), { rack: moved })}
      />
    </div>
  );
}
