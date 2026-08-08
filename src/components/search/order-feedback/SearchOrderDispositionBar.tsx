'use client';

/**
 * SearchOrderDispositionBar — carton DispositionBar twin for search order feedback.
 * Leading typed identity (OrderIdChip · PlatformMark) · status pill · trailing CTAs.
 */

import { useRouter } from 'next/navigation';
import { Camera, ExternalLink, MoreHorizontal, ShieldCheck } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { PaneHeaderStatusPill } from '@/components/ui/pane-header';
import { stationIdentityPanelClass } from '@/components/station/entity-context/station-identity-chrome';
import { deriveShippedHeaderMeta } from '@/components/shipped/details-panel/shipped-details-logic';
import { dashboardOrderHref } from '@/components/sidebar/support/support-sidebar-shared';
import { useOrderChannelLabel, usePlatformMeta } from '@/hooks/useCatalog';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import type { ShippedOrder } from '@/types/orders';
import { cn } from '@/utils/_cn';

export function SearchOrderDispositionBar({
  order,
  photoCount,
  photosOpen,
  onTogglePhotos,
  onLogWarranty,
}: {
  order: ShippedOrder;
  photoCount: number | null;
  photosOpen: boolean;
  onTogglePhotos: () => void;
  onLogWarranty: () => void;
}) {
  const router = useRouter();
  const meta = deriveShippedHeaderMeta(order);
  const orderChannelLabel = useOrderChannelLabel();
  const resolvePlatformMeta = usePlatformMeta();
  const channelLabel = orderChannelLabel(order.order_id, order.account_source);
  const fromLabel = sourcePlatformMetaFromLabel(channelLabel);
  const platformMeta = fromLabel.value
    ? resolvePlatformMeta(fromLabel.value)
    : fromLabel;
  const platformLabel = platformMeta.value ? platformMeta.label : null;
  const orderId = String(order.order_id || meta.orderIdDisplay || '').trim();
  const pillTone =
    meta.statusTone === 'emerald' ? 'emerald' : meta.statusTone === 'red' ? 'red' : 'yellow';
  const warrantySearch = String(order.order_id || '').trim();

  return (
    <div
      role="banner"
      className={cn(
        stationIdentityPanelClass,
        'flex min-h-9 w-full max-w-full shrink-0 items-center justify-between gap-3 overflow-visible px-3 py-1.5',
      )}
      data-testid="search-order-disposition-bar"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {orderId ? (
          <OrderIdChip
            value={orderId}
            display={getLast8(orderId)}
            dense
            platformLabel={platformLabel}
            truncateDisplay={false}
            fitDisplayWidth
          />
        ) : (
          <span className="text-role-caption font-medium text-text-faint">—</span>
        )}
        {platformMeta.value ? (
          <HoverTooltip label={platformMeta.label} asChild>
            <span className="inline-flex shrink-0" aria-label={platformMeta.label}>
              <PlatformMark platformValue={platformMeta.value} meta={platformMeta} />
              <span className="sr-only">{platformMeta.label}</span>
            </span>
          </HoverTooltip>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-l border-border-soft pl-3">
          <PaneHeaderStatusPill tone={pillTone}>{meta.statusLabel}</PaneHeaderStatusPill>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant={photosOpen ? 'primary' : 'secondary'}
          size="sm"
          onClick={onTogglePhotos}
          aria-expanded={photosOpen}
          ariaLabel={photosOpen ? 'Hide photos' : 'Show photos'}
          icon={<Camera />}
          className="shrink-0"
        >
          <span className="inline-flex items-center gap-1.5">
            Photos
            {photoCount != null ? (
              <span className="tabular-nums opacity-70">{photoCount}</span>
            ) : null}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onLogWarranty}
          ariaLabel="Log warranty claim"
          icon={<ShieldCheck />}
          className="shrink-0 text-text-soft"
        >
          Log warranty
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              ariaLabel="More actions"
              icon={<MoreHorizontal />}
              className="shrink-0 text-text-soft"
            >
              More
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            <DropdownMenuItem
              onSelect={() => router.push(dashboardOrderHref(Number(order.id)))}
            >
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              Open on desk
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                router.push(
                  `/support?mode=warranty${
                    warrantySearch ? `&search=${encodeURIComponent(warrantySearch)}` : ''
                  }`,
                )
              }
            >
              <ShieldCheck className="mr-2 h-3.5 w-3.5" />
              Warranty logger
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
