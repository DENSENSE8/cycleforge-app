'use client';

import { BrandIdentityDot, GridCellDash } from '@/components/ui/grid-cells';
import { OrderNumberMenuChip } from '@/components/ui/OrderNumberMenuChip';
import { resolveMarketplacePlatformMeta } from '@/lib/marketplace-order-id';
import { resolveReceivingOrderOpenUrl } from '@/lib/receiving/resolve-receiving-order-open-url';
import { platformMetaBrandDot } from '@/lib/source-platform';
import { isEmptyDisplayValue } from '@/utils/empty-display-value';
import {
  receivingDataCellClass,
  receivingDataCellStyle,
  receivingFrozenEdgeProps,
  type ReceivingGridCellProps,
} from './receiving-grid-cell-types';

/**
 * The PO / marketplace order number — frozen identity track on Receiving
 * (`select · order`). Dense face: platform brand-identity micro-dot + plain
 * last-8 with hover **Open** (product/listing) · **Edit** (inspector), same
 * verbs as TRACK via {@link OrderNumberMenuChip}. Empty → {@link GridCellDash}.
 */
export function ReceivingOrderCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { poValue, platformLabel, platformMeta, row, onEditOrder } = ctx;
  const empty = isEmptyDisplayValue(poValue);
  const brandMeta = resolveMarketplacePlatformMeta(poValue, platformMeta);
  const brandDot = platformMetaBrandDot(brandMeta);
  const openHref = empty ? null : resolveReceivingOrderOpenUrl(row, poValue);
  return (
    <div
      data-col="order"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}
      {...receivingFrozenEdgeProps(col)}
    >
      {empty ? (
        <GridCellDash />
      ) : (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <BrandIdentityDot className={brandDot.className} style={brandDot.style} />
          <OrderNumberMenuChip
            value={poValue}
            platformLabel={brandMeta.value ? brandMeta.label : platformLabel || null}
            openHref={openHref}
            onEdit={onEditOrder}
            // Declared, not hardcoded — see `omitCellIcon` on the `order`
            // column. It read a bare `plain` while TRACKING next to it derived
            // the same answer from `col.omitCellIcon`, so two adjacent cells
            // decided "glyph or dot" by two different rules.
            plain={col.omitCellIcon !== false}
            dense
          />
        </span>
      )}
    </div>
  );
}
