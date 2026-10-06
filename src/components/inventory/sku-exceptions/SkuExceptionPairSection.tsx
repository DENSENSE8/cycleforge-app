'use client';

/**
 * Missing pairs, placeholder side — pair a floor-minted `TMP-` SKU into the
 * permanent catalog SKU: its stock, photos and description move onto that SKU
 * and the exception closes (`merge-placeholder`). The stock record pairs
 * through `SkuPairSheet` instead; both share `useSkuPairSearch`.
 */

import { EVIDENCE_CONTROL_CLASS } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { Button } from '@/design-system/primitives';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import type { ProvisionalSkuDetail } from '@/lib/neon/provisional-sku-queries';
import { cn } from '@/utils/_cn';
import { useSkuPairSearch } from './useSkuPairSearch';

/** Pair a temporary SKU into its permanent catalog SKU. */
export function SkuExceptionPairSection({
  item,
  onPaired,
}: {
  item: ProvisionalSkuDetail;
  /** After the merge lands (the hook has already re-read the exceptions). */
  onPaired: () => void | Promise<void>;
}) {
  const pairing = useSkuPairSearch(item);
  const { chosen, busy } = pairing;
  // The phone reads Pair at the 44px touch rung.
  const { isMobile } = useUIModeOptional();
  const units = `${item.stock} unit${item.stock === 1 ? '' : 's'}`;

  return (
    <RecordGroup
      title="Pair to SKU"
      testId="sku-exception-pair"
      action={
        chosen ? (
          <Button
            variant="ink"
            size={isMobile ? 'lg' : 'sm'}
            loading={busy}
            onClick={() => pairing.pair(onPaired)}
            data-testid="sku-exception-pair-confirm"
          >
            Pair
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-2 px-4 pb-3 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(RECORD_ID_CLASS, 'shrink-0 text-mode-ink')}
            data-testid="sku-exception-pair-current"
            title="Current SKU"
          >
            {item.sku}
          </span>
          <span className="shrink-0 text-role-caption text-mode-muted" aria-hidden>
            →
          </span>
          <SearchableSelectField
            className={cn(EVIDENCE_CONTROL_CLASS, 'min-w-0 flex-1')}
            value={chosen?.sku ?? null}
            onChange={pairing.choose}
            options={pairing.options}
            onSearchChange={pairing.setQuery}
            loading={pairing.searching}
            disabled={busy}
            placeholder="Find the permanent SKU…"
            searchPlaceholder="Search permanent SKU or title…"
            emptyMessage={pairing.searching ? 'Searching…' : 'No permanent SKU matches.'}
            ariaLabel="Permanent SKU to pair this temporary SKU into"
            testId="sku-exception-pair-search"
            paste={{ label: 'Paste a SKU or item ID', onPaste: pairing.setQuery }}
          />
        </div>
        {chosen ? (
          <p className="text-role-data text-mode-ink" data-testid="sku-exception-pair-preview">
            {units} become{item.stock === 1 ? 's' : ''}{' '}
            <span className="font-semibold">{chosen.product_title || chosen.sku}</span>{' '}
            <span className={cn(RECORD_ID_CLASS, 'text-mode-muted')}>{chosen.sku}</span>
          </p>
        ) : (
          <p className="text-role-caption text-mode-muted">
            Pairing moves the stock, photos and description onto the permanent SKU and closes this exception.
          </p>
        )}
      </div>
    </RecordGroup>
  );
}
