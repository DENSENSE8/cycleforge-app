'use client';

/**
 * Unbox RETURN check — what to look for on a returned unit. It rides the
 * bottom-right of the next-step bubble ("Place on the Return rack"), on the
 * destination's row, so the page lays out the same whether the line is a
 * return or not (operator 2026-10-08; it was a full-width amber band above the
 * line). Return lines only; PO / trade-in lines render nothing. The reason is
 * the stored one (`receiving_line_return.return_reason`, carton
 * `return_reason` fallback) and is never guessed.
 */

import { ListingUrlChip, OrderIdChip } from '@/components/ui/CopyChip';
import { readReturnReason } from '@/lib/inbound/return-reason-codes';
import { normalizeListingHref } from '@/lib/receiving/listing-href';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';

type UnboxReturnCheckRow = Pick<
  ReceivingLineRow,
  | 'intake_type'
  | 'receiving_type'
  | 'carton_intake_type'
  | 'return_reason'
  | 'return_rma_ref'
  | 'return_source_order_id'
  | 'listing_url'
  | 'receiving_listing_url'
>;

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

export function UnboxReturnCheck({ row }: { row: UnboxReturnCheckRow }) {
  if (!isReturnIntake(row)) return null;

  const reason = readReturnReason(row.return_reason);
  const rma = clean(row.return_rma_ref);
  const originalOrder = clean(row.return_source_order_id);
  // Line listing wins; the carton-level link is the package default.
  const listingRaw = clean(row.listing_url) || clean(row.receiving_listing_url);

  return (
    <div
      aria-label="Return details"
      data-testid="unbox-return-check"
      className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-role-caption"
    >
      <span className="text-text-muted">
        Check for:{' '}
        <span
          className={reason ? 'font-semibold text-text-warning' : 'italic'}
          data-testid="unbox-return-reason"
        >
          {reason?.label ?? 'No reason given'}
        </span>
        {reason?.code ? (
          <span className="ml-1.5 font-mono" title="Code on the marketplace return report">
            {reason.code}
          </span>
        ) : null}
      </span>
      {rma ? (
        <span className="text-text-muted">
          RMA <span className="font-mono text-text-default">{rma}</span>
        </span>
      ) : null}
      {originalOrder ? (
        <span className="inline-flex items-center gap-1 text-text-muted">
          Original order
          <OrderIdChip value={originalOrder} display={originalOrder} dense truncateDisplay={false} />
        </span>
      ) : null}
      {listingRaw ? (
        <ListingUrlChip
          rawUrl={listingRaw}
          openHref={normalizeListingHref(listingRaw)}
          previewDisplay="View listing"
        />
      ) : null}
    </div>
  );
}
