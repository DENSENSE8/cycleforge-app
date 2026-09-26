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
 * The PO / marketplace order number — frozen identity track on Receiving (`select · order`).
 * Operator 2026-09-14: the order number displays on EVERY row — fold children
 */
export function ReceivingOrderCell({ col, rule, ctx }: ReceivingGridCellProps) {
  const { poValue, platformLabel, platformMeta, row, onEditOrder, quietIdentity } = ctx;
  const empty = isEmptyDisplayValue(poValue);
  const brandMeta = resolveMarketplacePlatformMeta(poValue, platformMeta);
  const brandDot = platformMetaBrandDot(brandMeta);
  const openHref = empty ? null : resolveReceivingOrderOpenUrl(row, poValue);
  return (
    <div
      data-col="order"
      className={receivingDataCellClass(col, rule, ctx)}
      style={receivingDataCellStyle(col, ctx)}
      {...receivingFrozenEdgeProps(col, ctx.columns)}
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
            // Declared, not hardcoded — see `omitCellIcon` on the `order` column.
            plain={col.omitCellIcon !== false}
            dense
          />
        </span>
      )}
    </div>
  );
}
