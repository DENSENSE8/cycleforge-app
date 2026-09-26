'use client';

/**
 * The carton record's sections — the per-item card (identity + the item's own
 * status chain) and the right column's fact blocks. Composed by
 * {@link CartonRecordView}; each reads only the carton / line fields it paints.
 */

import type { ReactNode } from 'react';
import { ExternalLink } from '@/components/Icons';
import { EvidenceFactRow } from '@/design-system/components/record-ledger/EvidenceDisclosure';
import { RecordListingLink } from '@/design-system/components/record-ledger/RecordIdentity';
import { RecordPhoto, recordInitials } from '@/design-system/components/record-ledger/IndustrialRecord';
import {
  RECORD_ID_CLASS,
  RECORD_LABEL_CLASS,
  RECORD_PRICE_CLASS,
  stateBadgeClass,
} from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { conditionLabel } from '@/lib/conditions';
import { dockedReceivingState } from '@/lib/receiving/docked-record-state';
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

/** One column of the record: the industrial panel its sections stack in. */
export const CARTON_COLUMN_CLASS = 'flex min-w-0 flex-col border border-mode-ink bg-mode-bar';

/** A column's section head — mono label on the ink rule. */
export function CartonColumnHead({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-mode-hit items-center gap-2 border-b border-mode-ink px-4">
      <h3 className={cn(RECORD_LABEL_CLASS, 'flex-1 text-mode-muted')}>{label}</h3>
      {action}
    </div>
  );
}

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
 * SKU, listing, price, qty — then its own status chain: condition graded,
 * serials, test, label printed, received, put away, claim ticket, notes.
 */
export function CartonItem({
  line,
  current,
}: {
  line: ReceivingLineRow;
  /** The line the staffer opened from the list. */
  current: boolean;
}) {
  // SKU IDENTITY LAW (src/lib/sku/sku-identity-law.ts): the Zoho item title governs.
  const title =
    resolveSkuIdentityTitle({
      zoho_item_title: line.zoho_item_title,
      catalog_product_title: line.catalog_product_title,
      item_name: line.item_name,
      sku: line.sku,
    }) || 'Unidentified item';
  const state = dockedReceivingState(line);
  const identity = receivingRecordIdentity(line);
  const serials = receivingRecordSerials(line);
  const serialWarning = receivingSerialCountWarning(line);
  const price = Number(line.unit_price);
  const expected = line.quantity_expected;
  const received = line.quantity_received ?? 0;
  const short = expected != null && received < expected;
  const sku = (line.sku || '').trim() || null;
  const ticket = (line.zendesk_ticket || '').trim() || null;
  const tested = Boolean(line.tested_at) || (line.tested_count ?? 0) > 0;
  const stagedBin = (line.staged_location_code || line.staged_location_name || '').trim() || null;
  const note = (line.notes || '').trim() || null;
  const labelNote = (line.label_note || '').trim() || null;
  const zohoNote = (line.zoho_notes || '').trim() || null;

  return (
    <article
      data-testid="carton-record-item"
      data-line-id={line.id}
      data-current={current ? '' : undefined}
      aria-label={title}
      className={cn('border-b border-mode-ink', current ? 'bg-mode-panel' : 'bg-mode-bar')}
    >
      <div className="flex gap-3 p-3">
        <span className="relative h-20 w-20 shrink-0 overflow-hidden border border-mode-rule bg-mode-well">
          <RecordPhoto src={line.image_url} fallback={recordInitials(title)} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-start gap-2">
            <p className="line-clamp-2 min-w-0 flex-1 text-role-body font-bold" title={title}>
              {title}
            </p>
            <span className={cn(RECORD_LABEL_CLASS, 'shrink-0', stateBadgeClass(state.tone))} data-testid="carton-item-state">
              {state.code} · {state.label}
            </span>
          </div>
          <p className={cn(RECORD_LABEL_CLASS, 'flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-mode-muted')}>
            <span>
              SKU <span className={cn(RECORD_ID_CLASS, 'select-all normal-case tracking-normal text-mode-ink')}>{sku ?? '—'}</span>
            </span>
            <span data-testid="carton-item-qty">
              QTY{' '}
              <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal', short ? 'text-mode-warn' : 'text-mode-ink')}>
                {received}/{expected ?? '?'}
              </span>
            </span>
            <span>
              COND <span className={cn(RECORD_ID_CLASS, 'normal-case tracking-normal text-mode-ink')}>{conditionLabel(line.condition_grade, 'compact')}</span>
            </span>
            <span>
              PRICE{' '}
              <span className={cn(RECORD_PRICE_CLASS, 'normal-case tracking-normal')}>
                {Number.isFinite(price) && price > 0 ? formatCurrency(price) : '—'}
              </span>
            </span>
            {identity.itemNumber ? (
              <span className="inline-flex items-center gap-1">
                ITEM <RecordListingLink href={identity.listingHref} itemNumber={identity.itemNumber} face="value" />
              </span>
            ) : null}
          </p>
        </div>
      </div>
      <div className="flex flex-col px-4 pb-2" data-testid="carton-item-chain">
        <EvidenceFactRow label="Condition">
          {line.condition_graded_at ? (
            <span>
              {conditionLabel(line.condition_grade, 'label')} <Muted>· graded {stamp(line.condition_graded_at)}</Muted>
            </span>
          ) : (
            <Muted>Not graded</Muted>
          )}
        </EvidenceFactRow>
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
        {line.needs_test || tested ? (
          <EvidenceFactRow label="Test">
            {tested ? (
              <span>
                Tested{(line.tested_count ?? 0) > 1 ? ` ×${line.tested_count}` : ''}
                {line.qa_status ? <Muted> · QA {line.qa_status.toLowerCase()}</Muted> : null}
                {line.tested_at ? <Muted> · {stamp(line.tested_at)}</Muted> : null}
              </span>
            ) : (
              <span className="text-mode-warn">Needs test</span>
            )}
          </EvidenceFactRow>
        ) : null}
        <EvidenceFactRow label="Label">
          {line.label_printed_at ? `Printed ${stamp(line.label_printed_at)}` : <Muted>Not printed</Muted>}
        </EvidenceFactRow>
        <EvidenceFactRow label="Received">
          {line.received_done_at ? stamp(line.received_done_at) : <Muted>Not received</Muted>}
        </EvidenceFactRow>
        {line.staged_at || stagedBin ? (
          <EvidenceFactRow label="Put away">
            <span>
              {stagedBin ? <span className={RECORD_ID_CLASS}>{stagedBin}</span> : null}
              {line.staged_at || line.staged_by_name ? <Muted> · {byAt(line.staged_by_name, line.staged_at)}</Muted> : null}
            </span>
          </EvidenceFactRow>
        ) : null}
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
