'use client';

import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { SkuExceptionEvidence } from '@/components/inventory/sku-exceptions/SkuExceptionEvidence';
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

/** The placeholder's own record, live (its photo / product / count writes re-read it), seeded by the exception's facts. */
function PlaceholderResolver({ placeholder }: { placeholder: ProvisionalSkuDetail }) {
  const live = useProvisionalSku(placeholder.sku);
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="exception-resolver-pairs">
      <RecordGroup title="Placeholder SKU" titleHidden>
        <SkuExceptionEvidence
          sku={placeholder.sku}
          item={live.data === undefined ? placeholder : live.data}
          loading={false}
          error={live.isError ? live.error : null}
          mergedInto={live.mergedInto}
          onExit={() => undefined}
        />
      </RecordGroup>
    </div>
  );
}
