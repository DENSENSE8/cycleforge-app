'use client';

/**
 * Unbox Displays → Overview — identity copy / glance.
 *
 * Order # · tracking · PO as house chips. Not Ticket (file/link), not Tracking
 * (events · attach), not Locations (place · print · mint). The carton work
 * stays in the centre; this leaf does not empty the workbench.
 */

import { getLast8, OrderIdChip, PoChip, TrackingChip } from '@/components/ui/CopyChip';
import { DISPLAYS_BODY_INSET } from '@/design-system/shells/detail-stack';
import { usePlatformMeta } from '@/hooks/useCatalog';
import { platformMetaIconTone } from '@/lib/source-platform';
import { cn } from '@/utils/_cn';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">{label}</p>
      {children}
    </div>
  );
}

export function UnboxOverviewLeaf({ row }: { row: ReceivingLineRow }) {
  const resolvePlatformMeta = usePlatformMeta();
  const order = String(row.source_order_id ?? '').trim();
  const tracking = String(row.tracking_number ?? '').trim();
  const po = String(row.zoho_purchaseorder_number ?? '').trim();
  const platformSlug = String(row.source_platform ?? '').trim();
  const platformMeta = platformSlug ? resolvePlatformMeta(platformSlug) : null;
  const orderIcon = platformMeta ? platformMetaIconTone(platformMeta) : null;

  return (
    <div className={cn('space-y-4 py-3', DISPLAYS_BODY_INSET)} data-testid="unbox-overview-leaf">
      <Fact label="Order #">
        <OrderIdChip
          value={order}
          display={getLast8(order)}
          dense
          platformLabel={platformMeta?.label ?? null}
          iconClass={orderIcon?.className}
          iconStyle={orderIcon?.style}
        />
      </Fact>
      <Fact label="Tracking">
        <TrackingChip value={tracking} dense showIcon carrierHint={row.carrier} />
      </Fact>
      <Fact label="PO">
        <PoChip value={po} dense disableCopy={!po} />
      </Fact>
    </div>
  );
}
