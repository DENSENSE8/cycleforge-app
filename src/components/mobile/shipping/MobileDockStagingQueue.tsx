'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, MapPin, RefreshCw } from '@/components/Icons';
import { ItemCardRow } from '@/components/mobile/redesign/ItemCardRow';
import { Button, EmptyState } from '@/design-system/primitives';
import { getLast8 } from '@/lib/copy-chip-format';
import { useDockStaging } from './useDockStaging';

export function MobileDockStagingQueue() {
  const router = useRouter();
  const query = useDockStaging();
  const rows = query.data?.pending ?? [];

  return (
    <main className="flex h-full min-h-0 flex-col bg-surface-card" data-testid="mobile-dock-staging-queue">
      <div className="border-b border-border-hairline px-3 py-2 text-role-caption text-text-muted">
        {query.isPending ? 'Loading packed cartons…' : `${rows.length} packed ${rows.length === 1 ? 'carton' : 'cartons'} to stage`}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isError ? (
          <div className="flex flex-col items-start gap-3 border-b border-border-hairline px-3 py-5">
            <p className="flex items-center gap-2 text-role-caption font-semibold text-text-danger">
              <AlertTriangle className="h-4 w-4" /> Couldn&apos;t load staging work.
            </p>
            <Button variant="secondary" radius="flush" size="sm" icon={<RefreshCw />} onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        ) : !query.isPending && rows.length === 0 ? (
          <EmptyState icon={<MapPin className="h-6 w-6 text-text-soft" />} title="No cartons waiting for a rack" description="Packed cartons appear here before carrier scan-out." />
        ) : (
          <ul className="flex flex-col">
            {rows.map((row) => (
              <li key={row.shipmentId}>
                <ItemCardRow
                  title={row.productTitle}
                  imageUrl={row.imageUrl}
                  reference={row.tracking ? `${row.orderId}  ${getLast8(row.tracking)}` : row.orderId}
                  itemNumber={row.itemNumber || row.sku}
                  qty={row.quantity}
                  onOpen={() => router.push(`/m/shipping/stage/${row.shipmentId}`)}
                  ariaLabel={`Stage order ${row.orderId}`}
                  primary={{
                    label: 'Stage',
                    icon: <MapPin />,
                    onCommit: () => router.push(`/m/shipping/stage/${row.shipmentId}`),
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
