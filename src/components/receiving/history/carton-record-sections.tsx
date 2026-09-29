'use client';

/**
 * The carton record's leaf sections — the per-item card (identity + what the
 * item carries: serials, claim, notes) and the right column's fact rows. The
 * item's receiving steps (graded, tested, label printed, received, put away)
 * live in the record's Fulfilment group, below the items (owner 2026-09-28).
 * Composed by {@link CartonRecordView}.
 */

import type { ReactNode } from 'react';
import { ExternalLink } from '@/components/Icons';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordListingLink } from '@/design-system/components/record-ledger/RecordIdentity';
import { RecordPhoto, recordInitials } from '@/design-system/components/record-ledger/IndustrialRecord';
import {
  RECORD_FACT_KEY_CLASS,
  RECORD_ID_CLASS,
  RECORD_PRICE_CLASS,
} from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { conditionLabel } from '@/lib/conditions';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  receivingRecordIdentity,
  receivingRecordSerials,
  receivingSerialCountWarning,
} from '@/lib/receiving/record-identity';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { zendeskTicketUrl } from '@/lib/zendesk-ticket-url';
import { formatMonthDayTimePST } from '@/utils/date';
import { formatCurrency } from '@/utils/_number';
import { cn } from '@/utils/_cn';

const stamp = (value: string | null | undefined): string | null =>
  value && value.trim() ? formatMonthDayTimePST(value) : null;

/** `who · when`, dropping whichever part is missing. */
function byAt(who: string | null | undefined, at: string | null | undefined): string {
  return [who?.trim() || null, stamp(at)].filter(Boolean).join(' · ');
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-mode-muted">{children}</span>;
}

/** A zendesk ticket (`#12345`) as a link to the helpdesk, else its text. */
export function TicketLink({ ticket }: { ticket: string }) {
  const href = zendeskTicketUrl(ticket);
  const face = ticket.startsWith('#') ? ticket : `#${ticket}`;
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(RECORD_ID_CLASS, 'inline-flex items-center gap-1 underline decoration-mode-edge underline-offset-2 hover:decoration-mode-ink', focusRing('control'))}
    >
      {face}
      <ExternalLink aria-hidden className="h-3 w-3" />
    </a>
  ) : (
    <span className={RECORD_ID_CLASS}>{face}</span>
  );
}

/**
 * One item (receiving line) of the carton: what it is — the Zoho-governed title,
 * SKU, qty, condition, price, listing — then what the item carries: serials,
 * claim ticket, notes.
 */
export function CartonItem({
  line,
  current,
  surface = 'unboxed',
}: {
  line: ReceivingLineRow;
  /** The line the staffer opened from the list. */
  current: boolean;
  surface?: 'docked' | 'unboxed';
}) {
  // SKU IDENTITY LAW (src/lib/sku/sku-identity-law.ts): the Zoho item title governs.
  const title =
    resolveSkuIdentityTitle({
      zoho_item_title: line.zoho_item_title,
      catalog_product_title: line.catalog_product_title,
      item_name: line.item_name,
      sku: line.sku,
    }) || 'Unidentified item';
  const identity = receivingRecordIdentity(line);
  const serials = receivingRecordSerials(line);
  const serialWarning = receivingSerialCountWarning(line);
  const price = Number(line.unit_price);
  const expected = line.quantity_expected;
  const received = line.quantity_received ?? 0;
  const short = surface === 'unboxed' && expected != null && received < expected;
  const sku = (line.sku || '').trim() || null;
  const ticket = (line.zendesk_ticket || '').trim() || null;
  const note = (line.notes || '').trim() || null;
  const labelNote = (line.label_note || '').trim() || null;
  const zohoNote = (line.zoho_notes || '').trim() || null;

  return (
    <article
      data-testid="carton-record-item"
      data-line-id={line.id}
      data-current={current ? '' : undefined}
      aria-label={title}
      className={cn('border-b border-mode-fact last:border-b-0', current ? 'bg-mode-panel' : 'bg-mode-bar')}
    >
      <div className="flex gap-3 px-4 py-3">
        <span className="relative h-28 w-28 shrink-0 overflow-hidden rounded-mode-control border border-mode-frame bg-mode-well">
          <RecordPhoto src={line.image_url} fallback={recordInitials(title)} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start gap-2">
            <p className="line-clamp-2 min-w-0 flex-1 text-role-body font-bold" title={title}>
              {title}
            </p>
          </div>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-role-data">
            <span>
              <span className={RECORD_FACT_KEY_CLASS}>SKU </span>
              <span className={cn(RECORD_ID_CLASS, 'select-all text-mode-ink')}>{sku ?? '—'}</span>
            </span>
            <span data-testid="carton-item-qty">
              <span className={RECORD_FACT_KEY_CLASS}>Qty </span>
              <span className={cn(RECORD_ID_CLASS, short ? 'text-mode-warn' : 'text-mode-ink')}>
                {surface === 'docked' ? `${expected ?? received} expected` : `${received}/${expected ?? '?'}`}
              </span>
            </span>
            <span>
              <span className={RECORD_FACT_KEY_CLASS}>Condition </span>
              <span className="text-mode-ink">{conditionLabel(line.condition_grade, 'label')}</span>
            </span>
            <span>
              <span className={RECORD_FACT_KEY_CLASS}>Price </span>
              <span className={RECORD_PRICE_CLASS}>{Number.isFinite(price) && price > 0 ? formatCurrency(price) : '—'}</span>
            </span>
            {identity.itemNumber ? (
              <span className="inline-flex items-center gap-1">
                <span className={RECORD_FACT_KEY_CLASS}>Listing</span>
                <RecordListingLink href={identity.listingHref} itemNumber={identity.itemNumber} face="value" />
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="flex flex-col px-4 pb-2 [&>*:last-child]:border-b-0" data-testid="carton-item-facts">
        <EvidenceFactRow label="Serials" wide={serials.length > 1}>
          {serials.length ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-0.5 py-1" data-testid="carton-item-serials">
              {serials.map((serial) => (
                <li key={serial} className={cn(RECORD_ID_CLASS, 'select-all break-all')}>
                  {serial}
                </li>
              ))}
            </ul>
          ) : line.serial_absent ? (
            <span>Waived{line.serial_absent_reason ? <Muted> · {line.serial_absent_reason}</Muted> : null}</span>
          ) : (
            <Muted>None captured</Muted>
          )}
          {serialWarning ? (
            <p role="status" className="pb-1 text-role-caption text-mode-warn">
              {serialWarning}
            </p>
          ) : null}
        </EvidenceFactRow>
        <EvidenceFactRow label="Claim">
          {ticket ? <TicketLink ticket={ticket} /> : <Muted>No ticket</Muted>}
        </EvidenceFactRow>
        {note ? <EvidenceFactRow label="Item note" wide>{note}</EvidenceFactRow> : null}
        {labelNote ? <EvidenceFactRow label="Label face" wide>{labelNote}</EvidenceFactRow> : null}
        {zohoNote ? <EvidenceFactRow label="PO line note" wide>{zohoNote}</EvidenceFactRow> : null}
      </div>
    </article>
  );
}

/** `stamp` + `who` for the right column's fact rows (`Delivered`, `Last event`). */
export function CartonStampFact({ label, who, at }: { label: string; who?: string | null; at: string | null | undefined }) {
  const face = byAt(who, at);
  if (!face) return null;
  return (
    <EvidenceFactRow label={label}>
      <span className={RECORD_ID_CLASS}>{face}</span>
    </EvidenceFactRow>
  );
}
