'use client';

/**
 * ProductPeek — the right-rail glance for one SKU (detail-stack kind `sku`).
 * Opened from a support thread's "Product sent to customer" card (P7: the card
 * opens the product's detail in a right rail) and from document SKU references.
 *
 * Reads the live face by SKU at view time (P6) — identity title and photo come
 * resolved from the API; nothing is copied from the opener.
 */

import { useRouter } from 'next/navigation';
import { ExternalLink, Package } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { ItemRecordThumb } from '@/design-system/components/item-record/ItemRecordThumb';
import { LocationBadge } from '@/design-system/components/LocationBadge';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  PaneHeader,
  PaneHeaderActionBar,
  PaneHeaderIconBadge,
  PaneHeaderLabel,
} from '@/components/ui/pane-header';
import { useSupportProductBySku } from '@/hooks/useSupportTicketItems';

function productRecordHref(sku: string): string {
  return `/products/sku/${encodeURIComponent(sku)}`;
}

export function ProductPeek({ sku, onClose }: { sku: string; onClose: () => void }) {
  const router = useRouter();
  const { data: face, isLoading } = useSupportProductBySku(sku);

  return (
    <DetailStackRailRegistrar
      id="detail:product-peek"
      onClose={onClose}
      modal={false}
      ariaLabel={`Product ${sku} peek`}
    >
      <div
        className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card"
        data-testid="product-peek"
      >
        <PaneHeader
          className="shrink-0 border-b border-border-soft bg-surface-card/90 backdrop-blur-xl"
          rowClassName="px-4"
          leftSlot={
            // No `onClose`: RightRailHost owns the one dismiss (CompactOrderPeek's rule).
            <PaneHeaderActionBar
              iconOnly
              variant="flat"
              className="w-full px-0 py-0"
              actions={[]}
            />
          }
          belowSlot={
            <div className="flex items-center gap-2 px-4 pb-3">
              <PaneHeaderIconBadge Icon={Package} bg="bg-blue-600" tint="text-white" />
              <PaneHeaderLabel eyebrow="SKU" value={sku} valueTitle={sku} />
            </div>
          }
        />

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {isLoading ? null : !face ? (
            <p className="text-role-caption text-text-muted">No catalog product has this SKU.</p>
          ) : (
            <>
              <ItemRecordThumb
                imageUrl={face.imageUrl}
                className="aspect-square h-auto w-full rounded-mode"
              />
              <p className="text-role-caption font-semibold text-text-default">{face.title}</p>
              <dl className="space-y-2 text-role-caption">
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">SKU</dt>
                  <dd className="font-mono text-text-default">{face.sku}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">On hand</dt>
                  <dd className={face.onHand > 0 ? 'text-text-success' : 'text-text-faint'}>
                    {face.onHand > 0 ? `${face.onHand} in stock` : 'None in stock'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-text-muted">Bin</dt>
                  <dd>
                    <LocationBadge text={face.bin} />
                  </dd>
                </div>
              </dl>
            </>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border-soft p-4">
          <Button
            variant="primary"
            size="md"
            className="w-full"
            icon={<ExternalLink className="h-3.5 w-3.5" />}
            data-testid="product-peek-open"
            onClick={() => {
              onClose();
              router.push(productRecordHref(sku));
            }}
          >
            Open product
          </Button>
        </div>
      </div>
    </DetailStackRailRegistrar>
  );
}
