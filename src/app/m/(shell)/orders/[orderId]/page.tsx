'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Copy, FileText, ScanBarcode } from '@/components/Icons';
import { MobileOrderDocumentsSheet } from '@/components/mobile/redesign/MobileOrderDocumentsSheet';
import { OrderInfoCard } from '@/components/mobile/orders/OrderInfoCard';
import { orderDoors } from '@/components/mobile/orders/order-doors';
import { useOrderHub } from '@/components/mobile/orders/useOrderHub';
import { DetailDock } from '@/design-system/components/DetailDock';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import type { OutboundDocumentsResponse, OutboundDocumentType } from '@/lib/documents/types';
import { formatOrderStamp, type OrderHubData } from '@/lib/orders/order-hub';
import { toast } from '@/lib/toast';

type OrderVerb = 'documents' | 'copy' | 'scan';

async function fetchOrderDocuments(pk: number): Promise<OutboundDocumentsResponse> {
  const res = await fetch(`/api/orders/${pk}/documents`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load order documents');
  return (await res.json()) as OutboundDocumentsResponse;
}

/**
 * `/m/orders/[orderId]` — the order HUB on {@link DetailHubScreen} (the exoskeleton; reference `/m/r/[id]`).
 * (operator 2026-09-24): opened from a job with `?back=<job>`, the bar shows an
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
