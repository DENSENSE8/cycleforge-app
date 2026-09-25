'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Activity, Copy, FileText, Hash, ScanBarcode } from '@/components/Icons';
import { MobileOrderDocumentsSheet } from '@/components/mobile/redesign/MobileOrderDocumentsSheet';
import { OrderInfoCard } from '@/components/mobile/orders/OrderInfoCard';
import { useOrderHub } from '@/components/mobile/orders/useOrderHub';
import { DetailDock } from '@/design-system/components/DetailDock';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import type { OutboundDocumentsResponse, OutboundDocumentType } from '@/lib/documents/types';
import { detailDoor, type DetailDoor } from '@/lib/mobile/detail-door';
import { formatOrderStamp, plural, type OrderHubData } from '@/lib/orders/order-hub';
import { toast } from '@/lib/toast';

type OrderVerb = 'documents' | 'copy' | 'scan';

function orderDoors(data: OrderHubData, base: string, link: (href: string) => string): DetailDoor[] {
  const serials = data.order.serials.length;
  const doors = [
    detailDoor(base, 'units', 'Units', <Hash />, {
      meta: serials > 0 ? plural(serials, 'serial') : 'No serials recorded on this order yet',
      enabled: serials > 0,
    }),
    detailDoor(base, 'activity', 'Activity', <Activity />, {
      meta: data.activity.length > 0 ? plural(data.activity.length, 'recent event') : 'Nothing recorded yet',
    }),
  ];
  return doors.map((door) => (door.href ? { ...door, href: link(door.href) } : door));
}

async function fetchOrderDocuments(pk: number): Promise<OutboundDocumentsResponse> {
  const res = await fetch(`/api/orders/${pk}/documents`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load order documents');
  return (await res.json()) as OutboundDocumentsResponse;
}

/**
 * `/m/orders/[orderId]` — the order HUB on {@link DetailHubScreen} (the
 * exoskeleton; reference `/m/r/[id]`). The route param is the public
 * `order_id`, with the `orders.id` pk as a fallback (`useOrderHub`).
 *
 * The primary record of a pick or an exception is a full screen, never a sheet
 * (operator 2026-09-24): opened from a job with `?back=<job>`, the bar shows an
 * X that returns there. A read-only card opens `/info`; doors open Units and
 * Activity; the dock is Documents · Copy order # · Scan again.
 */
function OrderHubInner() {
  const router = useRouter();
  const hub = useOrderHub();
  const pk = hub.data?.order.id ?? null;
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [activeType, setActiveType] = useState<OutboundDocumentType>('shipping_label');
  // Same key as the to-ship sheet's documents read, so the two stay cache-coherent.
  const documents = useQuery({
    queryKey: ['order-documents', pk],
    queryFn: () => fetchOrderDocuments(pk as number),
    enabled: documentsOpen && pk != null,
  });

  const copy = (orderNumber: string) => {
    navigator.clipboard?.writeText(orderNumber).then(
      () => toast.success(`Copied ${orderNumber}`),
      () => toast.error('Copy failed'),
    );
  };

  return (
    <DetailHubScreen<OrderHubData>
      record={hub.data}
      state={{ loading: hub.loading, error: hub.error, onRetry: hub.reload }}
      bar={{
        title: hub.data?.order.order_id ?? hub.param,
        mono: true,
        subtitle: 'Order',
        backHref: hub.back ?? undefined,
        close: hub.back != null,
        meta: (d) => {
          const at = formatOrderStamp(d.order.order_date ?? d.order.created_at);
          return at ? `Ordered ${at}` : undefined;
        },
      }}
      card={(d) => <OrderInfoCard data={d} href={hub.link(`${hub.base}/info`)} stagePending={hub.workPending} />}
      rowsLabel="Order screens"
      rows={(d) => orderDoors(d, hub.base, hub.link)}
      dock={(d) => (
        <DetailDock<OrderVerb>
          label="Order actions"
          verbs={[
            { id: 'documents', label: 'Documents', icon: <FileText />, primary: true },
            { id: 'copy', label: 'Copy order #', icon: <Copy /> },
            { id: 'scan', label: 'Scan again', icon: <ScanBarcode /> },
          ]}
          onVerb={(verb) => {
            if (verb === 'documents') setDocumentsOpen(true);
            else if (verb === 'copy') copy(d.order.order_id);
            else router.push('/m/scan');
          }}
        />
      )}
    >
      {() => (
        <MobileOrderDocumentsSheet
          open={documentsOpen}
          onClose={() => setDocumentsOpen(false)}
          documents={documents.data?.documents ?? []}
          activeType={activeType}
          onActiveTypeChange={setActiveType}
        />
      )}
    </DetailHubScreen>
  );
}

export default function OrderHubPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <OrderHubInner />
    </Suspense>
  );
}
