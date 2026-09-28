'use client';

/**
 * Unbox RETURN callout — what to check for on a returned unit, painted at the
 * top of the line being unboxed. Return lines only; PO / trade-in lines render
 * nothing. The reason is the stored one (`receiving_line_return.return_reason`,
 * carton `return_reason` fallback) and is never guessed.
 */

import { AlertTriangle } from '@/components/Icons';
import { ListingUrlChip, OrderIdChip } from '@/components/ui/CopyChip';
import { readReturnReason } from '@/lib/inbound/return-reason-codes';
import { normalizeListingHref } from '@/lib/receiving/listing-href';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { isReturnIntake } from '@/lib/receiving/triage-intake-kind';

type UnboxReturnCalloutRow = Pick<
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

export function UnboxReturnCallout({ row }: { row: UnboxReturnCalloutRow }) {
  if (!isReturnIntake(row)) return null;

  const reason = readReturnReason(row.return_reason);
  const rma = clean(row.return_rma_ref);
  const originalOrder = clean(row.return_source_order_id);
  // Line listing wins; the carton-level link is the package default.
  const listingRaw = clean(row.listing_url) || clean(row.receiving_listing_url);
  const listingHref = normalizeListingHref(listingRaw);

  return (
    <section
      aria-label="Return details"
      data-testid="unbox-return-callout"
      className="mx-2 mt-2 flex flex-col gap-1.5 rounded-md border border-border-warning bg-surface-warning px-3 py-2"
    >
      <p className="flex items-start gap-1.5 text-role-body font-semibold text-text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0">
          Return — check for:{' '}
          <span className={reason ? 'text-text-default' : 'italic text-text-muted'} data-testid="unbox-return-reason">
            {reason?.label ?? 'No reason given'}
          </span>
          {reason?.code ? (
            <span className="ml-2 font-mono text-role-caption font-normal text-text-muted" title="Code on the marketplace return report">
              {reason.code}
            </span>
          ) : null}
        </span>
      </p>
      {rma || originalOrder || listingRaw ? (
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-role-caption">
          {rma ? (
            <div className="flex items-center gap-1">
              <dt className="text-text-muted">RMA</dt>
              <dd className="font-mono text-text-default">{rma}</dd>
            </div>
          ) : null}
          {originalOrder ? (
            <div className="flex items-center gap-1">
              <dt className="text-text-muted">Original order</dt>
              <dd>
                <OrderIdChip value={originalOrder} display={originalOrder} dense truncateDisplay={false} />
              </dd>
            </div>
          ) : null}
          {listingRaw ? (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <dt className="text-text-muted">Listing</dt>
              <dd className="flex min-w-0 flex-1">
                <ListingUrlChip rawUrl={listingRaw} openHref={listingHref} previewDisplay="View listing" />
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
