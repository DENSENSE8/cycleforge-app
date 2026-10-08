'use client';

/**
 * The replacement form's body (inside {@link SendReplacementPopover}): what it
 * ships against + why, then the pinned parcel / insurance / filter band, the
 * one scroll area (rates, or the bought label, then the stub-merge offer), and
 * the sticky Buy footer.
 */

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orderPriceBreakdownKey, useOrderPriceBreakdown } from '@/components/outbound/orders/order-labels-client';
import { useAuth } from '@/contexts/AuthContext';
import { Button, ScrollPane, Spinner } from '@/design-system/primitives';
import { orderLabelSummaryKey, useOrderLabelSummary } from '@/lib/orders/order-paperwork-client';
import { useRefreshSignal } from '@/lib/refresh/bus';
import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  REPLACEMENT_REASONS,
  carrierFacets,
  parcelComplete,
  shopRates,
  type CoverageFilter,
  type RateSort,
  type ReplacementReason,
} from '@/lib/shipping/replacement-rate-shop';
import type { ShippingRateOption } from '@/lib/shipping/shipstation/types';
import { ReplacementBoughtCard, type ReplacementPurchase } from './ReplacementBoughtCard';
import { ReplacementBuyFooter } from './ReplacementBuyFooter';
import { ReplacementOrderFacts } from './ReplacementOrderFacts';
import { ReplacementParcelRow, type ParcelDraft, type ParcelField } from './ReplacementParcelRow';
import { ReplacementQuoteBar } from './ReplacementQuoteBar';
import { ReplacementRateFilters, ReplacementRateRows } from './ReplacementRateTable';
import { ReplacementReasonFields } from './ReplacementReasonFields';
import { StubMergePanel, orderDuplicatesKey } from './StubMergePanel';
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

/** A typed amount, positive and finite, else null (empty, zero and junk all read "missing"). */
function positiveAmount(text: string): number | null {
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function ReplacementForm({
  orderId,
  orderNumber,
  currentTracking,
  onChange,
}: {
  orderId: number;
  orderNumber: string | null;
  currentTracking: string | null;
  onChange: () => void;
}) {
  const orderRef = orderNumber ?? `order ${orderId}`;
  const queryClient = useQueryClient();
  const staffId = useAuth().user?.staffId ?? null;
  const summary = useOrderLabelSummary(orderId);
  const price = useOrderPriceBreakdown(orderId);

  // The ship-to editor saves through the order's buyer route, which signals
  // `orders.outbound` — the label summary (and its ship-to) re-reads.
  useRefreshSignal('orders.outbound', () => {
    void queryClient.invalidateQueries({ queryKey: orderLabelSummaryKey(orderId) });
  });

  // Parcel: prefilled once from the stored parcel (order → SKU → item number); then it is the operator's scale and tape.
  const [draft, setDraft] = useState<ParcelDraft>({ weight: '', length: '', width: '', height: '' });
  const parcelSeeded = useRef(false);
  useEffect(() => {
    if (!summary.data || parcelSeeded.current) return;
    parcelSeeded.current = true;
    const stored = summary.data.parcel;
    setDraft({
      weight: stored.weightOz == null ? '' : String(stored.weightOz),
      length: stored.lengthIn == null ? '' : String(stored.lengthIn),
      width: stored.widthIn == null ? '' : String(stored.widthIn),
      height: stored.heightIn == null ? '' : String(stored.heightIn),
    });
  }, [summary.data]);

  // Insurance: the declared value defaults to the order total once it is known.
  const [insure, setInsure] = useState(false);
  const [declared, setDeclared] = useState('');
  const declaredSeeded = useRef(false);
  useEffect(() => {
    if (!price.data || declaredSeeded.current) return;
    declaredSeeded.current = true;
    const total = price.data.orderTotal ?? price.data.amountPaid ?? price.data.saleAmount;
    if (total != null && total > 0) setDeclared(String(total));
  }, [price.data]);

  const [reason, setReason] = useState<ReplacementReason | null>(null);
  const [note, setNote] = useState('');
  const [carriers, setCarriers] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<RateSort>('cheapest');
  const [coverage, setCoverage] = useState<CoverageFilter>('any');
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [quotedFor, setQuotedFor] = useState<string | null>(null);
  const [bought, setBought] = useState<ReplacementPurchase | null>(null);

  // One idempotency key per INTENDED purchase, reused on retry; a void starts a new one.
  const clientEventIdRef = useRef('');

  const parcel = {
    weightOz: positiveAmount(draft.weight),
    length: positiveAmount(draft.length),
    width: positiveAmount(draft.width),
    height: positiveAmount(draft.height),
  };
  const declaredValue = positiveAmount(declared);
  const dimsComplete = parcel.length != null && parcel.width != null && parcel.height != null;
  const missing = !parcelComplete(parcel)
    ? parcel.weightOz == null
      ? dimsComplete
        ? 'Enter the weight'
        : 'Enter weight and L × W × H'
      : 'Enter L × W × H'
    : insure && declaredValue == null
      ? 'Enter the declared value'
      : null;
  const shipTo = summary.data?.shipTo ?? null;
  // Everything the quote depends on — an edit after quoting marks the rates stale.
  const signature = JSON.stringify({ parcel, insured: insure ? declaredValue : null, shipTo });

  const ratesMutation = useMutation<ReplacementRatesResponse, Error, ReplacementRatesRequest>({
    mutationFn: ({ body }) => fetchReplacementRates(body),
    onSuccess: (data, request) => {
      setQuotedFor(request.signature);
      setSelectedRateId(null);
      setConfirming(false);
      setCarriers(rememberedCarriers(staffId, data.rates ?? []));
    },
  });

  const getRates = () => {
    const { weightOz, length, width, height } = parcel;
    if (missing || weightOz == null || length == null || width == null || height == null) return;
    ratesMutation.mutate({
      signature,
      body: {
        orderId,
        purpose: 'replacement',
        weightOz,
        dimensions: { length, width, height, unit: 'inch' },
        ...(insure && declaredValue != null ? { insuredValue: { amount: declaredValue, currency: DECLARED_CURRENCY } } : {}),
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
      return purchaseReplacementLabel({ orderId, rateId: rate.rateId, clientEventId: clientEventIdRef.current, reason, note });
    },
    onSuccess: (data, rate) => {
      setBought(data);
      setConfirming(false);
      rememberCarrier(staffId, rate);
      refreshOrder();
    },
  });

  const onVoided = () => {
    clientEventIdRef.current = '';
    setBought(null);
    setSelectedRateId(null);
    setQuotedFor(null);
    ratesMutation.reset();
    buyMutation.reset();
    refreshOrder();
  };

  const allRates = ratesMutation.data?.rates ?? [];
  const visibleRates = shopRates(allRates, { carriers, sort, coverage });
  const selectedRate = visibleRates.find((rate) => rate.rateId === selectedRateId) ?? null;
  const hasQuote = ratesMutation.isSuccess;
  const stale = hasQuote && quotedFor !== signature;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* What it ships against + why — shrinks (and scrolls itself) while the ship-to editor is open. */}
      <div className="grid min-h-0 shrink grid-cols-1 gap-5 overflow-y-auto px-5 py-3 md:grid-cols-2">
        <ReplacementReasonFields reason={reason} onReasonChange={setReason} note={note} onNoteChange={setNote} />
        <ReplacementOrderFacts orderId={orderId} labels={summary.data?.labels ?? []} currentTracking={currentTracking} shipTo={shipTo} />
      </div>

      {/* Parcel + insurance + Get rates + filters — pinned. */}
      <div className="flex shrink-0 flex-col gap-3 border-t border-border-hairline px-5 py-3">
        <ReplacementParcelRow
          draft={draft}
          weightOz={parcel.weightOz}
          onChange={(field: ParcelField, value: string) => {
            setDraft((current) => ({ ...current, [field]: value }));
            setConfirming(false);
          }}
        />
        <ReplacementQuoteBar
          insure={insure}
          onInsureChange={setInsure}
          declared={declared}
          onDeclaredChange={setDeclared}
          currency={DECLARED_CURRENCY}
          missing={missing}
          stale={stale}
          quoted={hasQuote}
          loading={ratesMutation.isPending}
          disabled={buyMutation.isPending || bought != null}
          onGetRates={getRates}
        />
        {hasQuote && !bought && allRates.length > 0 ? (
          <ReplacementRateFilters
            facets={carrierFacets(allRates)}
            carriers={carriers}
            onCarriersChange={setCarriers}
            sort={sort}
            onSortChange={setSort}
            coverage={coverage}
            onCoverageChange={setCoverage}
          />
        ) : null}
      </div>

      {/* The only scroll area: the rate list (or the bought label), then the stub-merge offer. */}
      <ScrollPane className="flex min-h-48 flex-col gap-3 border-t border-border-hairline px-5 py-3">
        {bought ? (
          <ReplacementBoughtCard
            orderId={orderId}
            orderNumber={orderNumber ?? String(orderId)}
            bought={bought}
            buyerName={shipTo?.name ?? null}
            reason={reason}
            onVoided={onVoided}
          />
        ) : ratesMutation.isPending ? (
          <p className="flex items-center gap-2 py-3 text-role-caption text-text-soft">
            <Spinner size="sm" /> Fetching live rates…
          </p>
        ) : ratesMutation.isError ? (
          <div className="flex flex-col items-center gap-2 rounded-mode border border-dashed border-border-danger bg-surface-danger px-4 py-4">
            <p className="text-role-caption font-semibold text-text-danger" role="alert">{ratesMutation.error.message}</p>
            <Button variant="ghost" size="sm" disabled={missing != null} onClick={getRates}>
              Try again
            </Button>
          </div>
        ) : hasQuote ? (
          <ReplacementRateRows
            rates={visibleRates}
            returnedCount={allRates.length}
            invalidCount={ratesMutation.data?.invalidRates?.length ?? 0}
            selectedRateId={selectedRateId}
            onSelect={(rateId) => {
              setSelectedRateId(rateId);
              setConfirming(false);
            }}
            insured={insure}
            disabled={buyMutation.isPending}
          />
        ) : (
          <p className="py-3 text-role-caption text-text-faint">
            Live carrier rates for {orderRef} appear here once the parcel is complete.
          </p>
        )}
        <StubMergePanel orderId={orderId} enabled onMerged={refreshOrder} />
      </ScrollPane>

      {!bought && hasQuote && allRates.length > 0 ? (
        <ReplacementBuyFooter
          selectedRate={selectedRate}
          confirming={confirming}
          stale={stale}
          orderRef={orderRef}
          reasonLabel={REPLACEMENT_REASONS.find((r) => r.id === reason)?.label ?? null}
          buying={buyMutation.isPending}
          error={buyMutation.isError ? buyMutation.error.message : null}
          onConfirmOpen={() => setConfirming(true)}
          onCancel={() => setConfirming(false)}
          onBuy={(rate) => buyMutation.mutate(rate)}
        />
      ) : null}
    </div>
  );
}
