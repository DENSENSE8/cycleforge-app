'use client';

/** The cart's DONE face — the visit shipped, here are the receipts. */

import { Button } from '@/design-system/primitives';
import { KioskPaneForm } from '@/components/kiosk/KioskPaneForm';
import { KIOSK_CART_STEPS } from '@/lib/kiosk/cart-step-gates';
import { KIOSK_META, KIOSK_SECTION_LABEL, KIOSK_TILE_TITLE } from '@/app/kiosk/kiosk-chrome';
import { KIOSK_POS_CTA, KIOSK_POS_CTA_SECONDARY } from '@/app/kiosk/kiosk-pos-surface';
import type {
  CounterRepairOutcome,
  CounterTransactionResult,
  CounterTransactionStatus,
  CounterTicketWorkOutcome,
} from '@/lib/counter/counter-transaction-types';
import { cn } from '@/utils/_cn';

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function openReceipt(transactionId: number | string, staffCopy = false) {
  window.open(
    `/api/kiosk/visit/${transactionId}/receipt?print=1${staffCopy ? '&copy=staff' : ''}`,
    '_blank',
    'noopener,noreferrer',
  );
}

/**
 * What the money on this visit MEANS. The kiosk stages and never charges, so
 * the staged wording is the common case — printing "paid" on it would be a lie
 * the customer would repeat at pickup.
 */
const STATUS_LINE: Record<CounterTransactionStatus, string> = {
  staged: 'Nothing charged on this tablet — payment happens at pickup.',
  paid: 'Paid in full.',
  partially_paid: 'Part paid — the balance is due at pickup.',
  abandoned: 'Abandoned — this visit was not completed.',
  voided: 'Voided — this visit was cancelled.',
};

/** Never claim a number that does not exist (plan: honest absence). */
function ticketLine(work: CounterTicketWorkOutcome): string | null {
  if (work.supportTicketId !== null) return `Support ticket #${work.supportTicketId}`;
  if (work.queued) return 'Support ticket queued — the number lands on the ticket itself.';
  return null;
}

/** What checked in — one sentence, in the words the counter uses out loud. */
function doneSummary(result: CounterTransactionResult): string {
  const count = result.repairs.length;
  if (count === 1) return `Service ${result.repairs[0].rsNumber} checked in.`;
  if (count > 1) return `${count} devices checked in — the rows below are the record.`;
  // Empty `repairs[]` is TWO different facts. A replay reports the original
  // transaction without re-deriving its sub-writes, so there is nothing to list.
  if (result.idempotentReplay) return `Visit #${result.counterTransactionId} was already recorded.`;
  return 'Sale staged at the register.';
}

/** A label/value fact line — the whole face is these, at two weights. */
function FactRow({
  label,
  value,
  testId,
  loud = false,
}: {
  label: string;
  value: string;
  testId?: string;
  loud?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-1.5">
      <dt className={loud ? 'text-sm font-semibold text-text-default' : KIOSK_META}>{label}</dt>
      <dd
        className={cn(
          'shrink-0 tabular-nums',
          loud ? 'text-lg font-semibold tracking-tight text-text-default' : KIOSK_META,
        )}
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * One device, one row: RS number is the loud identity (it is what the customer
 * quotes back on the phone), then the product, its serial, and its price.
 */
function DoneDeviceRow({ repair }: { repair: CounterRepairOutcome }) {
  const serial = repair.serialNumber.trim();
  return (
    <li
      className="flex items-start justify-between gap-3 px-4 py-2.5"
      data-testid="kiosk-done-device-row"
    >
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold tracking-tight text-text-default tabular-nums">
          {repair.rsNumber}
        </p>
        {/* Title clamp only — `truncate` would cancel it
            (law: src/components/search/search-result-faces.tsx:154-158). */}
        <p className={KIOSK_TILE_TITLE}>{repair.productTitle || 'Device'}</p>
        <p className={cn('mt-0.5', KIOSK_META)}>
          <span className="uppercase tracking-widest">Serial</span>{' '}
          <span className="font-mono normal-case tabular-nums">{serial || '—'}</span>
          {repair.ticketNumber ? (
            <>
              {' · '}
              <span className="uppercase tracking-widest">Ticket</span>{' '}
              <span className="font-mono normal-case tabular-nums">{repair.ticketNumber}</span>
            </>
          ) : null}
        </p>
      </div>
      <span
        className="shrink-0 text-base font-semibold tabular-nums text-text-default"
        data-testid="kiosk-done-device-price"
      >
        {formatCents(repair.priceCents)}
      </span>
    </li>
  );
}

export function KioskCartDoneFace({
  result,
  onClose,
  onNextCustomer,
}: {
  result: CounterTransactionResult;
  /** X, top-left — leaves the cart without resetting the visit. */
  onClose: () => void;
  /** Clears the ticket and returns the stepper to its first unit. */
  onNextCustomer: () => void;
}) {
  const devices = result.repairs;
  const ticket = ticketLine(result.ticketWork);
  const subtotalDiffers = result.subtotalCents !== result.totalCents;

  return (
    <KioskPaneForm
      testId="kiosk-cart-pane"
      progress={{
        current: KIOSK_CART_STEPS.length,
        total: KIOSK_CART_STEPS.length,
        onClose,
        closeLabel: 'Close cart',
        label: 'Cart progress',
      }}
      hero={
        <>
          <p className="text-lg font-semibold tracking-tight">All set</p>
          <p className="text-sm font-semibold text-text-soft">{doneSummary(result)}</p>

          <div
            className="min-h-0 w-full max-w-lg overflow-y-auto text-left"
            data-testid="kiosk-done-receipt"
          >
            {devices.length > 0 ? (
              <section>
                <h3 className={cn('px-4 pb-1', KIOSK_SECTION_LABEL)}>
                  {devices.length === 1 ? 'Device checked in' : 'Devices checked in'}
                </h3>
                <ul className="flex flex-col divide-y divide-border-hairline border-y border-border-hairline">
                  {devices.map((repair) => (
                    <DoneDeviceRow key={repair.id} repair={repair} />
                  ))}
                </ul>
              </section>
            ) : result.idempotentReplay ? (
              <p className={cn('px-4', KIOSK_META)} data-testid="kiosk-done-replay">
                This visit was submitted already, so nothing was written again. The devices are on
                the printed receipt below — print it to read them back.
              </p>
            ) : null}

            <section className="pt-3">
              <h3 className={cn('px-4 pb-1', KIOSK_SECTION_LABEL)}>Visit total</h3>
              <dl className="flex flex-col divide-y divide-border-hairline border-y border-border-hairline">
                {/* A repair-only visit has no goods, so its subtotal is $0.00
                    and printing it is a line the reader has to skip past. The
                    row earns its place only when goods actually moved. */}
                {subtotalDiffers && result.subtotalCents !== 0 && (
                  <FactRow
                    label="Subtotal"
                    value={formatCents(result.subtotalCents)}
                    testId="kiosk-done-subtotal"
                  />
                )}
                <FactRow
                  label="Total"
                  value={formatCents(result.totalCents)}
                  testId="kiosk-done-total"
                  loud
                />
                {/* The staged order's provider id is a support handle, not a
                    fact a customer across the counter can use — the RS numbers
                    above are their receipt. Say WHAT happened, not the id. */}
                {result.sale && (
                  <FactRow
                    label="Staged at the register"
                    value={
                      result.sale.totalCents === null ? '—' : formatCents(result.sale.totalCents)
                    }
                    testId="kiosk-done-sale"
                  />
                )}
              </dl>
              <p className={cn('px-4 pt-1.5', KIOSK_META)} data-testid="kiosk-done-status">
                {STATUS_LINE[result.status]}
              </p>
              {ticket ? (
                <p className={cn('px-4 pt-1', KIOSK_META)} data-testid="kiosk-done-ticket">
                  {ticket}
                </p>
              ) : null}
            </section>

            {result.warnings.length > 0 && (
              <section className="pt-3">
                <h3 className={cn('px-4 pb-1', KIOSK_SECTION_LABEL)}>Worth knowing</h3>
                <ul className="flex flex-col gap-1 px-4">
                  {result.warnings.map((warning) => (
                    // Advisory, never a failure — the visit shipped regardless.
                    <li key={warning} className={KIOSK_META} data-testid="kiosk-done-warning">
                      {warning}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="flex w-full max-w-sm flex-col gap-2">
            <Button
              size="lg"
              className={KIOSK_POS_CTA}
              data-testid="kiosk-print-customer-receipt"
              onClick={() => openReceipt(result.counterTransactionId)}
            >
              Print receipt
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className={KIOSK_POS_CTA_SECONDARY}
              data-testid="kiosk-print-staff-receipt"
              onClick={() => openReceipt(result.counterTransactionId, true)}
            >
              Print staff record
            </Button>
          </div>
        </>
      }
      footer={
        <Button
          size="lg"
          className={KIOSK_POS_CTA}
          data-testid="kiosk-cart-next-customer"
          onClick={onNextCustomer}
        >
          Next customer
        </Button>
      }
    />
  );
}
