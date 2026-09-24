'use client';

/**
 * Persistent right cart ledger — session root for `/kiosk/v2`.
 *
 * Always mounted (even empty). Staff face shows void + Save + Pay.
 * Customer face strips destructive actions (see KioskCustomerFace); the face
 * flips on tablet orientation (or Esc back), never a manual Customer button.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { KioskPaneForm } from '@/components/kiosk/KioskPaneForm';
import { KioskCartDoneFace } from './KioskCartDoneFace';
import { KioskCustomerIntake } from '@/components/kiosk/KioskCustomerIntake';
import { KioskCartLineEditor } from '@/components/kiosk/KioskCartLineEditor';
import { KioskCartSwipeRow } from '@/components/kiosk/KioskCartSwipeRow';
import { KioskCartLineCard } from '@/components/kiosk/KioskCartLineCard';
import { KioskChip } from '@/components/kiosk/KioskChip';
import {
  KioskPriceApprovalSheet,
  type KioskPriceApproval,
  type KioskPriceApprovalRequest,
} from '@/components/kiosk/KioskPriceApprovalSheet';
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
import { cartMoneySplit } from '@/lib/kiosk/cart-money';
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
  const itemCount = useMemo(
    () =>
      session.lines.reduce(
        (sum, line) => sum + (Number.isFinite(line.quantity) ? Math.max(0, Math.trunc(line.quantity)) : 0),
        0,
      ),
    [session.lines],
  );

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
          voidedLines: session.voidedLines,
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
   * REMOVE vs VOID (Square's comp & void). A line the customer never saw goes
   * quietly, as it always has. A line that has been on the customer's screen
   * is evidence: it leaves only with a reason and a `walk_in.adjust_price`
   * PIN, and the approval route audits it. The reason floor swaps into the
   * footer (no modal over the work); the PIN is the usual step-up sheet.
   */
  const [voidTarget, setVoidTarget] = useState<{ ids: string[]; clearAll: boolean } | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidRequest, setVoidRequest] = useState<KioskPriceApprovalRequest | null>(null);
  const seenIds = useMemo(() => new Set(session.customerSeenLineIds), [session.customerSeenLineIds]);
  const voidSeen = voidTarget ? voidTarget.ids.filter((id) => seenIds.has(id)) : [];

  const finishRemoval = (ids: readonly string[], clearAll: boolean) => {
    if (clearAll) actions.clearCart();
    else for (const id of ids) actions.removeLine(id);
    setEditingLineId((prev) => (prev && ids.includes(prev) ? null : prev));
    setConfirmVoid(false);
  };

  const removeOrVoid = (ids: string[], clearAll = false) => {
    if (!ids.some((id) => seenIds.has(id))) {
      finishRemoval(ids, clearAll);
      return;
    }
    setVoidReason('');
    setVoidTarget({ ids, clearAll });
  };

  const onVoidApproved = (approved: KioskPriceApproval) => {
    if (!voidTarget || !voidRequest) return;
    actions.voidLines(voidSeen, {
      reason: voidRequest.reason,
      staffId: approved.staffId,
      staffName: approved.staffName,
      approval: approved.approval,
    });
    finishRemoval(
      voidTarget.ids.filter((id) => !seenIds.has(id)),
      voidTarget.clearAll,
    );
    setVoidRequest(null);
    setVoidTarget(null);
  };

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
          step === 0 && voidTarget ? (
            /*
             * The VOID floor: why, then the PIN. Same footer-swap shape as
             * the Clear-cart confirm below.
             */
            <>
              <div className="flex w-full flex-wrap justify-center gap-2" data-testid="kiosk-cart-void-reasons">
                {session.lineReasons.void.map((reason) => (
                  <KioskChip
                    key={reason}
                    tone={voidReason === reason ? 'accent' : 'idle'}
                    selected={voidReason === reason}
                    onClick={() => setVoidReason(reason)}
                    className="min-h-11 px-4"
                  >
                    {reason}
                  </KioskChip>
                ))}
              </div>
              <Button
                variant="secondary"
                size="lg"
                className={KIOSK_POS_CTA_SECONDARY}
                data-testid="kiosk-cart-void-keep"
                onClick={() => {
                  setVoidTarget(null);
                  setConfirmVoid(false);
                }}
              >
                Keep
              </Button>
              <Button
                variant="danger"
                size="lg"
                className={KIOSK_POS_CTA}
                disabled={!voidReason}
                data-testid="kiosk-cart-void-authorize"
                onClick={() =>
                  setVoidRequest({
                    kind: 'void',
                    fromCents: null,
                    toCents: 0,
                    reason: voidReason,
                    lines: session.lines
                      .filter((l) => voidSeen.includes(l.id))
                      .map((l) => ({
                        title: l.title,
                        quantity: l.quantity,
                        unitAmountCents: l.unitAmountCents,
                      })),
                  })
                }
              >
                {voidSeen.length === 1 ? 'Void 1 item' : `Void ${voidSeen.length} items`}
              </Button>
            </>
          ) : step === 0 && confirmVoid && session.lines.length > 0 ? (
            /*
             * CONFIRM, in place (operator 2026-09-23: "the clear cart button
             * should have a confirmation button to clear all the cart items").
             * The floor swaps to the question and its two answers — a modal
             * over the work is not the house shape, and a relabelled button in
             * the same spot was too easy to double-tap straight through.
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
                onClick={() => removeOrVoid(session.lines.map((l) => l.id), true)}
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
          )
        }
      >
        <div data-kiosk-cart-step={step}>
          {/* ONE bold display header per step, top-left — the repair flow's
              principle, not a second band — with the running total on the
              SAME row at the right edge (operator 2026-09-23), the list rule
              for money: right-aligned, in the money token. `qty · total`, no
              "items" word: a line of two cables counts as two. Only the money
              is green; the count is black (operator 2026-09-24). */}
          <div className="flex items-baseline justify-between gap-4 px-4 pb-3 pt-5">
            <h2 className="min-w-0 truncate text-left text-role-display font-bold text-text-default">
              {KIOSK_CART_STEPS[step]}
            </h2>
            <p
              className="shrink-0 text-role-title font-semibold tabular-nums"
              data-testid="kiosk-cart-summary"
            >
              <span className="text-text-default">{itemCount} ·</span>{' '}
              <span className="text-text-success">{formatCents(money.totalCents)}</span>
            </p>
          </div>

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
              aria-label="Cart items"
              className="flex w-full flex-col gap-2 px-3 pb-4"
            >
              {session.lines.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm font-semibold text-text-soft">
                  Cart is empty. Scan a barcode or tap an item in the catalog.
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
                      onVoid={() => removeOrVoid([line.id])}
                    >
                      <KioskCartLineCard
                        line={line}
                        open={editingLineId === line.id}
                        onOpen={() => {
                          actions.setPresentation({ lineId: line.id, catalog: null });
                          setEditingLineId((prev) => (prev === line.id ? null : line.id));
                        }}
                        // On a mirror `updateLine` writes through the desk's
                        // session; a remove there is a staff void, so none.
                        onQuantityChange={(quantity) => actions.updateLine(line.id, { quantity })}
                        onRemove={
                          session.sharedSessionId === null
                            ? () => removeOrVoid([line.id])
                            : undefined
                        }
                      />
                      {editingLineId === line.id && (
                        <KioskCartLineEditor
                          line={line}
                          onDone={() => setEditingLineId(null)}
                          onRemove={() => removeOrVoid([line.id])}
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
              onSubmit={() => {
                if (stepCanContinue) setStep(2);
              }}
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

      <KioskPriceApprovalSheet
        request={voidRequest}
        onClose={() => setVoidRequest(null)}
        onApproved={onVoidApproved}
      />
    </div>
  );
}
