'use client';

/**
 * **OrderShippingPanel** — the ONE shipping component (operator ruling
 * R-FLOW-6, 2026-09-01: shipping is a COMPONENT, not a page, and it is never
 * scoped to exceptions).
 *
 * Two hosts import this same file:
 *  (a) the order-intake editor's Shipping (G3) card (`OrderIntakeForm.tsx`),
 *  (b) the To-ship queue's inline label band (`LabelRunBand`), expanded
 *      beneath the active row of the one data table.
 *
 * The exceptions desk does **not** host this panel (R-FLOW-7, 2026-09-01):
 * that form pairs the item number to the Zoho catalog SKU only.
 *
 * It COMPOSES what already exists — nothing here is a second engine:
 *  - tracking / label-state readout from the order's live gate facts
 *    (`orderReleaseGatesQuery`; tracking renders as the house `TrackingChip`);
 *  - parcel weight-oz + L×W×H persisting via
 *    `POST /api/orders/[id]/cage-release {action:'set-parcel'}` (the one
 *    parcel write path, `setOrderParcel`);
 *  - `BuyLabelSection` (ShipStation rate-shop → buy → void), fed the parcel
 *    from these fields;
 *  - the upload/attach tray (`OrderDocumentsSection` with `readOnly={false}`
 *    — browser→NAS PUT + attach-by-URL; the tray states its own hard failure
 *    when the org has no `nasBaseUrl`).
 *
 * Discipline (the `useOrderTriage` law): after EVERY write the panel re-reads
 * the server facts and calls `onFactsChanged` — it never patches a gate fact
 * locally. No exception / gate / release logic lives here; the cage belongs
 * to the triage form.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2 } from '@/components/Icons';
import { BuyLabelSection } from '@/components/outbound/labels/BuyLabelSection';
import { OrderDocumentsSection } from '@/components/shipped/OrderDocumentsSection';
import { TrackingChip } from '@/components/ui/CopyChip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/design-system/primitives';
import { orderReleaseGatesQuery } from '@/lib/queries/caged-orders-queries';
import { toast } from '@/lib/toast';

function parsePositive(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const numToText = (v: number | null | undefined) => (v == null ? '' : String(v));

export interface OrderShippingPanelProps {
  orderId: number;
  /** Human order number for rate-shop copy + NAS filenames. */
  orderRef: string;
  /**
   * Called after EVERY write (parcel save, buy, void, upload, delete, fetch)
   * — the host refreshes whatever caches it owns. The panel itself re-reads
   * the server facts on the same tick; it never patches them locally.
   */
  onFactsChanged: () => void;
  /**
   * A label purchase succeeded (buy only — a void does not fire this). The
   * To-ship label band advances the run on it; the intake card omits it.
   */
  onLabelPurchased?: () => void;
  /**
   * Prefix for the field test ids (`${prefix}-weight`, `${prefix}-dim-l`, …).
   * The intake host passes `intake` so its locked locators keep resolving.
   */
  testIdPrefix?: string;
  /**
   * Render the upload / attach tray. Default true. The To-ship paperwork walk
   * passes false: it shows the order's documents inline above this panel.
   */
  showDocuments?: boolean;
  className?: string;
}

export function OrderShippingPanel({
  orderId,
  orderRef,
  onFactsChanged,
  onLabelPurchased,
  testIdPrefix = 'shipping-panel',
  showDocuments = true,
  className,
}: OrderShippingPanelProps) {
  const fieldId = useId();
  const gatesQuery = useQuery(orderReleaseGatesQuery(orderId));
  const record = gatesQuery.data ?? null;

  const refetchGates = gatesQuery.refetch;
  const handleFactsChanged = useCallback(() => {
    void refetchGates();
    onFactsChanged();
  }, [refetchGates, onFactsChanged]);

  /* ── Parcel fields (commit on blur/Enter → set-parcel) ─────────────── */
  const [weightText, setWeightText] = useState('');
  const [dimLText, setDimLText] = useState('');
  const [dimWText, setDimWText] = useState('');
  const [dimHText, setDimHText] = useState('');

  // Seed once per order from the stored parcel (the SoT the rate-shop
  // reads), and never clobber digits the operator has already typed — the
  // same mid-type guard the intake form carries.
  const parcelSyncedForId = useRef<number | null>(null);
  const parcelTouched = useRef(false);
  useEffect(() => {
    if (!record?.id || parcelSyncedForId.current === record.id) return;
    parcelSyncedForId.current = record.id;
    if (parcelTouched.current) return;
    setWeightText(numToText(record.parcelWeightOz));
    setDimLText(numToText(record.parcelLengthIn));
    setDimWText(numToText(record.parcelWidthIn));
    setDimHText(numToText(record.parcelHeightIn));
  }, [record]);
  const touch = useCallback(
    (set: (value: string) => void) => (value: string) => {
      parcelTouched.current = true;
      set(value);
    },
    [],
  );

  const parcelMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/orders/${orderId}/cage-release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'set-parcel',
          weightOz: parsePositive(weightText),
          lengthIn: parsePositive(dimLText),
          widthIn: parsePositive(dimWText),
          heightIn: parsePositive(dimHText),
        }),
      });
      const data = (await res.json().catch(() => ({ success: false }))) as {
        success?: boolean;
        error?: string;
      };
      if (!data.success) throw new Error(data.error || 'Could not save the parcel.');
      return data;
    },
    onSuccess: handleFactsChanged,
    onError: (error: Error) => toast.error(error.message),
  });
  const commitParcel = useCallback(() => {
    if (!parcelTouched.current) return; // nothing typed — no write to make
    parcelMutation.mutate();
  }, [parcelMutation]);

  /* ── Buy inputs — live fields first, stored parcel as the fallback ──── */
  const currentWeightOz = parsePositive(weightText) ?? record?.parcelWeightOz ?? null;
  const dimL = parsePositive(dimLText) ?? record?.parcelLengthIn ?? null;
  const dimW = parsePositive(dimWText) ?? record?.parcelWidthIn ?? null;
  const dimH = parsePositive(dimHText) ?? record?.parcelHeightIn ?? null;
  const currentDims =
    dimL != null && dimW != null && dimH != null
      ? { length: dimL, width: dimW, height: dimH, unit: 'inch' as const }
      : null;

  /** Named reason ShipStation cannot buy right now (`null` = none known). */
  const [shipstationDown, setShipstationDown] = useState<string | null>(null);
  const handleRatesError = useCallback((info: { code: string | null; message: string }) => {
    if (info.code === 'SHIPSTATION_NOT_CONNECTED') {
      setShipstationDown(
        'ShipStation is not connected — connect it in Settings → Integrations, or attach an existing label instead.',
      );
    } else if (info.code === 'SHIP_FROM_NOT_CONFIGURED') {
      setShipstationDown(
        'No warehouse ship-from address is set for this organization, so carriers cannot rate the parcel. Ask an admin to set the organization ship-from address (or the SHIPSTATION_SHIP_FROM_* env vars), or attach an existing label instead.',
      );
    }
  }, []);

  // A ShipStation-sourced order carries its own weight on the ShipStation
  // order; `POST /api/shipping/order-rates` falls back to it, so the panel
  // must not refuse to rate just because no local weight was typed.
  const shipstationSourced = record?.accountSource === 'shipstation';

  const stateLine = record?.shippingLabelPurchased
    ? 'Label bought through the existing label path.'
    : record?.shippingLabelLinked
      ? 'Label linked to this order.'
      : 'No shipping label on this order yet.';

  return (
    <div className={className} data-testid={`${testIdPrefix}-shipping-panel`}>
      <div className="space-y-4">
        {/* ── Tracking / label state readout (server facts, never a guess) ── */}
        <div className="flex flex-wrap items-center gap-2">
          {gatesQuery.isLoading && !record ? (
            <p className="flex items-center gap-1.5 text-role-caption text-text-soft">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Reading shipping facts…
            </p>
          ) : (
            <p className="min-w-0 text-role-caption text-text-soft" role="status">
              {stateLine}
            </p>
          )}
          {record?.trackingNumber ? <TrackingChip value={record.trackingNumber} /> : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-my-1 ml-auto"
            onClick={handleFactsChanged}
          >
            Re-check
          </Button>
        </div>

        {/* ── Parcel — persists on the order and rides the rate request ──── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ParcelField
            id={`${fieldId}-weight`}
            label="Weight oz"
            value={weightText}
            onChange={touch(setWeightText)}
            onCommit={commitParcel}
            testId={`${testIdPrefix}-weight`}
          />
          <ParcelField
            id={`${fieldId}-dim-l`}
            label="L in"
            value={dimLText}
            onChange={touch(setDimLText)}
            onCommit={commitParcel}
            testId={`${testIdPrefix}-dim-l`}
          />
          <ParcelField
            id={`${fieldId}-dim-w`}
            label="W in"
            value={dimWText}
            onChange={touch(setDimWText)}
            onCommit={commitParcel}
            testId={`${testIdPrefix}-dim-w`}
          />
          <ParcelField
            id={`${fieldId}-dim-h`}
            label="H in"
            value={dimHText}
            onChange={touch(setDimHText)}
            onCommit={commitParcel}
            testId={`${testIdPrefix}-dim-h`}
          />
        </div>
        {parcelMutation.isPending ? (
          <p className="text-role-micro text-text-faint">Saving parcel…</p>
        ) : null}

        {/* ── Rate-shop → buy → void (the existing engine, composed) ─────── */}
        {shipstationDown ? (
          <p className="text-role-caption text-text-warning" role="status">
            {shipstationDown}
          </p>
        ) : null}
        {currentWeightOz == null && !shipstationSourced ? (
          <p className="text-role-caption text-text-warning" role="status">
            Add a parcel weight — carriers cannot rate a 0 oz parcel.
          </p>
        ) : (
          <div
            className="border border-border-hairline p-3"
            data-testid={`${testIdPrefix}-label-buy`}
          >
            {currentWeightOz == null ? (
              <p className="mb-2 text-role-caption text-text-soft" role="status">
                No weight entered — rates use the weight on the ShipStation order.
              </p>
            ) : null}
            <BuyLabelSection
              orderId={orderId}
              orderRef={orderRef}
              flush
              weightOz={currentWeightOz}
              dimensions={currentDims}
              onChange={handleFactsChanged}
              onPurchased={onLabelPurchased}
              onRatesError={handleRatesError}
            />
          </div>
        )}

        {/* ── Upload / attach tray (browser→NAS PUT + attach-by-URL) ─────── */}
        {showDocuments ? (
          <div className="border border-border-hairline">
            <OrderDocumentsSection
              orderId={orderId}
              orderRef={orderRef}
              readOnly={false}
              flush
              showBuySection={false}
              onChanged={handleFactsChanged}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Labeled numeric parcel cell (commit on blur/Enter) — intake parity. */
function ParcelField({
  id,
  label,
  value,
  onChange,
  onCommit,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        data-testid={testId}
      />
    </div>
  );
}
