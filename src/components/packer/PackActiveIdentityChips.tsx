'use client';

/**
 * Condensed identity chips for an active pack session — order# · tracking#,
 * right-aligned.
 *
 * Same anatomy and tokens as the receiving Unbox identity row: each chip is an
 * {@link IdentityLinkChip} over the {@link CopyChip} family, so the order number
 * is a last-4 `id` chip (`#`) and tracking is a last-4 `tracking` chip (MapPin)
 * that opens the carrier page from its hover menu. Never hand-roll a mono
 * `<span>` for these ids — the last-4 face + copy + clipboard history all come
 * from the chip SoT.
 *
 * NO listing chip here: the sidebar card is the scan-loop confirmation, and the
 * listing link lives once, in the workbench identity bar (`PackOrderIdentity` →
 * `CartonContextCard`). Two listing entry points on one screen is chrome
 * competing with the next scan.
 */

import { IdentityLinkChip } from '@/components/receiving/workspace/line-edit/IdentityLinkChip';
import { getLast4 } from '@/components/ui/CopyChip';
import { getTrackingUrl } from '@/utils/order-links';

interface PackActiveIdentity {
  orderId?: string | null;
  tracking?: string | null;
  sku?: string | null;
  scanType?: 'ORDERS' | 'SKU' | 'REPAIR' | 'UNIT';
}

export function PackActiveIdentityChips({ activeOrder }: { activeOrder: PackActiveIdentity }) {
  const orderId = String(activeOrder.orderId || '').trim();
  const tracking = String(activeOrder.tracking || '').trim();
  const sku = String(activeOrder.sku || '').trim();

  // SKU scans have no order number — the SKU is the identifier, so it takes the
  // middle slot with its own `sku` tone (never a mislabeled `#` order chip).
  const isSkuIdentity = !orderId && !!sku;
  const identityValue = orderId || sku;

  return (
    <div className="flex min-w-0 shrink items-center justify-end gap-2">
      <IdentityLinkChip
        openHref={undefined}
        openTitle={isSkuIdentity ? 'SKU' : 'Order number'}
        value={identityValue}
        display={identityValue ? getLast4(identityValue) : '----'}
        tone={isSkuIdentity ? 'sku' : 'id'}
        underlineClass={isSkuIdentity ? 'border-yellow-500' : 'border-border-emphasis'}
        disableCopy={!identityValue}
        actionsInMenu
        menuFirstAction="copy"
      />

      <IdentityLinkChip
        openHref={tracking ? getTrackingUrl(tracking) : null}
        openTitle="Open carrier tracking"
        value={tracking}
        display={tracking ? getLast4(tracking) : '----'}
        tone="tracking"
        underlineClass="border-blue-500"
        disableCopy={!tracking}
        actionsInMenu
      />
    </div>
  );
}
