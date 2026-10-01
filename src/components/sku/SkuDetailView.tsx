'use client';

import { Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { FLOOR_DELETE_PEER_CLASS, InspectorActionFloor } from '@/components/right-rail/InspectorActionFloor';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { useSkuDetailView } from './sku-detail/useSkuDetailView';
import type { SkuDetailViewProps } from './sku-detail/sku-detail-types';
import { SkuDetailHeader } from './sku-detail/SkuDetailHeader';
import { SkuStockCard } from './sku-detail/SkuStockCard';
import { SkuLocationCard } from './sku-detail/SkuLocationCard';
import { SkuDetailCards } from './sku-detail/SkuDetailCards';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { StockLocationsGroup } from '@/components/stock/StockLocationsGroup';
import { StockPhotoTile } from '@/components/inventory/stock/StockPhotoTile';

/**
 * SKU detail view (panel slide-over or full page). Thin composition layer —
 * data/edit/deactivate logic lives in {@link useSkuDetailView}; the cards live
 * under `./sku-detail/`.
 */
export default function SkuDetailView({ sku, variant = 'page', onClose }: SkuDetailViewProps) {
  const c = useSkuDetailView({ sku, variant, onClose });
  const { data, isPanel } = c;

  // Non-modal only in the PANEL variant — the page variant owns the whole route
  // and never registers a rail occupant. The id stays per-SKU: this surface has
  // no prev/next walk, so there is no row→row loop to keep mounted.
  const wrapPanel = (content: React.ReactNode) => {
    if (!isPanel || !onClose) return content;
    return (
      <DetailStackRailRegistrar
        id={`detail:sku:${sku}`}
        onClose={c.handleClose}
        modal={false}
        ariaLabel={`SKU ${sku} details`}
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden">{content}</div>
      </DetailStackRailRegistrar>
    );
  };

  if (c.loading) {
    return wrapPanel(
      <div className="flex h-full items-center justify-center bg-surface-canvas">
        <div className="text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm font-semibold text-text-muted">Loading SKU detail...</p>
        </div>
      </div>,
    );
  }

  if (c.error && !data) {
    return wrapPanel(
      <div className="flex h-full flex-col items-center justify-center bg-surface-canvas px-6">
        <p className="mb-4 text-sm font-semibold text-red-600">{c.error}</p>
        <Button variant="ghost" onClick={c.handleClose} className="text-sm font-semibold text-blue-600 underline">
          Back to SKU Stock
        </Button>
      </div>,
    );
  }

  if (!data) return isPanel ? wrapPanel(null) : null;

  return wrapPanel(
    <div className="flex h-full min-h-0 flex-col bg-surface-canvas">
      <SkuDetailHeader c={c} data={data} />

      <div className="flex-1 overflow-y-auto no-scrollbar p-4 space-y-4">
        {/* The Stock record's own photo tile: the cover, else initials with Upload · Phone inside. The header already names it. */}
        <div className="rounded-none bg-surface-card border border-border-soft p-4" data-testid="sku-detail-photo">
          <StockPhotoTile
            stockId={data.stock.id}
            sku={data.sku}
            photoUrl={data.productImage}
            title={data.productTitle || data.sku}
            onChanged={() => void c.refresh()}
          />
        </div>

        <SkuStockCard c={c} data={data} />
        <SkuLocationCard c={c} data={data} />
        {/* Every tote and bin the SKU sits in, each countable, plus Add location — the Stock record's own group. */}
        <StockLocationsGroup sku={data.sku} onChanged={() => void c.refresh()} />
        <SkuDetailCards c={c} data={data} />
      </div>

      {/* Floor: deactivate (panel only, active catalog SKUs) */}
      {isPanel && data.catalog?.isActive ? (
        <InspectorActionFloor
          above={
            c.deactivateError ? (
              <p className="px-3 py-2 text-role-caption font-semibold text-rose-600">
                {c.deactivateError}
              </p>
            ) : undefined
          }
        >
          <InspectorFlushDelete
            onConfirm={c.handleDeactivate}
            onDeleted={c.handleClose}
            label="Deactivate SKU"
            confirmLabel="Click again to deactivate"
            data-testid="sku-details-deactivate"
            className={FLOOR_DELETE_PEER_CLASS}
          />
        </InspectorActionFloor>
      ) : null}

      <PhotoViewerPortal g={c.gallery} />
    </div>,
  );
}
