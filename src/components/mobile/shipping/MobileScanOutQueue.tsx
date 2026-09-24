'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, ScanBarcode } from '@/components/Icons';
import { ItemCardRow } from '@/components/mobile/redesign/ItemCardRow';
import { Button, EmptyState } from '@/design-system/primitives';
import { getLast8 } from '@/lib/copy-chip-format';
import { useDockStaging } from './useDockStaging';

export function MobileScanOutQueue() {
  const router = useRouter();
  const query = useDockStaging();
  const rows = query.data?.staged ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card" data-testid="mobile-scan-out-queue">
      <div className="border-b border-border-hairline px-3 py-2 text-role-caption text-text-muted">
        {query.isPending ? 'Loading staged cartons…' : `${rows.length} staged ${rows.length === 1 ? 'carton' : 'cartons'} awaiting carrier`}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isError ? (
          <div className="flex flex-col items-start gap-3 border-b border-border-hairline px-3 py-5">
            <p className="flex items-center gap-2 text-role-caption font-semibold text-text-danger"><AlertTriangle className="h-4 w-4" /> Couldn&apos;t load scan-out work.</p>
            <Button variant="secondary" radius="flush" size="sm" icon={<RefreshCw />} onClick={() => void query.refetch()}>Retry</Button>
          </div>
        ) : !query.isPending && rows.length === 0 ? (
          <EmptyState icon={<ScanBarcode className="h-6 w-6 text-text-soft" />} title="No staged cartons" description="Stage a packed carton at a rack before carrier scan-out." />
        ) : (
          <ul className="flex flex-col">
            {rows.map((row) => {
              const href = `/m/id/scan-out/${encodeURIComponent(row.orderId)}`;
              return (
                <li key={row.shipmentId}>
                  <ItemCardRow title={row.productTitle} imageUrl={row.imageUrl} reference={row.tracking ? `${row.orderId}  ${getLast8(row.tracking)}` : row.orderId} location={row.locationCode || 'Dock'} itemNumber={row.itemNumber || row.sku} qty={row.quantity} onOpen={() => router.push(href)} ariaLabel={`Scan out order ${row.orderId}`} primary={{ label: 'Scan out', icon: <ScanBarcode />, onCommit: () => router.push(href) }} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
