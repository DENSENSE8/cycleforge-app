import { PlatformIdentityLabel } from '@/components/ui/IdentityLabelRow';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { getOrderPlatformLabel } from '@/utils/order-platform';

interface PlatformBadgeProps {
  orderId: string;
  accountSource?: string | null;
  /** @deprecated Border accent removed — identity is dot + black label. */
  showBorder?: boolean;
  className?: string;
}

/**
 * Platform label with tone dot (black text). Encapsulates order-id → platform
 * resolution for surfaces that need a readable channel name, not an order chip.
 *
 * Returns null when no platform can be determined.
 */
export function PlatformBadge({ orderId, accountSource, className = '' }: PlatformBadgeProps) {
  const label = getOrderPlatformLabel(orderId, accountSource);
  if (!label) return null;

  const meta = sourcePlatformMetaFromLabel(label);
  return (
    <PlatformIdentityLabel
      platformValue={meta.value || label}
      label={meta.label || label}
      meta={meta}
      className={className}
    />
  );
}
