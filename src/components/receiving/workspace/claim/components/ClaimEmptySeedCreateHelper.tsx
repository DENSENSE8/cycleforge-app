'use client';

import { getLast8, OrderIdChip, TrackingChip } from '@/components/ui/CopyChip';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { platformMetaIconTone } from '@/lib/source-platform';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';

/**
 * Compact Create-surface helper after empty tracking-seeded Link search
 * auto-flips to Create. Dense chip row (order · tracking last-8), not Link’s
 * “Pick the existing ticket…” prose. Only mounts when the controller flagged
 * the flip (not on a manual Create pick).
 */
export function ClaimEmptySeedCreateHelper({ c }: { c: ReceivingClaimController }) {
  if (c.mode !== 'create' || !c.autoCreateFromEmptyTracking) return null;

  const trackingRaw =
    (typeof c.row.tracking_number === 'string' ? c.row.tracking_number.trim() : '') ||
    c.search.seededQuery.trim();
  const platformSlug = String(c.row.source_platform ?? '').trim() || null;
  const orderId = String(c.row.source_order_id ?? '').trim() || null;

  return (
    <EmptySeedCreateHelperRow
      tracking={trackingRaw}
      platformSlug={platformSlug}
      orderId={orderId}
    />
  );
}

function EmptySeedCreateHelperRow({
  tracking,
  platformSlug,
  orderId,
}: {
  tracking: string;
  platformSlug: string | null;
  orderId: string | null;
}) {
  const resolvePlatformMeta = usePlatformMeta();
  const platformMeta = platformSlug ? resolvePlatformMeta(platformSlug) : null;
  const orderIcon = platformMeta ? platformMetaIconTone(platformMeta) : null;

  return (
    <div
      data-testid="claim-empty-seed-create-helper"
      className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border-hairline px-3 py-2 text-role-caption font-medium leading-5 text-text-soft"
      aria-label="No ticket matched"
    >
      <span>No ticket</span>
      {orderId ? (
        <OrderIdChip
          value={orderId}
          display={getLast8(orderId)}
          dense
          platformLabel={platformMeta?.label ?? null}
          iconClass={orderIcon?.className}
          iconStyle={orderIcon?.style}
        />
      ) : null}
      {tracking ? <TrackingChip value={tracking} dense /> : null}
    </div>
  );
}
