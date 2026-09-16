'use client';

/**
 * Persistent right cart ledger — session root for `/kiosk/v2`.
 *
 * Always mounted (even empty). Staff face shows void + Save + Pay.
 * Customer face strips destructive actions (see KioskCustomerFace); the face
 * flips on tablet orientation (or Esc back), never a manual Customer button.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { KioskPaneForm } from '@/components/kiosk/KioskPaneForm';
import { KioskCartDoneFace } from './KioskCartDoneFace';
import { KioskCustomerIntake } from '@/components/kiosk/KioskCustomerIntake';
import { KioskCartLineEditor } from '@/components/kiosk/KioskCartLineEditor';
import { KioskCartSwipeRow } from '@/components/kiosk/KioskCartSwipeRow';
import { KioskCartLineCard } from '@/components/kiosk/KioskCartLineCard';
import { Loader2 } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';
import { mapKioskCartToCounterParts } from '@/lib/kiosk/cart-to-counter';
import { firstKioskBlocker, type KioskTriageSession } from '@/lib/kiosk/visit-triage';
import {
  KIOSK_CART_STEPS,
  cartCompletedSteps,
  cartStepBlockReason,
  cartStepGates,
  type KioskCartStep,
} from '@/lib/kiosk/cart-step-gates';
import { cartMoneySplit } from '@/lib/kiosk/cart-money';
import { kioskTicketWork } from '@/lib/kiosk/repair-ticket-choice';
import { buildKioskSalesIntakeBodyFromInput } from '@/lib/counter/kiosk-intake-payload';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';
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

export interface KioskCartFocus {
  lineId: string;
  field?: 'serial' | 'price' | 'imei' | 'quantity' | 'signature';
  /** Bumped by the sender so the SAME target re-opens after a manual close. */
  nonce: number;
}

export function KioskCartLedger({ focus, onClose }: { focus?: KioskCartFocus | null; onClose?: () => void } = {}) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [submitting, setSubmitting] = useState(false);
  /*
   * Bulk line selection deleted 2026-09-14, Phase 2. It existed because
   * `CompoundRow` offers a select gutter, not because the cart had a bulk
   * verb: nothing ever read `selectedLineIds` — no bulk void, no bulk
   * discount, no selection action bar. A checkbox column on a counter tablet
   * that does nothing is worse than no column, and it is desk chrome besides.
   */
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CounterTransactionResult | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [editFocusField, setEditFocusField] =
    useState<KioskCartFocus['field']>(undefined);
  /** Which step is on SCREEN. Never the progress count — see PG6 below. */
  const [step, setStep] = useState<KioskCartStep>(0);

  /*
   * Triage deep-link: open that line's editor on the field that is failing —
   * and page the stepper back to Items, because a line editor opened behind
   * the Customer step is an editor the operator cannot see.
   */
  useEffect(() => {
    if (!focus) return;
    setEditingLineId(focus.lineId);
    setEditFocusField(focus.field);
    setStep(0);
  }, [focus?.lineId, focus?.field, focus?.nonce, focus]);
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

  /*
   * ONE gate model, three consumers: the stepper's segment count, each step's
   * Continue key, and the Save/Pay submit gate all read `collectKioskTriage`
   * through `cart-step-gates`, so the button, the header and the triage panel
   * can never disagree about why this visit cannot submit.
   */
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
  // PG6: a COUNT of satisfied units, never the index of the step in view.
  const completedSteps = useMemo(() => cartCompletedSteps(triage), [triage]);
  const stepCanContinue = cartStepGates(triage)[step];
  const stepBlockReason = cartStepBlockReason(triage, step);

  const postIntake = useCallback(
    async (opts: { takePayment: boolean; staffId?: number; pin?: string }) => {
      if (!idemKey.current) idemKey.current = safeRandomUUID();
      const { retailLines, services } = mapKioskCartToCounterParts(session.lines);
      const res = await kioskFetchHealed('/api/kiosk/intake', {
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
                address: session.customerAddress || null,
              },
              retailLines,
              services,
              priorOrder: null,
              /*
               * The VISIT's decision, not a hardcoded create.
               *
               * This line read `services.length > 0 ? { mode: 'create' } : …`,
               * so the `attach` arm of the route's `ticketWork` union — and
               * the `ATTACH_TICKET` outbox work type behind it — had no
               * caller at all. The repair flow's last step now answers the
               * question (`KioskTicketStep`), and `kioskTicketWork` maps that
               * answer, falling back to `create` so a service visit nobody
               * asked still files a ticket exactly as before.
               */
              ticketWork: kioskTicketWork(session.ticketChoice, services.length > 0),
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

  /*
   * ## The cart wears the repair intake form's SKELETON, not a sheet
   *
   * Operator 2026-09-15: *"in terms of the cart component, it should be very
   * similar to the repair service intake form with the stepper on top and its
   * full width and then a fixed width in the middle. Why are you fixing width
   * for the entire display? … There should be no reason why you're wrapping
   * the cart form and then having another background for it. There should just
   * be a white background."*
   *
   * So there is NO `KIOSK_UTILITY_SHEET` here and no second plane behind it.
   * The cart is the centre surface itself: white, full-bleed, exactly like
   * `KioskRepairPane`. {@link KioskPaneForm} is the shared skeleton and it owns
   * the split the operator is describing — the step band goes edge to edge, the
   * BODY gets `KIOSK_POS_FORM_MEASURE`. A bounded card would fix the width of
   * the chrome too, which is what made the last build read as a popover.
   *
   * The band is also the ONLY band. Operator 2026-09-14, rejecting the titled
   * build: *"displaying without the header and then the X button top left to
   * close the cart and displaying a stepper on the top for the exact steps
   * within the cart for the user to take."* No "Cart" title, no close control
   * on the right; the X that exits is StepProgressHeader's, top-LEFT.
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
          <>
            {step === 0 ? (
              session.lines.length > 0 && (
                // Delete-all, re-homed off the dead title band onto the step it
                // belongs to. Two-tap confirm — a stray touch on a counter
                // tablet must not wipe a ticket, and a modal over the work is
                // not the house shape.
                <Button
                  variant="ghost"
                  size="lg"
                  className={cn('shrink-0', confirmVoid && 'text-text-danger')}
                  data-testid="kiosk-cart-void-all"
                  onClick={() => {
                    if (!confirmVoid) {
                      setConfirmVoid(true);
                      return;
                    }
                    actions.clearCart();
                    setConfirmVoid(false);
                    setEditingLineId(null);
                  }}
                  onBlur={() => setConfirmVoid(false)}
                >
                  {confirmVoid ? 'Void ticket?' : 'Void'}
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
               * never takes money off, it just prints out a receipt."* Same for
               * a pure trade-in, where the money moves the other way. ONE key:
               * check the visit in, and the next face prints.
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
        }
      >
        <div data-kiosk-cart-step={step}>
          {/* ONE bold display header per step, top-left — the repair flow's
              principle, not a second band. The quiet meta line under it keeps
              the two facts the dead title band carried (line count, running
              total) without competing with the header. */}
          <h2 className="px-4 pt-5 text-left text-role-display font-bold text-text-default">
            {KIOSK_CART_STEPS[step]}
          </h2>
          <p className={cn('px-4 pb-3 pt-1', KIOSK_META)} data-testid="kiosk-cart-summary">
            {session.lines.length} {session.lines.length === 1 ? 'line' : 'lines'} ·{' '}
            <span className="tabular-nums">{formatCents(money.totalCents)}</span>
          </p>

          {step === 0 && (
            /*
              The cart LINE LIST is a stack of TOUCH CARDS, not the desk compound
              table it used to mount (operator 2026-09-14: the full-width row grid
              "is a wrong display… should display a mobile-like chip display
              component"). `SURFACE_LAW` §5 is the law: lists on a phone-shaped
              surface are cards; a DataTable is never the phone SoT. Facts ride
              KioskChip pills inside the card; the card is the edit affordance;
              void stays the swipe verb. The FRAME owns scrolling — this list
              must not grow its own overflow region.
            */
            <div
              role="list"
              aria-label="Cart lines"
              className="flex w-full flex-col gap-2 px-3 pb-4"
            >
              {session.lines.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-semibold text-text-soft">
                  Scan a UPC or pick from the catalog.
                </p>
              ) : (
                session.lines.map((line) => (
                  <div role="listitem" key={line.id}>
                    <KioskCartSwipeRow
                      canVoid={session.sharedSessionId === null}
                      onEdit={() => {
                        actions.setPresentation({ lineId: line.id, catalog: null });
                        setEditingLineId(line.id);
                      }}
                      onVoid={() => actions.removeLine(line.id)}
                    >
                      <KioskCartLineCard
                        line={line}
                        open={editingLineId === line.id}
                        onOpen={() => {
                          actions.setPresentation({ lineId: line.id, catalog: null });
                          setEditingLineId((prev) => (prev === line.id ? null : line.id));
                        }}
                      />
                      {editingLineId === line.id && (
                        <KioskCartLineEditor
                          line={line}
                          focusField={editFocusField ?? undefined}
                          onDone={() => setEditingLineId(null)}
                        />
                      )}
                    </KioskCartSwipeRow>
                  </div>
                ))
              )}
            </div>
          )}

          {step === 1 && (
            <KioskCustomerIntake
              entry
              fields={['phone', 'name', 'email', 'address']}
              heading={null}
              className="bg-surface-card pb-4"
            />
          )}

          {step === LAST_STEP && (
            <div className="px-4 pb-6">
              {/*
                TWO facts, not one total, because a walk-in settles in two
                moments: goods at the counter, a service quote when the device
                is collected (operator 2026-09-15 — a drop-off "never takes
                money off, it just prints out a receipt"). Still ONE staged
                header; `cartMoneySplit` is display + key selection, never a
                wire field. The pickup row is omitted when there is no service,
                and the goods row when there are no goods: a $0.00 line an
                operator has to read past is noise.
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
