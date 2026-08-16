'use client';

/**
 * Persistent right cart ledger — session root for `/kiosk/v2`.
 *
 * Always mounted (even empty). Staff face shows void + Customer + Pay.
 * Customer face strips destructive actions (see KioskCustomerFace).
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Button, TextField } from '@/design-system/primitives';
import { Loader2, X } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  computeKioskCartTotals,
  cartIsEmpty,
} from '@/lib/kiosk/cart-line';
import {
  useKioskSession,
  useKioskSessionActions,
  lineTypeLabel,
} from '@/lib/kiosk/kiosk-session-store';
import { mapKioskCartToCounterParts } from '@/lib/kiosk/cart-to-counter';
import { buildKioskSalesIntakeBodyFromInput } from '@/lib/counter/kiosk-intake-payload';
import type { CounterTransactionResult } from '@/lib/counter/counter-transaction-types';
import {
  KioskPaymentStepUpSheet,
  type KioskPaymentStepUpResult,
} from '@/components/kiosk/KioskPaymentStepUpSheet';
import {
  KIOSK_CART_FACE,
  KIOSK_CART_LINE_ROW,
  KIOSK_META,
  KIOSK_PANE_FOOTER_BAND,
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
} from '@/app/kiosk/kiosk-chrome';

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function KioskCartLedger() {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CounterTransactionResult | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const idemKey = useRef<string | null>(null);

  const totals = useMemo(
    () => computeKioskCartTotals(session.lines),
    [session.lines],
  );

  const blockReason = useMemo(() => {
    if (cartIsEmpty(session.lines)) return 'Add items with scan or catalog.';
    if (!session.customerPhone.trim()) return 'Enter a phone number.';
    const digits = session.customerPhone.replace(/\D/g, '');
    if (digits.length < 7) return 'Phone number looks incomplete.';
    const { service, extraRepairCount } = mapKioskCartToCounterParts(session.lines);
    if (service && !service.serialNumber.trim()) {
      return 'Repair line needs a serial number.';
    }
    if (service && !String(service.price ?? '').trim()) {
      return 'Repair line needs a catalog price.';
    }
    if (service && !service.signatureDataUrl) {
      return 'Signature required for repair drop-off.';
    }
    if (extraRepairCount > 0) {
      return `Only one repair per visit is submitted — remove ${extraRepairCount} extra.`;
    }
    return null;
  }, [session.lines, session.customerPhone]);

  const postIntake = useCallback(
    async (opts: { takePayment: boolean; staffId?: number; pin?: string }) => {
      if (!idemKey.current) idemKey.current = safeRandomUUID();
      const { retailLines, service } = mapKioskCartToCounterParts(session.lines);
      const res = await fetch('/api/kiosk/intake', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idemKey.current,
        },
        body: JSON.stringify(
          buildKioskSalesIntakeBodyFromInput(
            {
              customer: {
                phone: session.customerPhone,
                name: session.customerName || null,
                email: session.customerEmail || null,
              },
              retailLines,
              service,
              priorOrder: null,
              ticketWork: service ? { mode: 'create' } : { mode: 'none' },
            },
            opts,
          ),
        ),
      });

      const body = (await res.json().catch(() => ({}))) as {
        transaction?: CounterTransactionResult;
        error?: string;
      };

      if (res.status === 403 && body.error === 'STEPUP_FAILED') {
        throw new Error('PIN incorrect. Try again.');
      }
      if (res.status === 403 && body.error?.includes('STEPUP')) {
        throw new Error('A manager needs to authorize payment on this tablet.');
      }
      if (!res.ok || !body.transaction) {
        throw new Error(body.error?.trim() || 'Transaction failed');
      }
      idemKey.current = null;
      return body.transaction;
    },
    [session],
  );

  const submitSave = async () => {
    if (submitting || blockReason) return;
    setSubmitting(true);
    setError(null);
    try {
      const tx = await postIntake({ takePayment: false });
      setResult(tx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete this transaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const onStepUpAuthorized = useCallback(
    async (creds: KioskPaymentStepUpResult) => {
      try {
        actions.setAwaitingCard(true);
        const tx = await postIntake({
          takePayment: true,
          staffId: creds.staffId,
          pin: creds.pin,
        });
        setStepUpOpen(false);
        setResult(tx);
        actions.setAwaitingCard(false);
        return { ok: true as const };
      } catch (err) {
        actions.setAwaitingCard(false);
        const message =
          err instanceof Error ? err.message : 'Could not complete this transaction.';
        if (message.includes('PIN incorrect')) {
          return { ok: false as const, error: message };
        }
        setStepUpOpen(false);
        setError(message);
        return { ok: false as const, error: message };
      }
    },
    [postIntake, actions],
  );

  if (result) {
    return (
      <aside className={KIOSK_CART_FACE} data-testid="kiosk-cart-ledger">
        <div className={KIOSK_PANE_HEADER_BAND}>
          <h2 className={KIOSK_PANE_HEADER_TITLE}>Cart</h2>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-lg font-semibold tracking-tight">All set</p>
          <p className="text-sm font-semibold text-text-soft">
            {result.repair?.rsNumber
              ? `Service ${result.repair.rsNumber} checked in.`
              : 'Sale staged at the register.'}
          </p>
        </div>
        <div className={KIOSK_PANE_FOOTER_BAND}>
          <Button
            size="lg"
            className={cn('h-full min-h-0 w-full flex-1 rounded-none', cornerClass('flush'))}
            onClick={() => {
              setResult(null);
              actions.resetSession();
            }}
          >
            Next customer
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside className={KIOSK_CART_FACE} data-testid="kiosk-cart-ledger">
      <div className={KIOSK_PANE_HEADER_BAND}>
        <h2 className={KIOSK_PANE_HEADER_TITLE}>Cart</h2>
        <span className={cn('tabular-nums', KIOSK_META)}>
          {session.lines.length} {session.lines.length === 1 ? 'line' : 'lines'}
        </span>
      </div>

      <div className="shrink-0 space-y-2 border-b border-border-hairline px-4 py-3">
        <TextField
          label="Phone"
          value={session.customerPhone}
          onChange={(v) => actions.setCustomer({ phone: v })}
          tone="blue"
          inputClassName="rounded-none"
        />
        <TextField
          label="Name"
          value={session.customerName}
          onChange={(v) => actions.setCustomer({ name: v })}
          tone="blue"
          inputClassName="rounded-none"
        />
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-border-hairline overflow-y-auto">
        {session.lines.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm font-semibold text-text-soft">
            Scan a UPC or pick from the catalog.
          </li>
        ) : (
          session.lines.map((line) => (
            <li key={line.id} className={KIOSK_CART_LINE_ROW}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-text-default">{line.title}</p>
                <p className={cn('uppercase tracking-widest', KIOSK_META)}>
                  {lineTypeLabel(line.type)}
                  {line.quantity > 1 ? ` · ×${line.quantity}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    line.unitAmountCents < 0 ? 'text-emerald-700' : 'text-text-default',
                  )}
                >
                  {formatCents(line.unitAmountCents * line.quantity)}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${line.title}`}
                  data-testid="kiosk-cart-void-line"
                  className="ds-raw-button p-1 text-text-soft hover:text-text-danger"
                  onClick={() => actions.removeLine(line.id)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

      <div className="shrink-0 border-t border-border-soft px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className={KIOSK_META}>Total</span>
          <span className="text-xl font-semibold tracking-tight tabular-nums">
            {formatCents(totals.totalCents)}
          </span>
        </div>
        {(error || blockReason) && (
          <p className="mt-2 text-center text-sm font-semibold text-text-soft">
            {error ?? blockReason}
          </p>
        )}
      </div>

      <div className={cn(KIOSK_PANE_FOOTER_BAND, 'gap-0')} data-kiosk-footer-band>
        <Button
          variant="secondary"
          size="lg"
          className={cn(
            'h-full min-h-0 flex-1 rounded-none border-r border-border-soft',
            cornerClass('flush'),
          )}
          onClick={() => actions.setFace('customer', { manual: true })}
          data-testid="kiosk-show-customer"
        >
          Customer
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className={cn(
            'h-full min-h-0 flex-1 rounded-none border-r border-border-soft',
            cornerClass('flush'),
          )}
          disabled={!!blockReason || submitting}
          onClick={() => void submitSave()}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
        <Button
          size="lg"
          className={cn('h-full min-h-0 flex-1 rounded-none', cornerClass('flush'))}
          disabled={!!blockReason || submitting}
          onClick={() => {
            if (blockReason) {
              toast(blockReason);
              return;
            }
            setStepUpOpen(true);
          }}
        >
          Pay
        </Button>
      </div>

      <KioskPaymentStepUpSheet
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onAuthorized={onStepUpAuthorized}
      />
    </aside>
  );
}
