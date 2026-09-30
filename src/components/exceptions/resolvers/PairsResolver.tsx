'use client';

import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { SkuExceptionEvidence, SkuExceptionFacts } from '@/components/inventory/sku-exceptions/SkuExceptionEvidence';
import { StockPhotoTile } from '@/components/inventory/stock/StockPhotoTile';
import { useProvisionalSku } from '@/hooks/useProvisionalSkus';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import type { PairsExceptionFacts } from '@/lib/exceptions/facts';
import type { ExceptionRow } from '@/lib/exceptions/types';
import { ExceptionResolveSection } from '../ExceptionResolveSection';

/**
 * Missing pairs — in place, never on `/products`: an order whose SKU is
 * unpaired / has no item number gets the catalog pairing + identity fields;
 * a floor-minted `TMP-` placeholder gets its own record (photos, product,
 * count, locations) and pairs into its real Zoho item. A completed pair
 * leaves the list; the record then says it is resolved.
 */
export function PairsResolver({ row, facts }: { row: ExceptionRow; facts: PairsExceptionFacts }) {
  if (facts.source === 'order') {
    return (
      <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-pairs">
        <RecordGroup title="Pair the order's SKU">
          <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
            <ExceptionResolveSection key={facts.order.id} row={facts.order} exceptionKey={row.key} />
          </div>
        </RecordGroup>
      </div>
    );
  }
  return <PlaceholderResolver placeholder={facts.placeholder} />;
}

/** The placeholder's own record, live (its photo / product / count writes re-read it), seeded by the exception's facts: the work column (Pair leads, the item card with its Upload · Phone tile under it) then its facts, one column. */
function PlaceholderResolver({ placeholder }: { placeholder: ProvisionalSkuDetail }) {
  const live = useProvisionalSku(placeholder.sku);
  const item = live.data === undefined ? placeholder : live.data;
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-pairs">
      <SkuExceptionEvidence
        sku={placeholder.sku}
        item={item}
        loading={false}
        error={live.isError ? live.error : null}
        mergedInto={live.mergedInto}
        onExit={() => undefined}
        itemRow={
          item ? (
            <RecordGroup title="Item" titleHidden>
              <div className="flex items-start gap-4 px-4 py-3">
                <StockPhotoTile stockId={item.stockId} sku={item.sku} photoUrl={item.photos[0]?.thumbUrl ?? null} title={item.productTitle} />
                <p className="min-w-0 flex-1 text-role-body font-bold [overflow-wrap:anywhere]">{item.productTitle}</p>
              </div>
            </RecordGroup>
          ) : null
        }
      />
      {item ? <SkuExceptionFacts item={item} /> : null}
    </div>
  );
}
