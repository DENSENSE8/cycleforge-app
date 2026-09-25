'use client';

import { Suspense, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Camera, Printer } from '@/components/Icons';
import { MobileOrderPaperworkSheet } from '@/components/mobile/orders/MobileOrderPaperworkSheet';
import { OrderInfoCard } from '@/components/mobile/orders/OrderInfoCard';
import { orderDoors } from '@/components/mobile/orders/order-doors';
import { useOrderHub } from '@/components/mobile/orders/useOrderHub';
import { DetailDock } from '@/design-system/components/DetailDock';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { sendWithBuyerNoteAck } from '@/lib/orders/buyer-note-ack-client';
import type { OrderHubData } from '@/lib/orders/order-hub';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';

type PackVerb = 'paperwork' | 'photos';

type StartResponse = { success: true; packerLogId: number; orderId: string };

function isStartResponse(value: unknown): value is StartResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<StartResponse>;
  return response.success === true && typeof response.packerLogId === 'number' && typeof response.orderId === 'string';
}

function startFailureMessage(value: unknown): string {
  if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') return value.error;
  return 'Could not start packing.';
}

/**
 * `/m/pack/start/[orderId]` (`orders.id`) — the pack JOB for one order, on
 * {@link DetailHubScreen}: a scanned tote (`/api/packing/resolve-tote`) or a
 * Pack verb lands here. The order card opens its `/info`, the doors open the
 * order's Units · Activity, and the X returns to `/m/pack`. Every order screen
 * opened from here carries `?back=` so its X returns to this job.
 *
 * Dock: Paperwork (view, pair, print / reprint the bundle) · Take photos
 * (primary). A CAPTURING draft is created only when the camera opens; nothing
 * here marks the order packed — the guided camera finalizes after evidence.
 */
function PackJobInner() {
  const router = useRouter();
  const pathname = usePathname();
  const hub = useOrderHub({ byId: true });
  const [paperworkOpen, setPaperworkOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const link = (href: string) => withJobReturn(hub.link(href), pathname);

  const startCapture = async (order: OrderHubData['order']) => {
    if (starting) return;
    setStarting(true);
    try {
      const response = await sendWithBuyerNoteAck(() => {
        const idempotencyKey = safeRandomUUID();
        return fetch('/api/packing-logs/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ orderId: order.id, clientEventId: idempotencyKey }),
        });
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !isStartResponse(body)) throw new Error(startFailureMessage(body));
      const query = new URLSearchParams({ orderId: body.orderId, orderRowId: String(order.id), complete: '1' });
      router.push(`/m/p/${body.packerLogId}/photos?${query}`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not start packing.');
    } finally {
      setStarting(false);
    }
  };

  return (
    <DetailHubScreen<OrderHubData>
      record={hub.data}
      state={{ loading: hub.loading, error: hub.error, onRetry: hub.reload }}
      bar={{
        title: hub.data?.order.order_id ?? hub.param,
        mono: true,
        subtitle: 'Pack',
        backHref: '/m/pack',
        close: true,
      }}
      card={(d) => <OrderInfoCard data={d} href={link(`${hub.base}/info`)} stagePending={hub.workPending} />}
      rowsLabel="Order screens"
      rows={(d) => orderDoors(d, hub.base, link)}
      dock={(d) => (
        <DetailDock<PackVerb>
          label="Pack actions"
          verbs={[
            { id: 'paperwork', label: 'Paperwork', icon: <Printer /> },
            { id: 'photos', label: starting ? 'Starting…' : 'Take photos', icon: <Camera />, primary: true, disabled: starting },
          ]}
          onVerb={(verb) => {
            if (verb === 'paperwork') setPaperworkOpen(true);
            else void startCapture(d.order);
          }}
        />
      )}
    >
      {(d) => (
        <MobileOrderPaperworkSheet
          open={paperworkOpen}
          onClose={() => setPaperworkOpen(false)}
          orderId={d.order.id}
          orderRef={d.order.order_id}
          pack={{ packerLogId: null }}
        />
      )}
    </DetailHubScreen>
  );
}

export default function PackJobPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <PackJobInner />
    </Suspense>
  );
}
