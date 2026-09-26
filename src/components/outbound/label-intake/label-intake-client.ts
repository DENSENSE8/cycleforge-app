'use client';

/**
 * Client half of the label intake (`src/lib/shipping/label-intake.ts`).
 *
 * One lookup per typed order number, then rates and purchases routed by the
 * anchor: a PAIRED order uses the order-bound routes (tracking, documents,
 * notes, buyer-note interlock), a REFERENCE-only number uses
 * `/api/shipping/label-intake/*` with the address typed on the intake.
 */

import { useQuery } from '@tanstack/react-query';
import { sendWithBuyerNoteAck } from '@/lib/orders/buyer-note-ack-client';
import type { LabelCreationType, LabelLedgerStatus, LabelPurpose } from '@/lib/shipping/label-purpose';
import type { ShipAddress, ShippingRateOption } from '@/lib/shipping/shipstation/types';

export type IntakePurpose = Extract<LabelPurpose, 'return' | 'replacement'>;

export interface IntakeOrder {
  id: number;
  orderRef: string;
  title: string | null;
  sku: string | null;
  quantity: number | null;
  platform: string | null;
  customerName: string | null;
}

export interface IntakeParcel {
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
}

export interface IntakeLabel {
  id: number;
  purpose: LabelPurpose;
  status: LabelLedgerStatus;
  creationType: LabelCreationType;
  trackingNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  cost: number | null;
  currency: string | null;
  at: string | null;
  actorName: string | null;
  paired: boolean;
  printable: boolean;
}

export interface IntakeLookup {
  ref: string;
  order: IntakeOrder | null;
  shipTo: ShipAddress | null;
  parcel: IntakeParcel | null;
  labels: IntakeLabel[];
  unpairedCount: number;
}

export interface IntakeRates {
  rates: ShippingRateOption[];
  invalidRates: Array<{ carrierCode?: string | null; serviceCode?: string | null; message: string }>;
}

export interface IntakePurchase {
  purchaseId: number | null;
  tracking: string | null;
  carrier: string | null;
  service: string | null;
  cost: number | null;
  currency: string | null;
  idempotent: boolean;
}

export const labelIntakeKey = (ref: string) => ['label-intake', ref] as const;

/** Same-origin PDF for any ledger row the intake lists. */
export function intakeLabelPdfSrc(rowId: number): string {
  return `/api/shipping/label-intake/labels/${rowId}/pdf`;
}

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string; message?: string };
  if (!res.ok || body.ok === false) throw new Error(body.error || body.message || fallback);
  return body;
}

export function useLabelIntake(ref: string) {
  return useQuery({
    queryKey: labelIntakeKey(ref),
    enabled: ref.length >= 2,
    staleTime: 15_000,
    queryFn: async () =>
      readJson<IntakeLookup>(
        await fetch(`/api/shipping/label-intake?ref=${encodeURIComponent(ref)}`),
        'Could not look up that order number.',
      ),
  });
}

export interface IntakeShipment {
  purpose: IntakePurpose;
  /** Paired order row id, or `null` for a reference-only number. */
  orderId: number | null;
  ref: string;
  shipTo: ShipAddress;
  weightOz: number;
  dimensions: { length: number; width: number; height: number; unit: 'inch' } | null;
}

function intakeParcelBody(s: IntakeShipment) {
  return { weight: { value: s.weightOz, unit: 'ounce' as const }, dimensions: s.dimensions };
}

export async function fetchIntakeRates(s: IntakeShipment): Promise<IntakeRates> {
  const res =
    s.orderId != null
      ? await fetch('/api/shipping/order-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: s.orderId,
            purpose: s.purpose,
            weightOz: s.weightOz,
            ...(s.dimensions ? { dimensions: s.dimensions } : {}),
          }),
        })
      : await fetch('/api/shipping/label-intake/rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purpose: s.purpose, shipTo: s.shipTo, parcel: intakeParcelBody(s) }),
        });
  const body = await readJson<{ rates?: ShippingRateOption[]; invalidRates?: IntakeRates['invalidRates'] }>(
    res,
    'Could not fetch rates.',
  );
  return { rates: body.rates ?? [], invalidRates: body.invalidRates ?? [] };
}

export async function purchaseIntakeLabel(
  s: IntakeShipment,
  rate: ShippingRateOption,
  clientEventId: string,
): Promise<IntakePurchase> {
  if (s.orderId != null) {
    const orderId = s.orderId;
    const res = await sendWithBuyerNoteAck(() =>
      fetch('/api/shipping/order-labels/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          rateId: rate.rateId,
          clientEventId,
          purpose: s.purpose,
          // The buyer hears about a parcel coming to them — never a return.
          notifyCustomer: s.purpose === 'replacement',
          ...(s.purpose === 'return'
            ? {
                carrierId: rate.carrierId,
                serviceCode: rate.serviceCode,
                weightOz: s.weightOz,
                ...(s.dimensions ? { dimensions: s.dimensions } : {}),
              }
            : {}),
        }),
      }),
    );
    const body = await readJson<{
      purchaseId?: number;
      tracking?: string;
      carrier?: string;
      service?: string;
      cost?: number;
      currency?: string;
      idempotent?: boolean;
    }>(res, 'Purchase failed.');
    return {
      purchaseId: body.purchaseId ?? null,
      tracking: body.tracking ?? null,
      carrier: body.carrier ?? null,
      service: body.service ?? null,
      cost: body.cost ?? null,
      currency: body.currency ?? null,
      idempotent: Boolean(body.idempotent),
    };
  }
  const res = await fetch('/api/shipping/label-intake/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ref: s.ref,
      purpose: s.purpose,
      rateId: rate.rateId,
      carrierId: rate.carrierId,
      serviceCode: rate.serviceCode,
      clientEventId,
      shipTo: s.shipTo,
      parcel: intakeParcelBody(s),
    }),
  });
  const body = await readJson<{
    purchaseId: number;
    tracking: string | null;
    carrier: string | null;
    service: string | null;
    cost: number | null;
    currency: string | null;
    idempotent: boolean;
  }>(res, 'Purchase failed.');
  return {
    purchaseId: body.purchaseId,
    tracking: body.tracking,
    carrier: body.carrier,
    service: body.service,
    cost: body.cost,
    currency: body.currency,
    idempotent: body.idempotent,
  };
}

export async function pairIntakeLabels(ref: string, orderId: number): Promise<number> {
  const res = await fetch('/api/shipping/label-intake/pair', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref, orderId }),
  });
  const body = await readJson<{ paired: number }>(res, 'Could not pair the labels.');
  return body.paired;
}

/**
 * One row per carrier service + package at its cheapest price — ShipStation
 * answers the same service once per connected account, which read as a
 * doubled list.
 */
export function distinctRates(rates: readonly ShippingRateOption[]): ShippingRateOption[] {
  const best = new Map<string, ShippingRateOption>();
  for (const rate of rates) {
    const key = `${rate.carrierCode}|${rate.serviceCode}|${rate.packageType ?? ''}`;
    const prior = best.get(key);
    if (!prior || rate.amount < prior.amount) best.set(key, rate);
  }
  return [...best.values()].sort((a, b) => a.amount - b.amount);
}

export function formatMoney(amount: number | null | undefined, currency: string | null = 'USD'): string {
  if (typeof amount !== 'number') return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(amount);
}
