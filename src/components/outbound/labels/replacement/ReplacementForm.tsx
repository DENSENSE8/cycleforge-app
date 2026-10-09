'use client';

/**
 * The label-buy form's body (inside `OrderLabelBuyDialog`): every part built
 * once, then slotted into the desk face (details left, the buy right) or the
 * phone stepper — see `LabelBuyLayout`. An edit after a quote marks it stale
 * (`signature` vs `quotedFor`): the verb becomes Refresh rates, and nothing
 * buys a stale quote. `outbound` is the order's first label: no reason, no
 * stub merge.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orderPriceBreakdownKey, useOrderPriceBreakdown } from '@/components/outbound/orders/order-labels-client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/_ui';
import { formatMoney } from '@/lib/shipping/label-rate-choice';
import { orderLabelSummaryKey, useOrderLabelSummary } from '@/lib/orders/order-paperwork-client';
import { useRefreshSignal } from '@/lib/refresh/bus';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { REPLACEMENT_REASONS, shopRates, type ReplacementReason } from '@/lib/shipping/replacement-rate-shop';
import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';
import { LabelBuyConfirm } from './LabelBuyConfirm';
import { LabelBuyStepFooter } from './LabelBuyStepFooter';
import { ReplacementBoughtCard, type ReplacementPurchase } from './ReplacementBoughtCard';
import { ReplacementInsuranceFields } from './ReplacementInsuranceFields';
import { ReplacementOrderFacts } from './ReplacementOrderFacts';
import { ReplacementParcelRow } from './ReplacementParcelRow';
import { LabelBuyFace } from './LabelBuyLayout';
import { LabelBuyRateStep, useRateShop } from './LabelBuyRateStep';
import { ReplacementReasonFields } from './ReplacementReasonFields';
import { StubMergePanel, orderDuplicatesKey } from './StubMergePanel';
import { LABEL_BUY_STEPS, enterMovesOn, labelBuyFooter, type LabelBuyStepId } from './label-buy-steps';
import { useLabelBuyParcel } from './use-label-buy-parcel';
import {
  fetchReplacementRates,
  purchaseReplacementLabel,
  rememberCarrier,
  rememberedCarriers,
  type ReplacementRatesRequest,
  type ReplacementRatesResponse,
} from './replacement-label-client';

/** The currency a declared value is sent in — the order's price read-out carries USD amounts. */
const DECLARED_CURRENCY = 'USD';

/** What this form buys: the order's first label, or a shipped order's replacement. */
export type LabelBuyPurpose = 'outbound' | 'replacement';

export function ReplacementForm({
  purpose,
  orderId,
  orderNumber,
  currentTracking,
  onChange,
  onDone,
}: {
  purpose: LabelBuyPurpose;
  orderId: number;
  orderNumber: string | null;
  currentTracking: string | null;
  onChange: () => void;
  /** The Done step's verb — the host closes the form. */
  onDone: () => void;
}) {
  const orderRef = orderNumber ?? `order ${orderId}`;
  const isReplacement = purpose === 'replacement';
  const noun = isReplacement ? 'replacement label' : 'label';
  const queryClient = useQueryClient();
  const staffId = useAuth().user?.staffId ?? null;
  const summary = useOrderLabelSummary(orderId);
  const price = useOrderPriceBreakdown(orderId);

  // The ship-to editor saves through the order's buyer route, which signals
  // `orders.outbound` — the label summary (and its ship-to) re-reads.
  useRefreshSignal('orders.outbound', () => {
    void queryClient.invalidateQueries({ queryKey: orderLabelSummaryKey(orderId) });
  });

  const p = useLabelBuyParcel(
    summary.data?.parcel,
    price.data ? (price.data.orderTotal ?? price.data.amountPaid ?? price.data.saleAmount ?? null) : undefined,
  );

  const [step, setStep] = useState<LabelBuyStepId>('shipTo');
  const [reason, setReason] = useState<ReplacementReason | null>(null);
  const [note, setNote] = useState('');
  const shop = useRateShop();
  const [quotedFor, setQuotedFor] = useState<string | null>(null);
  const [bought, setBought] = useState<ReplacementPurchase | null>(null);

  // One idempotency key per INTENDED purchase, reused on retry; a void starts a new one.
  const clientEventIdRef = useRef('');

  const shipTo = summary.data?.shipTo ?? null;
  // Everything the quote depends on — an edit after quoting marks the rates stale.
  const signature = JSON.stringify({ parcel: p.parcel, insured: p.insuredValue, shipTo });

  const ratesMutation = useMutation<ReplacementRatesResponse, Error, ReplacementRatesRequest>({
    mutationFn: ({ body }) => fetchReplacementRates(body),
    onSuccess: (data, request) => {
      setQuotedFor(request.signature);
      shop.setSelectedRateId(null);
      shop.setCarriers(rememberedCarriers(staffId, data.rates ?? []));
      setStep('rate');
    },
    // A failed refresh on Rate leaves no quote to shop — the error and Try again live on Parcel.
    onError: () => setStep('parcel'),
  });

  const getRates = () => {
    if (p.missing || !p.complete) return;
    const { weightOz, length, width, height } = p.complete;
    ratesMutation.mutate({
      signature,
      body: {
        orderId,
        purpose,
        weightOz,
        dimensions: { length, width, height, unit: 'inch' },
        ...(p.insuredValue != null ? { insuredValue: { amount: p.insuredValue, currency: DECLARED_CURRENCY } } : {}),
      },
    });
  };

  const refreshOrder = () => {
    void queryClient.invalidateQueries({ queryKey: orderLabelSummaryKey(orderId) });
    void queryClient.invalidateQueries({ queryKey: orderPriceBreakdownKey(orderId) });
    void queryClient.invalidateQueries({ queryKey: orderDuplicatesKey(orderId) });
    onChange();
  };

  const buyMutation = useMutation<ReplacementPurchase, Error, ShippingRateOption>({
    mutationFn: (rate) => {
      if (!clientEventIdRef.current) clientEventIdRef.current = safeRandomUUID();
      return purchaseReplacementLabel({ orderId, purpose, rateId: rate.rateId, clientEventId: clientEventIdRef.current, reason, note });
    },
    onSuccess: (data, rate) => {
      setBought(data);
      setStep('done');
      rememberCarrier(staffId, rate);
      refreshOrder();
    },
  });

  const onVoided = () => {
    clientEventIdRef.current = '';
    setBought(null);
    shop.setSelectedRateId(null);
    setQuotedFor(null);
    ratesMutation.reset();
    buyMutation.reset();
    setStep('parcel');
    refreshOrder();
  };

  const allRates = ratesMutation.data?.rates ?? [];
  const visibleRates = shopRates(allRates, shop);
  const selectedRate = visibleRates.find((rate) => rate.rateId === shop.selectedRateId) ?? null;
  const hasQuote = ratesMutation.isSuccess;
  const stale = hasQuote && quotedFor !== signature;
  const reasonLabel = REPLACEMENT_REASONS.find((r) => r.id === reason)?.label ?? null;
  const isPhone = useIsMobile();
  // The desk shows every detail at once, so its step is where the buy stands.
  const deskStep: LabelBuyStepId = bought ? 'done' : step === 'confirm' ? 'confirm' : hasQuote ? 'rate' : 'parcel';
  const activeStep = isPhone ? step : deskStep;

  /** Back / a done progress segment: a buy in flight or landed pins the form forward. */
  const locked = bought != null || buyMutation.isPending;
  const goTo = (target: LabelBuyStepId) => {
    if (locked) return;
    if (step === 'confirm') buyMutation.reset();
    setStep(target);
  };

  const shipToBlock = !summary.data
    ? summary.isError
      ? summary.error.message
      : 'Loading the order…'
    : shipTo == null
      ? 'Add the ship-to address'
      : isReplacement && reason == null
        ? 'Pick a reason'
        : null;

  const footer = labelBuyFooter({
    step: activeStep,
    noun,
    shipToBlock,
    // The desk has no Ship to step: its address (and a replacement's reason) gate the quote instead.
    parcelMissing: isPhone ? p.missing : (shipToBlock ?? p.missing),
    quoted: hasQuote,
    stale,
    quoting: ratesMutation.isPending,
    quoteError: ratesMutation.isError ? ratesMutation.error.message : null,
    selectedRate,
    buying: buyMutation.isPending,
    buyError: buyMutation.isError ? buyMutation.error.message : null,
    go: setStep,
    getRates,
    buy: (rate) => buyMutation.mutate(rate),
    done: onDone,
  });
  const back = locked
    ? undefined
    : isPhone
      ? step === 'shipTo' || step === 'done'
        ? undefined
        : () => goTo(LABEL_BUY_STEPS[LABEL_BUY_STEPS.findIndex((s) => s.id === step) - 1].id)
      : deskStep === 'confirm'
        ? () => goTo('rate')
        : undefined;
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!enterMovesOn(event, activeStep) || footer.verb.disabled || footer.verb.loading) return;
    event.preventDefault();
    footer.verb.onClick();
  };

  return (
    <LabelBuyFace
      phone={isPhone}
      step={activeStep}
      onStepPress={locked ? undefined : goTo}
      onKeyDown={onKeyDown}
      parts={{
        facts: (
          <>
            {isReplacement ? <ReplacementReasonFields reason={reason} onReasonChange={setReason} note={note} onNoteChange={setNote} /> : null}
            <ReplacementOrderFacts orderId={orderId} labels={summary.data?.labels ?? []} currentTracking={currentTracking} shipTo={shipTo} />
          </>
        ),
        parcel: (
          <div className="flex flex-col gap-4" data-label-buy-parcel>
            <ReplacementParcelRow draft={p.draft} weightOz={p.parcel.weightOz} onChange={p.setField} />
            <ReplacementInsuranceFields
              insure={p.insure}
              onInsureChange={p.setInsure}
              declared={p.declared}
              onDeclaredChange={p.setDeclared}
              currency={DECLARED_CURRENCY}
            />
          </div>
        ),
        stubMerge: isReplacement ? <StubMergePanel orderId={orderId} enabled onMerged={refreshOrder} /> : null,
        rates: (
          <LabelBuyRateStep
            shop={shop}
            rates={allRates}
            visibleRates={visibleRates}
            invalidCount={ratesMutation.data?.invalidRates?.length ?? 0}
            insured={p.insure}
            disabled={buyMutation.isPending}
          />
        ),
        confirm:
          selectedRate && p.complete ? (
            <LabelBuyConfirm
              rate={selectedRate}
              noun={noun}
              orderRef={orderRef}
              parcel={p.complete}
              insuredValue={p.insuredValue != null ? formatMoney(p.insuredValue, DECLARED_CURRENCY) : null}
              shipTo={shipTo}
              reasonLabel={isReplacement ? reasonLabel : null}
              note={note}
            />
          ) : null,
        bought: bought ? (
          <ReplacementBoughtCard
            orderId={orderId}
            orderNumber={orderNumber ?? String(orderId)}
            bought={bought}
            buyerName={shipTo?.name ?? null}
            replacement={isReplacement}
            reason={reason}
            onVoided={onVoided}
          />
        ) : null,
        quoting: ratesMutation.isPending,
        orderRef,
      }}
      footer={
        <LabelBuyStepFooter
          onBack={back}
          hint={footer.hint}
          hintTestId={activeStep === 'parcel' ? 'send-replacement-rates-hint' : undefined}
          tone={footer.warning ? 'warning' : 'quiet'}
          error={footer.error}
          verb={footer.verb}
        />
      }
    />
  );
}
