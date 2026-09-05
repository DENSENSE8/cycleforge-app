'use client';

/**
 * `/review` Workbench — table + detail overlay (Outbound Labels recipe).
 * Modes: Packing (default, `?mode=` cleared) · Pairing (`?mode=pairing`) ·
 * Catalog link (`?mode=catalog-link`).
 * Packing tabs: `?rtab=packed|shipped|history`. Selection: `?packerLogId=` / `?orderId=` /
 * Catalog link: `?choreId=`. Missing item number: `?section=missing-item-number&exceptionId=`.
 */

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, idleBrowseLayerProps, motion, overlayPaneStyle } from '@/design-system/motion';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { Button } from '@/design-system/primitives';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
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
import { parseReviewMode } from '@/features/review/review-mode';
import type { ShippedOrder } from '@/types/orders';
import { useQuery } from '@tanstack/react-query';
import {
  resolveOptimisticParam,
  shouldClearOptimisticParam,
} from '@/lib/routing/optimistic-url-param';

const REVIEW_MODE_TABS = [
  { id: 'packer', label: 'Packing' },
  { id: 'pairing', label: 'Pairing' },
  { id: 'catalog-link', label: 'Catalog link' },
] as const;

type ReviewOpenSnap = {
  packerLogId: number | null;
  orderId: number | null;
};

function reviewOpenEquals(a: ReviewOpenSnap, b: ReviewOpenSnap): boolean {
  return a.packerLogId === b.packerLogId && a.orderId === b.orderId;
}

function parsePositiveId(raw: string | null): number | null {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function ReviewWorkspace() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const mode = parseReviewMode(searchParams.get('mode'));
  const setMode = useCallback(
    (nextMode: string) => {
      if (!REVIEW_MODE_TABS.some((tab) => tab.id === nextMode)) return;
      const params = new URLSearchParams(searchParams.toString());
      if (nextMode === 'packer') params.delete('mode');
      else params.set('mode', nextMode);
      params.delete('packerLogId');
      params.delete('orderId');
      params.delete('choreId');
      params.delete('exceptionId');
      params.delete('section');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const urlOpen = useMemo<ReviewOpenSnap>(
    () => ({
      packerLogId: parsePositiveId(searchParams.get('packerLogId')),
      orderId: parsePositiveId(searchParams.get('orderId')),
    }),
    [searchParams],
  );

  const [pendingOpen, setPendingOpen] = useState<ReviewOpenSnap | undefined>(undefined);
  useEffect(() => {
    if (shouldClearOptimisticParam(urlOpen, pendingOpen, reviewOpenEquals)) {
      setPendingOpen(undefined);
    }
  }, [urlOpen, pendingOpen]);

  const openSnap = resolveOptimisticParam(urlOpen, pendingOpen);
  const packerLogId = openSnap.packerLogId;
  const orderId = openSnap.orderId;

  const paneMotionProps = {
    ...useMotionPresence(framerPresence.workbenchPaneSettle),
    transition: useMotionTransition(framerTransition.workbenchPaneSettle),
  };

  const replaceWithPaint = useCallback(
    (next: ReviewOpenSnap, mutate: (params: URLSearchParams) => void) => {
      setPendingOpen(next);
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString());
        mutate(params);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const clearSelection = useCallback(() => {
    replaceWithPaint({ packerLogId: null, orderId: null }, (params) => {
      params.delete('packerLogId');
      params.delete('orderId');
      params.delete('choreId');
      params.delete('exceptionId');
      params.delete('section');
    });
  }, [replaceWithPaint]);

  const openPackingRow = useCallback(
    (order: ReviewTableOrder) => {
      const pl = Number(order.packer_log_id);
      const nextPl = Number.isFinite(pl) && pl > 0 ? pl : null;
      const oid = Number(order.id);
      const nextOid = Number.isFinite(oid) && oid > 0 ? oid : null;
      replaceWithPaint({ packerLogId: nextPl, orderId: nextOid }, (params) => {
        if (nextPl != null) params.set('packerLogId', String(nextPl));
        else params.delete('packerLogId');
        if (nextOid != null) params.set('orderId', String(nextOid));
        else params.delete('orderId');
        params.delete('choreId');
        params.delete('exceptionId');
        params.delete('section');
      });
    },
    [replaceWithPaint],
  );

  const openPairingOrder = useCallback(
    (order: ShippedOrder) => {
      const nextOid = Number(order.id);
      replaceWithPaint({ packerLogId: null, orderId: nextOid }, (params) => {
        params.delete('packerLogId');
        params.delete('choreId');
        params.delete('exceptionId');
        params.delete('section');
        params.set('orderId', String(order.id));
      });
    },
    [replaceWithPaint],
  );

  const packingOpen = mode === 'packer' && (packerLogId != null || orderId != null);
  const pairingOpen = mode === 'pairing' && orderId != null;
  const overlayOpen = packingOpen || pairingOpen;

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-surface-canvas">
      <DeskPageLayout
        tabs={REVIEW_MODE_TABS}
        activeTab={mode}
        onTabChange={setMode}
        className="h-full"
      >
        <div {...idleBrowseLayerProps(overlayOpen, 'flex h-full min-h-0 w-full flex-col')}>
          {mode === 'pairing' ? (
            <ReviewPairingTable onOpenOrder={openPairingOrder} onCloseOrder={clearSelection} />
          ) : mode === 'catalog-link' ? (
            <ReviewCatalogLinkTable />
          ) : (
            <ReviewPackingTable onOpenRow={openPackingRow} onCloseRow={clearSelection} />
          )}
        </div>
      </DeskPageLayout>

      <AnimatePresence initial={false} mode="wait">
        {packingOpen ? (
          <motion.div
            key={`review-packing-${packerLogId ?? orderId}`}
            {...paneMotionProps}
            style={overlayPaneStyle()}
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
            style={overlayPaneStyle()}
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
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Back to table
        </Button>
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
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Back to table
        </Button>
      </div>
    );
  }

  return <ReviewPairingDetail order={orderQuery.data} onClose={onClose} />;
}
