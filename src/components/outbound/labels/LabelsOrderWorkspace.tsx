'use client';

/**
 * Focused Labels order workspace — the Unbox-pattern full-pane overlay that
 * crossfades over the Queue/Recent browse workbench when an order is opened
 * (`?open=`). Owns the whole label + packing-slip flow with station tabs:
 *
 *   Print     — full-size shipping-label + packing-slip previews, one Print job
 *   Documents — attach / marketplace-fetch / delete tray + Buy label
 *   Timeline  — order event history
 *
 * Replaces the old dual mount (OutboundDocumentsPrintView pane + the 420px
 * ShippedDetailsPanel slide-over) that flickered both surfaces at once.
 * Composes the station SoTs: `StationContextBar` + `StationWorkbench` +
 * `StationTerminalDock` (Print CTA), `SectionTabsSlider`, and the
 * `CartonContextCard` waist via `ShippingEntityContextHeader` — never a
 * forked identity header or hand-rolled Queue/title/Print toolbar.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { outboundOrderByIdQuery } from '@/lib/queries/outbound-queries';
import { StationWorkbench, buildSectionTabs } from '@/components/station/workbench';
import { StationContextBar } from '@/components/station/entity-context';
import { StationTerminalDock } from '@/components/station/terminal';
import { SectionTabsSlider } from '@/design-system/components/SectionTabsSlider';
import { ShippingEntityContextHeader } from '@/components/tech/shipping/ShippingEntityContextHeader';
import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import { OrderTimelineSection } from '@/components/shipped/OrderTimelineSection';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button, Panel } from '@/design-system/primitives';
import { FileText, History, Printer } from '@/components/Icons';
import { sourcePlatformLabel } from '@/lib/source-platform';
import {
  printOutboundDocuments,
  type PrintableOutboundDocument,
} from '@/lib/print/printOutboundDocuments';
import type { OutboundDocument, OutboundDocumentsResponse } from '@/lib/documents/types';
import type { TerminalActionVm } from '@/lib/station-terminal';
import type { ActiveStationOrder } from '@/hooks/station/types';
import type { ShippedOrder } from '@/lib/neon/orders-queries';

/** application/pdf (or unknown-but-`.pdf`-named) → iframe; else raster image. */
function isPdfDocument(doc: OutboundDocument): boolean {
  const mime = doc.data.mimeType?.toLowerCase() ?? '';
  if (mime) return mime.includes('pdf');
  return /\.pdf(\?|$)/i.test(doc.data.url);
}

function isEcwidOrder(order: ShippedOrder): boolean {
  return (order.account_source ?? '').toLowerCase().includes('ecwid');
}

/** Thin adapter: queue row → the station entity-context shape (identity only). */
function toActiveStationOrder(order: ShippedOrder): ActiveStationOrder {
  const tracking =
    String(order.shipping_tracking_number || '').trim() ||
    (order.tracking_numbers?.[0] ?? '');
  const serials = String(order.serial_number || '')
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    id: Number(order.id) || null,
    orderId: order.order_id,
    productTitle: order.product_title,
    itemNumber: order.item_number ?? null,
    sku: order.sku,
    condition: order.condition,
    notes: order.notes ?? '',
    tracking,
    serialNumbers: serials,
    testDateTime: order.test_date_time,
    testedBy: order.tested_by,
    quantity: Number(order.quantity) || undefined,
    shipByDate: order.ship_by_date ?? order.deadline_at ?? null,
    createdAt: order.created_at ?? null,
    sourceType: 'order',
  };
}

function DocumentPreviewPane({
  title,
  doc,
  loading,
}: {
  title: string;
  doc: OutboundDocument | undefined;
  loading?: boolean;
}) {
  return (
    <Panel padding="none" elevation="none" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border-hairline inset-field">
        <h3 className="text-role-eyebrow uppercase tracking-widest text-text-soft">{title}</h3>
        {doc?.data.platform ? (
          <span className="text-role-eyebrow font-bold uppercase tracking-widest text-text-faint">
            {sourcePlatformLabel(doc.data.platform)}
          </span>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-canvas p-3">
        {doc ? (
          isPdfDocument(doc) ? (
            <iframe
              src={`/api/documents/${doc.id}/content`}
              title={title}
              className="h-full w-full rounded-lg border border-border-soft bg-surface-card"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary externally-stored document, not a Next-optimizable local asset
            <img
              src={`/api/documents/${doc.id}/content`}
              alt={title}
              className="max-h-full max-w-full rounded-lg border border-border-soft bg-surface-card object-contain"
            />
          )
        ) : loading ? (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <LoadingSpinner size="md" className="text-text-soft" />
            <p className="text-role-caption font-semibold text-text-soft">
              Fetching packing slip…
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <FileText className="h-8 w-8 text-text-faint" />
            <p className="text-role-caption font-semibold text-text-soft">
              No {title.toLowerCase()} attached
            </p>
            <p className="text-role-eyebrow text-text-faint">
              Attach or fetch one from the Documents tab
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}

interface LabelsOrderWorkspaceProps {
  orderId: number;
  onClose: () => void;
}

export function LabelsOrderWorkspace({ orderId, onClose }: LabelsOrderWorkspaceProps) {
  const queryClient = useQueryClient();
  const { data: order, isLoading, isError } = useQuery(outboundOrderByIdQuery(orderId));
  const { data: docsData, isFetched: docsFetched } = useQuery({
    queryKey: ['order-documents', orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/documents`);
      if (!res.ok) throw new Error('Failed to fetch documents');
      return (await res.json()) as OutboundDocumentsResponse;
    },
    enabled: Number.isFinite(orderId) && orderId > 0,
    staleTime: 30_000,
  });

  const [activeTab, setActiveTab] = useState('print');
  const [slipAutoFetching, setSlipAutoFetching] = useState(false);
  const autoFetchAttempted = useRef(false);

  const documents = docsData?.documents ?? [];
  const label = documents.find((d) => d.documentType === 'shipping_label');
  const slip = documents.find((d) => d.documentType === 'packing_slip');
  const printableDocs = useMemo((): PrintableOutboundDocument[] => {
    return [label, slip]
      .filter((d): d is OutboundDocument => Boolean(d))
      .map((d) => ({ id: d.id, isPdf: isPdfDocument(d) }));
  }, [label, slip]);

  const entityOrder = useMemo(() => (order ? toActiveStationOrder(order) : null), [order]);

  // Ecwid dogfood: auto-fetch packing slip when missing (not shipping labels).
  useEffect(() => {
    if (!order || !docsFetched || autoFetchAttempted.current) return;
    if (!isEcwidOrder(order)) return;
    if (slip) return;

    autoFetchAttempted.current = true;
    let cancelled = false;

    void (async () => {
      setSlipAutoFetching(true);
      try {
        const res = await fetch(`/api/orders/${orderId}/documents/fetch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ types: ['packing_slip'] }),
        });
        if (!cancelled && res.ok) {
          await queryClient.invalidateQueries({ queryKey: ['order-documents', orderId] });
        }
      } catch {
        // Quiet fail — Documents tab still has manual Fetch; generated fallback
        // may have stored via the orchestrator on a partial response.
      } finally {
        if (!cancelled) setSlipAutoFetching(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order, docsFetched, slip, orderId, queryClient]);

  const printDockVm = useMemo((): TerminalActionVm => {
    return {
      label: printableDocs.length === 2 ? 'Print both' : 'Print',
      icon: <Printer className="h-5 w-5" />,
      disabled: printableDocs.length === 0,
      disabledReason:
        printableDocs.length === 0
          ? 'Attach a shipping label or packing slip first'
          : undefined,
      onClick: () => {
        printOutboundDocuments(printableDocs);
      },
    };
  }, [printableDocs]);

  const tabs = useMemo(
    () =>
      buildSectionTabs([
        {
          id: 'print',
          label: 'Print',
          icon: Printer,
          content: (
            <div className="grid min-h-[60vh] grid-cols-1 gap-4 pt-3 lg:grid-cols-2">
              <DocumentPreviewPane title="Shipping Label" doc={label} />
              <DocumentPreviewPane
                title="Packing Slip"
                doc={slip}
                loading={slipAutoFetching && !slip}
              />
            </div>
          ),
        },
        {
          id: 'documents',
          label: 'Documents',
          icon: FileText,
          count: documents.length || undefined,
          content: order ? (
            <div className="pt-3">
              <OrderDocumentsSection
                orderId={orderId}
                orderRef={order.order_id}
                readOnly={false}
              />
            </div>
          ) : null,
        },
        {
          id: 'timeline',
          label: 'Timeline',
          icon: History,
          content: (
            <div className="pt-3">
              <OrderTimelineSection orderId={orderId} />
            </div>
          ),
        },
      ]),
    [label, slip, documents.length, order, orderId, slipAutoFetching],
  );

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-card">
        <LoadingSpinner size="lg" className="text-violet-600" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-card px-8 text-center">
        <p className="text-sm font-semibold text-text-muted">Order not found</p>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Back to queue
        </Button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-surface-canvas">
      {entityOrder ? (
        <StationContextBar
          identity={
            <ShippingEntityContextHeader
              activeOrder={entityOrder}
              onExitToList={onClose}
            />
          }
        />
      ) : null}
      <StationWorkbench
        ambientWash={false}
        className="relative z-0 flex-1 bg-transparent"
        reserveScrollClearance
        tabs={
          <SectionTabsSlider
            tabs={tabs}
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="Label order sections"
          />
        }
        dock={<StationTerminalDock vm={printDockVm} />}
      />
    </div>
  );
}
