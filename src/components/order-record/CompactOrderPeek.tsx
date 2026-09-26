'use client';

/** CompactOrderPeek — non-desk right-rail open for an order (global detail stack / recents). */

import { useRouter } from 'next/navigation';
import { Search, Package } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import {
  PaneHeader,
  PaneHeaderActionBar,
  PaneHeaderIconBadge,
  PaneHeaderLabel,
  PaneHeaderStatusPill,
} from '@/components/ui/pane-header';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { deriveShippedHeaderMeta } from '@/components/shipped/details-panel/shipped-details-logic';
import { useOrderChannel, usePlatformMeta } from '@/hooks/useCatalog';
import { searchOrderFeedbackHref } from '@/lib/search/search-hit';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import type { ShippedOrder } from '@/types/orders';

export function CompactOrderPeek({
  order,
  onClose,
}: {
  order: ShippedOrder;
  onClose: () => void;
}) {
  const router = useRouter();
  const meta = deriveShippedHeaderMeta(order);
  const resolveOrderChannel = useOrderChannel();
  const resolvePlatformMeta = usePlatformMeta();
  const channelLabel = resolveOrderChannel(order.order_id, order.account_source).label;
  const fromLabel = sourcePlatformMetaFromLabel(channelLabel);
  const platformMeta = fromLabel.value ? resolvePlatformMeta(fromLabel.value) : fromLabel;
  const pillTone =
    meta.statusTone === 'emerald' ? 'emerald' : meta.statusTone === 'red' ? 'red' : 'yellow';

  return (
    <DetailStackRailRegistrar
      id="detail:order-peek"
      onClose={onClose}
      modal={false}
      ariaLabel={`Order ${meta.orderIdDisplay} peek`}
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
        <PaneHeader
          className="shrink-0 border-b border-border-soft bg-surface-card/90 backdrop-blur-xl"
          rowClassName="px-4"
          leftSlot={
            // No `onClose`: RightRailHost owns the ONE dismiss at the flush
            // top-right corner. An ActionBar close split it across two corners.
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
              <div className="flex min-w-0 flex-col gap-1">
                <PaneHeaderLabel eyebrow="Order #" value={meta.orderIdDisplay} valueTitle={meta.orderIdDisplay} />
                <div className="flex flex-wrap items-center gap-1.5">
                  <PaneHeaderStatusPill tone={pillTone}>{meta.statusLabel}</PaneHeaderStatusPill>
                  {platformMeta.value ? (
                    <HoverTooltip label={platformMeta.label} asChild focusable={false}>
                      <span className="inline-flex shrink-0" aria-label={platformMeta.label}>
                        <PlatformMark platformValue={platformMeta.value} meta={platformMeta} />
                      </span>
                    </HoverTooltip>
                  ) : null}
                </div>
              </div>
            </div>
          }
        />

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <p className="text-role-eyebrow text-text-faint">Item</p>
            <p className="mt-1 text-role-caption font-semibold text-text-default">
              {order.product_title || 'Untitled'}
            </p>
          </div>
          <dl className="space-y-2 text-role-caption">
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">SKU</dt>
              <dd className="font-mono text-text-default">{order.sku || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Tracking</dt>
              <dd className="truncate font-mono text-text-default">
                {order.shipping_tracking_number || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-text-muted">Ship by</dt>
              <dd className="text-text-default">
                {order.ship_by_date ? String(order.ship_by_date).slice(0, 16) : '—'}
              </dd>
            </div>
          </dl>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-border-soft p-4">
          <Button
            variant="primary"
            size="md"
            className="w-full"
            icon={<Search className="h-3.5 w-3.5" />}
            onClick={() => {
              onClose();
              router.push(searchOrderFeedbackHref(order.id));
            }}
          >
            Open in search
          </Button>
        </div>
      </div>
    </DetailStackRailRegistrar>
  );
}
