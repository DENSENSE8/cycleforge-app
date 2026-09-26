'use client';

/** Persistent right cart ledger — session root for `/kiosk/v2`. */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { KioskPaneForm } from '@/components/kiosk/KioskPaneForm';
import { KioskCartDoneFace } from './KioskCartDoneFace';
import { KioskCustomerIntake } from '@/components/kiosk/KioskCustomerIntake';
import { KioskCartLineList } from '@/components/kiosk/KioskCartLineList';
import { KioskLinkRepair } from '@/components/kiosk/KioskLinkRepair';
import { KioskStepTitleRow } from '@/components/kiosk/KioskStepTitleRow';
import { Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';
import { submitKioskVisit } from '@/lib/kiosk/submit-kiosk-visit';
import { firstKioskBlocker, type KioskTriageSession } from '@/lib/kiosk/visit-triage';
import {
  KIOSK_CART_STEPS,
  cartCompletedSteps,
  cartStepBlockReason,
  cartStepGates,
  type KioskCartStep,
} from '@/lib/kiosk/cart-step-gates';
import { cartMoneySplit, cartUnitCount } from '@/lib/kiosk/cart-money';
import type { CounterTransactionResult } from '@/lib/counter/counter-transaction-types';
import {
  KioskPaymentStepUpSheet,
  type KioskPaymentStepUpResult,
} from '@/components/kiosk/KioskPaymentStepUpSheet';
import { KIOSK_CENTRE_SURFACE, KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import {
  KIOSK_POS_CTA,
  KIOSK_POS_CTA_SECONDARY,
} from '@/app/kiosk/kiosk-pos-surface';

// (KIOSK_CART_CAPABILITIES deleted 2026-09-14, Phase 2 — a CompoundRow
// capability bag. The cart's lines are touch cards now; there is no desk row
// to tell "this family has no triage flags".)

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** Index of the terminal step — Pay. */
const LAST_STEP = (KIOSK_CART_STEPS.length - 1) as KioskCartStep;

export function KioskCartLedger({
  onClose,
  openAt = 'cart',
}: {
  onClose?: () => void;
  /**
   * `checkout` (the Keypad's Charge): land on Contact information, or on
   * Review when the customer step is already satisfied — the lines were
   * just reviewed on the keypad face.
   */
  openAt?: 'cart' | 'checkout';
} = {}) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [submitting, setSubmitting] = useState(false);
  /* Bulk line selection deleted 2026-09-14, Phase 2. */
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CounterTransactionResult | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);

  const idemKey = useRef<string | null>(null);

  // (The separate `computeKioskCartTotals` memo went 2026-09-15: the cart had
  // two money derivations in one component, and `cartMoneySplit` already
  // returns the same signed total alongside the due-now / due-at-pickup split.)

  /*
   * WHEN the money is due — goods at this counter, a service quote at pickup.
   * Drives the Review rows AND which terminal key exists at all, so the two
   * cannot disagree about whether this visit takes payment.
   */
  const money = useMemo(() => cartMoneySplit(session.lines), [session.lines]);
  const itemCount = useMemo(() => cartUnitCount(session.lines), [session.lines]);

  /* ONE gate model, three consumers: */
  const triage = useMemo<KioskTriageSession>(
    () => ({
      lines: session.lines,
      customerPhone: session.customerPhone,
      customerName: session.customerName,
      customerEmail: session.customerEmail,
      customerAddress: session.customerAddress,
    }),
    [
      session.lines,
      session.customerPhone,
      session.customerName,
      session.customerEmail,
      session.customerAddress,
    ],
  );
  const blockReason = useMemo(() => firstKioskBlocker(triage), [triage]);
  /** Which step is on SCREEN. Never the progress count — see PG6 below. */
  const [step, setStep] = useState<KioskCartStep>(() => {
    if (openAt !== 'checkout') return 0;
    const customerSet = [session.customerPhone, session.customerName, session.customerEmail].some(
      (v) => Boolean(v?.trim()),
    );
    return customerSet && cartStepGates(triage)[1] ? LAST_STEP : 1;
  });
  // PG6: a COUNT of satisfied units, never the index of the step in view.
  const completedSteps = useMemo(() => cartCompletedSteps(triage), [triage]);
  const stepCanContinue = cartStepGates(triage)[step];
  const stepBlockReason = cartStepBlockReason(triage, step);

  /**
   * Submit the visit. The pane's "Submit repair" key runs the SAME function
   * (`submitKioskVisit`) — one endpoint, one idempotency contract, one success
   * document. The local mapping/fetch that used to live here is gone with it.
   */
  const postIntake = useCallback(
    async (opts: { takePayment: boolean; staffId?: number; pin?: string }) => {
      if (!idemKey.current) idemKey.current = safeRandomUUID();
      const tx = await submitKioskVisit(
        {
          lines: session.lines,
          customerPhone: session.customerPhone,
          customerName: session.customerName,
          customerEmail: session.customerEmail,
          customerAddress: session.customerAddress,
          ticketChoice: session.ticketChoice,
        },
        { idempotencyKey: idemKey.current, ...opts },
      );
      idemKey.current = null;
      return tx;
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
      actions.completeCart();
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
        actions.completeCart();
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

  /*
   * Clear cart asks first (the confirm floor below). Removing ONE line needs
   * no PIN and no reason — see KioskCartLineList.
   */
  const clearCart = () => {
    actions.clearCart();
    setConfirmVoid(false);
  };

  /*
   * ## The cart wears the repair intake form's SKELETON, not a sheet
   * Operator 2026-09-15: *"in terms of the cart component, it should be very
   * The band is also the ONLY band. Operator 2026-09-14, rejecting the titled
   */
  const exit = onClose ?? (() => {});

  if (result) {
    return (
      <div className={KIOSK_CENTRE_SURFACE} data-testid="kiosk-cart-ledger">
        <KioskCartDoneFace
          result={result}
          onClose={exit}
          onNextCustomer={() => {
            setResult(null);
            actions.resetSession();
            setStep(0);
          }}
        />
      </div>
    );
  }

  return (
    <div className={KIOSK_CENTRE_SURFACE} data-testid="kiosk-cart-ledger">
      <KioskPaneForm
        testId="kiosk-cart-pane"
        progress={{
          current: completedSteps,
          total: KIOSK_CART_STEPS.length,
          onClose: exit,
          closeLabel: 'Close cart',
          label: 'Cart progress',
        }}
        footer={
          step === 0 && confirmVoid && session.lines.length > 0 ? (
            /*
             * CONFIRM, in place (operator 2026-09-23:
             * CONFIRM, in place (operator 2026-09-23: "the clear cart button
             */
            <>
              <Button
                variant="secondary"
                size="lg"
                className={KIOSK_POS_CTA_SECONDARY}
                data-testid="kiosk-cart-void-cancel"
                onClick={() => setConfirmVoid(false)}
              >
                Keep items
              </Button>
              <Button
                variant="danger"
                size="lg"
                className={KIOSK_POS_CTA}
                data-testid="kiosk-cart-void-confirm"
                onClick={clearCart}
              >
                {itemCount === 1 ? 'Clear 1 item' : `Clear all ${itemCount} items`}
              </Button>
            </>
          ) : (
          <>
            {step === 0 ? (
              session.lines.length > 0 && (
                // Delete-all, on the step it belongs to. Asks first — see the
                // confirm floor above.
                <Button
                  variant="ghost"
                  size="lg"
                  className="shrink-0"
                  data-testid="kiosk-cart-void-all"
                  onClick={() => setConfirmVoid(true)}
                >
                  Clear cart
                </Button>
              )
            ) : (
              <Button
                variant="ghost"
                size="lg"
                onClick={() => setStep((s) => (s === 2 ? 1 : 0))}
                data-testid="kiosk-cart-step-back"
              >
                ‹ Back
              </Button>
            )}

            {step < LAST_STEP ? (
              <Button
                size="lg"
                className={KIOSK_POS_CTA}
                disabled={!stepCanContinue}
                title={stepBlockReason ?? undefined}
                data-testid="kiosk-cart-continue"
                onClick={() => setStep((s) => (s === 0 ? 1 : 2))}
              >
                Continue
              </Button>
            ) : money.takesPaymentNow ? (
              <>
                <Button
                  variant="secondary"
                  size="lg"
                  className={KIOSK_POS_CTA_SECONDARY}
                  disabled={!!blockReason || submitting}
                  title={blockReason ?? undefined}
                  data-testid="kiosk-cart-save"
                  onClick={() => void submitSave()}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </Button>
                <Button
                  size="lg"
                  className={KIOSK_POS_CTA}
                  disabled={!!blockReason || submitting}
                  title={blockReason ?? undefined}
                  data-testid="kiosk-cart-pay"
                  onClick={() => {
                    if (blockReason) {
                      toast(blockReason);
                      return;
                    }
                    setStepUpOpen(true);
                  }}
                >
                  Pay {formatCents(money.dueNowCents)}
                </Button>
              </>
            ) : (
              /*
               * Nothing is payable at this counter, so there is no Pay key to
               * offer. Operator 2026-09-15: *"a repair service on drop off
               */
              <Button
                size="lg"
                className={KIOSK_POS_CTA}
                disabled={!!blockReason || submitting}
                title={blockReason ?? undefined}
                data-testid="kiosk-cart-save"
                onClick={() => void submitSave()}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Check in & print'}
              </Button>
            )}
          </>
          )
        }
      >
        <div data-kiosk-cart-step={step}>
          {/* ONE bold display header per step with the running `N · $total`
              on the same row — see KioskStepTitleRow. */}
          <KioskStepTitleRow
            title={KIOSK_CART_STEPS[step]}
            count={itemCount}
            totalCents={money.totalCents}
            meta={step === 0 && session.cartId !== null ? `#${session.cartId}` : null}
            testId="kiosk-cart-summary"
          />

          {step === 0 && (
            <>
              {/* The FRAME owns scrolling — this list must not grow its own
                  overflow region. See KioskCartLineList for the card/edit/remove law. */}
              <KioskCartLineList
                ariaLabel="Cart items"
                className="px-3 pb-4"
                empty={
                  <p className="px-4 py-8 text-center text-sm font-semibold text-text-soft">
                    Cart is empty. Scan a barcode or tap an item in the catalog.
                  </p>
                }
              />
              {/* An existing ticket joins THIS cart as a linked line — no second
                  intake, no signature. See KioskLinkRepair. */}
              <div className="px-3 pb-4">
                <KioskLinkRepair />
              </div>
            </>
          )}

          {step === 1 && (
            <KioskCustomerIntake
              entry
              fields={['phone', 'name', 'email', 'address']}
              heading={null}
              className="bg-surface-card pb-4"
              onSubmit={() => {
                if (stepCanContinue) setStep(2);
              }}
            />
          )}

          {step === LAST_STEP && (
            <div className="px-4 pb-6">
              {/*
 * TWO facts, not one total, because a walk-in settles in two moments:
 * is collected (operator 2026-09-15 — a drop-off "never takes
 */}
              <dl className="flex flex-col gap-2 border-t border-border-hairline pt-3">
                {money.dueNowCents !== 0 && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-base font-semibold text-text-default">
                      {money.dueNowCents < 0 ? 'Due to customer' : 'Due now'}
                    </dt>
                    <dd
                      className="text-2xl font-semibold tracking-tight tabular-nums"
                      data-testid="kiosk-cart-due-now"
                    >
                      {formatCents(Math.abs(money.dueNowCents))}
                    </dd>
                  </div>
                )}
                {money.dueAtPickupCents !== 0 && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className={KIOSK_META}>Due at pickup</dt>
                    <dd
                      className={cn('text-base font-semibold tabular-nums', KIOSK_META)}
                      data-testid="kiosk-cart-due-at-pickup"
                    >
                      {formatCents(money.dueAtPickupCents)}
                    </dd>
                  </div>
                )}
              </dl>
              {money.dueAtPickupCents !== 0 && !money.takesPaymentNow && (
                <p className={cn('pt-2', KIOSK_META)}>
                  Nothing to pay today — the receipt is the drop-off record.
                </p>
              )}
              {(error || blockReason) && (
                <p className="pt-3 text-center text-sm font-semibold text-text-soft">
                  {error ?? blockReason}
                </p>
              )}
            </div>
          )}
        </div>
      </KioskPaneForm>

      <KioskPaymentStepUpSheet
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onAuthorized={onStepUpAuthorized}
      />
    </div>
  );
}
