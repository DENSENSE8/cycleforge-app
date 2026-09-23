'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MapPin } from '@/components/Icons';
import { ItemCardRow } from '@/components/mobile/redesign/ItemCardRow';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { Button, EmptyState, Inset, TextField } from '@/design-system/primitives';
import { getLast8 } from '@/lib/copy-chip-format';
import { useDockStaging } from './useDockStaging';

export function MobileDockStagingTask({ shipmentId }: { shipmentId: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useDockStaging();
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const row = query.data?.pending.find((candidate) => candidate.shipmentId === shipmentId) ?? null;

  const commit = async () => {
    if (!row || !location.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/shipping/mark-staged', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId, locationCode: location }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok || body.marked !== 1) {
        throw new Error(body?.error || 'Could not stage this carton');
      }
      // A rack scan is an execution boundary. Warm the queue in the background
      // but never make the worker wait for a network refetch before handing off
      // to carrier scan-out.
      void queryClient.invalidateQueries({ queryKey: ['outbound', 'dock-staging'] });
      router.replace('/m/shipping/scan-out');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not stage this carton');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card" data-testid="mobile-dock-staging-task">
      <MobileDetailTopBar backHref="/m/shipping/stage" subtitle="Stage at rack" title={row?.orderId || 'Packed carton'} mono />
      <main className="min-h-0 flex-1 overflow-y-auto">
        {query.isError ? (
          <EmptyState tone="danger" icon={<AlertTriangle className="h-6 w-6" />} title="Couldn’t load this carton" description="Return to the staging queue and retry." />
        ) : query.isPending ? (
          <p className="border-b border-border-hairline px-3 py-4 text-role-caption text-text-muted">Loading carton…</p>
        ) : !row ? (
          <EmptyState icon={<MapPin className="h-6 w-6 text-text-soft" />} title="Carton already moved" description="It may already be staged or scanned out." />
        ) : (
          <>
            <ItemCardRow title={row.productTitle} imageUrl={row.imageUrl} reference={row.tracking ? `${row.orderId}  ${getLast8(row.tracking)}` : row.orderId} itemNumber={row.itemNumber || row.sku} qty={row.quantity} onOpen={() => undefined} ariaLabel={`Packed order ${row.orderId}`} primary={null} />
            <Inset space="card">
              <div className="border border-border-soft bg-surface-card">
                <TextField appearance="flush" label="Scan rack or staging location" value={location} onChange={setLocation} mono autoFocus autoComplete="off" />
                {error ? <p role="alert" className="border-t border-border-hairline px-3 py-2 text-role-caption text-text-danger">{error}</p> : null}
                <Button variant="primary" radius="flush" size="lg" className="w-full" icon={<MapPin />} disabled={!location.trim() || submitting} loading={submitting} onClick={() => void commit()}>
                  Confirm rack
                </Button>
              </div>
            </Inset>
          </>
        )}
      </main>
    </div>
  );
}
