'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Camera, Printer } from '@/components/Icons';
import { MobileV2OrderPaperworkSheet } from '@/components/mobile/v2/orders/MobileV2OrderPaperworkSheet';
import { OrderInfoCard } from '@/components/mobile/orders/OrderInfoCard';
import { orderDoors } from '@/components/mobile/orders/order-doors';
import { useOrderHub } from '@/components/mobile/orders/useOrderHub';
import { DetailDock } from '@/design-system/components/DetailDock';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import { orderHubTitle, type OrderHubData } from '@/lib/orders/order-hub';
import { triggerPackPrintBundle, type PrintBundleUiState } from '@/lib/print/pack-print-bundle-client';
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

/** One toast per print outcome — the phone has no pack status rail. */
function announcePrint(result: PrintBundleUiState): void {
  if (result.status === 'failed' || result.status === 'missing') toast.error(result.message);
  else if (result.status === 'partial') toast.warning(result.message);
  else toast.success(result.message);
}

/**
 * `/m/pack/start/[orderId]` (`orders.id`) — the pack JOB for one order, on {@link DetailHubScreen}.
 * `?print=1` (a tote / unit pack scan, `/api/packing/resolve-scan`) prints the
 * order's whole bundle — every label, the slip, manuals — once on entry.
 */
function PackJobInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hub = useOrderHub({ byId: true });
  const [paperworkOpen, setPaperworkOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const link = (href: string) => withJobReturn(hub.link(href), pathname);

  const printOnEntry = searchParams.get('print') === '1';
  const orderRowId = hub.data?.order.id ?? null;
  const entryPrinted = useRef(false);
  useEffect(() => {
    if (!printOnEntry || orderRowId == null || entryPrinted.current) return;
    entryPrinted.current = true;
    // Drop the flag so a reload or back-navigation does not print again.
    const rest = new URLSearchParams(searchParams.toString());
    rest.delete('print');
    router.replace(rest.size > 0 ? `${pathname}?${rest}` : pathname);
    void triggerPackPrintBundle({ orderRowId, packerLogId: null }).then(announcePrint);
  }, [printOnEntry, orderRowId, searchParams, pathname, router]);

  const startCapture = async (order: OrderHubData['order']) => {
    if (starting) return;
    setStarting(true);
    try {
      const idempotencyKey = safeRandomUUID();
      const response = await fetch('/api/packing-logs/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ orderId: order.id, clientEventId: idempotencyKey }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !isStartResponse(body)) throw new Error(startFailureMessage(body));
      const query = new URLSearchParams({ orderId: body.orderId, orderRowId: String(order.id), complete: '1' });
      // The capture paints the title + order id top-left.
      query.set('title', hub.data ? orderHubTitle(hub.data) : order.product_title || '');
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
        backHref: '/m/pick',
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
        <MobileV2OrderPaperworkSheet
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
