'use client';

import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, FileText, ScanBarcode } from '@/components/Icons';
import { MobileV2OrderPaperworkSheet } from '@/components/mobile/v2/orders/MobileV2OrderPaperworkSheet';
import { OrderInfoCard } from '@/components/mobile/orders/OrderInfoCard';
import { orderDoors } from '@/components/mobile/orders/order-doors';
import { useOrderHub } from '@/components/mobile/orders/useOrderHub';
import { DetailDock } from '@/design-system/components/DetailDock';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import { formatOrderStamp, type OrderHubData } from '@/lib/orders/order-hub';
import { ORDER_DATE_LABEL, placedElseImported } from '@/lib/orders/order-dates';
import { toast } from '@/lib/toast';

type OrderVerb = 'documents' | 'copy' | 'scan';

/**
 * `/m/orders/[orderId]` — the order HUB on {@link DetailHubScreen} (the exoskeleton; reference `/m/r/[id]`).
 * (operator 2026-09-24): opened from a job with `?back=<job>`, the bar shows an
 */
function OrderHubInner() {
  const router = useRouter();
  const hub = useOrderHub();
  const [documentsOpen, setDocumentsOpen] = useState(false);

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
          const at = formatOrderStamp(placedElseImported(d.order));
          return at ? `${ORDER_DATE_LABEL.placed} ${at}` : undefined;
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
      {(d) => (
        <MobileV2OrderPaperworkSheet
          open={documentsOpen}
          onClose={() => setDocumentsOpen(false)}
          orderId={d.order.id}
          orderRef={d.order.order_id}
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
