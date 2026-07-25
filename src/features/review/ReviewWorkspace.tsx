'use client';

/**
 * `/review` Workbench — table + detail overlay (Outbound Labels recipe).
 * Modes: Packing (default, `?mode=` cleared) · Pairing (`?mode=pairing`) ·
 * Catalog link (`?mode=catalog-link`).
 * Packing tabs: `?rtab=packed|shipped|history`. Selection: `?packerLogId=` / `?orderId=` /
 * Catalog link: `?choreId=`.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { zIndex } from '@/design-system/tokens/z-index';
import { ClipboardList, Loader2 } from '@/components/Icons';
import { ReviewPackingTable } from '@/features/review/ReviewPackingTable';
import { PackerReviewMode } from '@/features/review/packer/PackerReviewMode';
import { usePackReviewRow } from '@/features/review/usePackReviewRow';
import { ReviewPairingTable } from '@/features/review/pairing/ReviewPairingTable';
import { ReviewPairingDetail } from '@/features/review/pairing/ReviewPairingDetail';
import { ReviewCatalogLinkTable } from '@/features/review/catalog-link/ReviewCatalogLinkTable';
import {
  shippedOrderToPackReviewRow,
  type ReviewTableOrder,
} from '@/lib/packing/review-table-mappers';
import { usePackReviewQueue } from '@/features/review/usePackReviewQueue';
import type { ShippedOrder } from '@/types/orders';
import { useQuery } from '@tanstack/react-query';

function parseReviewMode(raw: string | null): 'packer' | 'pairing' | 'catalog-link' {
  if (raw === 'pairing') return 'pairing';
  if (raw === 'catalog-link') return 'catalog-link';
  return 'packer';
}

export function ReviewWorkspace() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const mode = parseReviewMode(searchParams.get('mode'));
  const packerLogId = Number(searchParams.get('packerLogId')) || null;
  const orderId = Number(searchParams.get('orderId')) || null;

  const paneMotionProps = {
    ...useMotionPresence(framerPresence.workbenchPaneSettle),
    transition: useMotionTransition(framerTransition.workbenchPaneSettle),
  };

  const clearSelection = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('packerLogId');
    params.delete('orderId');
    params.delete('choreId');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const openPackingRow = useCallback(
    (order: ReviewTableOrder) => {
      const params = new URLSearchParams(searchParams.toString());
      const pl = Number(order.packer_log_id);
      if (Number.isFinite(pl) && pl > 0) params.set('packerLogId', String(pl));
      else params.delete('packerLogId');
      const oid = Number(order.id);
      if (Number.isFinite(oid) && oid > 0) params.set('orderId', String(oid));
      else params.delete('orderId');
      params.delete('choreId');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const openPairingOrder = useCallback(
    (order: ShippedOrder) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('packerLogId');
      params.delete('choreId');
      params.set('orderId', String(order.id));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const packingOpen = mode === 'packer' && (packerLogId != null || orderId != null);
  const pairingOpen = mode === 'pairing' && orderId != null;
  const overlayOpen = packingOpen || pairingOpen;

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-surface-canvas">
      <div
        className={`flex h-full min-h-0 w-full flex-col ${overlayOpen ? 'pointer-events-none' : ''}`}
        aria-hidden={overlayOpen ? true : undefined}
        inert={overlayOpen ? true : undefined}
        style={{ visibility: overlayOpen ? 'hidden' : 'visible' }}
      >
        {mode === 'pairing' ? (
          <ReviewPairingTable onOpenOrder={openPairingOrder} onCloseOrder={clearSelection} />
        ) : mode === 'catalog-link' ? (
          <ReviewCatalogLinkTable />
        ) : (
          <ReviewPackingTable onOpenRow={openPackingRow} onCloseRow={clearSelection} />
        )}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {packingOpen ? (
          <motion.div
            key={`review-packing-${packerLogId ?? orderId}`}
            {...paneMotionProps}
            style={{ zIndex: zIndex.panel }}
            className="absolute inset-0 flex min-h-0 flex-col bg-surface-card"
          >
            <PackingDetailOverlay
              packerLogId={packerLogId}
              orderId={orderId}
              onClose={clearSelection}
            />
          </motion.div>
        ) : null}
        {pairingOpen ? (
          <motion.div
            key={`review-pairing-${orderId}`}
            {...paneMotionProps}
            style={{ zIndex: zIndex.panel }}
            className="absolute inset-0 flex min-h-0 flex-col bg-surface-card"
          >
            <PairingDetailOverlay orderId={orderId!} onClose={clearSelection} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PackingDetailOverlay({
  packerLogId,
  orderId,
  onClose,
}: {
  packerLogId: number | null;
  orderId: number | null;
  onClose: () => void;
}) {
  const reviewRowQuery = usePackReviewRow(packerLogId);
  // History / decided rows may already be in the history bucket cache.
  const historyQueue = usePackReviewQueue('history');
  const needsQueue = usePackReviewQueue('needs_review');

  const cached = useMemo(() => {
    if (!packerLogId) return null;
    const fromHistory = historyQueue.data?.find((r) => r.packerLogId === packerLogId);
    if (fromHistory) return fromHistory;
    return needsQueue.data?.find((r) => r.packerLogId === packerLogId) ?? null;
  }, [packerLogId, historyQueue.data, needsQueue.data]);

  const orderFallback = useQuery({
    queryKey: ['review-order-fallback', orderId],
    enabled: orderId != null && orderId > 0 && !packerLogId && !reviewRowQuery.data && !cached,
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      return (data?.order as ReviewTableOrder | undefined) ?? null;
    },
  });

  const row =
    reviewRowQuery.data ??
    cached ??
    (orderFallback.data
      ? shippedOrderToPackReviewRow(orderFallback.data)
      : packerLogId
        ? shippedOrderToPackReviewRow({
            id: orderId ?? packerLogId,
            order_id: orderId ? String(orderId) : `PL-${packerLogId}`,
            product_title: '',
            condition: '',
            serial_number: '',
            sku: '',
            tester_id: null,
            tested_by: null,
            test_date_time: null,
            packer_id: null,
            packed_by: null,
            packed_at: null,
            packer_photos_url: [],
            tracking_type: null,
            account_source: null,
            notes: '',
            status_history: null,
            created_at: null,
            packer_log_id: packerLogId,
            verification_outcome: 'UNVERIFIED',
          })
        : null);

  if (reviewRowQuery.isLoading && !row) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-role-caption text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading review…
      </div>
    );
  }

  if (!row || !row.packerLogId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <ClipboardList className="h-8 w-8 text-text-faint" />
        <p className="max-w-sm text-role-caption font-semibold text-text-muted">
          This order has no packer log yet — photos and Approve/Flag need a pack event.
        </p>
        <button
          type="button"
          /* ds-raw-button */
          onClick={onClose}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-role-caption font-bold text-white hover:bg-blue-700"
        >
          Back to table
        </button>
      </div>
    );
  }

  return <PackerReviewMode row={row} onClose={onClose} />;
}

function PairingDetailOverlay({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const orderQuery = useQuery({
    queryKey: ['review-pairing-overlay-order', orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load order');
      const data = await res.json().catch(() => null);
      return data?.order as ShippedOrder;
    },
  });

  if (orderQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-role-caption text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading order…
      </div>
    );
  }

  if (!orderQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-role-caption font-semibold text-text-muted">Could not load that order.</p>
        <button
          type="button"
          /* ds-raw-button */
          onClick={onClose}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-role-caption font-bold text-white hover:bg-blue-700"
        >
          Back to table
        </button>
      </div>
    );
  }

  return <ReviewPairingDetail order={orderQuery.data} onClose={onClose} />;
}
