'use client';

/** Label intake — the desk the global `+` opens (`/search?entry=label`). */

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { DESK_BAR_SEGMENT_CLASS, deskBarSegmentTone } from '@/design-system/components/DeskActionSlot';
import { EVIDENCE_CONTROL_CLASS, evidenceVerbClass } from '@/design-system/components/record-ledger/RecordEvidence';
import { RECORD_ID_CLASS, RECORD_LABEL_CLASS } from '@/design-system/tokens/record';
import { DESK_TRIAGE_RAIL_CLASS } from '@/design-system/tokens/desk-stage';
import { orderLabelSummaryKey, printDocument } from '@/lib/orders/order-paperwork-client';
import { LABEL_PURPOSE_FACE } from '@/lib/shipping/label-purpose';
import type { ShipAddress } from '@/lib/shipping/shipstation/types';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { useSearchPrimaryPaintOptional } from '@/components/search/search-primary-paint-context';
import { cn } from '@/utils/_cn';
import {
  distinctRates,
  fetchIntakeRates,
  intakeLabelPdfSrc,
  labelIntakeKey,
  purchaseIntakeLabel,
  useLabelIntake,
  type IntakeLookup,
  type IntakePurchase,
  type IntakePurpose,
  type IntakeShipment,
} from './label-intake-client';
import { LabelIntakeBuyBar, LabelIntakeRateLedger } from './LabelIntakeRates';
import { LabelIntakeLabels } from './LabelIntakeLabels';

const PURPOSES: readonly IntakePurpose[] = ['replacement', 'return'];

/** One ledger row: a fixed mono label lane, then the row's content. */
function IntakeRow({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex border-b border-mode-rule bg-mode-panel" data-testid={testId}>
      <div className={cn(RECORD_LABEL_CLASS, 'w-28 shrink-0 border-r border-mode-edge px-4 py-2.5 text-mode-muted')}>
        {label}
      </div>
      <div className="min-w-0 flex-1 px-3 py-1.5">{children}</div>
    </div>
  );
}

/** A captioned control; the caption stays when the field is filled. */
function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn('flex flex-col gap-0.5', className)}>
      <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>{label}</span>
      {children}
    </label>
  );
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

type AddressDraft = Record<
  'name' | 'phone' | 'addressLine1' | 'addressLine2' | 'cityLocality' | 'stateProvince' | 'postalCode' | 'countryCode',
  string
>;

function addressDraftFrom(shipTo: ShipAddress | null): AddressDraft {
  return {
    name: shipTo?.name ?? '',
    phone: shipTo?.phone ?? '',
    addressLine1: shipTo?.addressLine1 ?? '',
    addressLine2: shipTo?.addressLine2 ?? '',
    cityLocality: shipTo?.cityLocality ?? '',
    stateProvince: shipTo?.stateProvince ?? '',
    postalCode: shipTo?.postalCode ?? '',
    countryCode: shipTo?.countryCode ?? 'US',
  };
}

function addressFromDraft(d: AddressDraft): ShipAddress | null {
  const t = (v: string) => v.trim();
  if (!t(d.name) || !t(d.addressLine1) || !t(d.cityLocality) || !t(d.stateProvince) || !t(d.postalCode)) return null;
  if (t(d.countryCode).length !== 2) return null;
  return {
    name: t(d.name),
    phone: t(d.phone) || null,
    company: null,
    addressLine1: t(d.addressLine1),
    addressLine2: t(d.addressLine2) || null,
    cityLocality: t(d.cityLocality),
    stateProvince: t(d.stateProvince),
    postalCode: t(d.postalCode),
    countryCode: t(d.countryCode).toUpperCase(),
    residential: true,
  };
}

type ParcelDraft = Record<'weightOz' | 'lengthIn' | 'widthIn' | 'heightIn', string>;

const positive = (v: string): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// ─── Desk ────────────────────────────────────────────────────────────────────

export function LabelIntakeDesk() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const ref = (searchParams.get('q') ?? '').trim();
  const [draft, setDraft] = useState(ref);

  // `/search` holds a cover until its body paints; this desk paints at once.
  const primaryPaint = useSearchPrimaryPaintOptional();
  useEffect(() => {
    primaryPaint?.onPrimaryPainted();
  }, [primaryPaint]);

  useEffect(() => {
    setDraft(ref);
  }, [ref]);

  const commit = useCallback(
    (value: string) => {
      const next = value.trim();
      if (next === ref) return;
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set('q', next);
      else params.delete('q');
      params.delete('sel');
      router.replace(`${pathname ?? '/search'}?${params.toString()}`, { scroll: false });
    },
    [pathname, ref, router, searchParams],
  );

  // Typing pairs as it goes — no submit step between the number and its order.
  useEffect(() => {
    const next = draft.trim();
    if (next === ref || (next.length > 0 && next.length < 2)) return;
    const timer = window.setTimeout(() => commit(next), 450);
    return () => window.clearTimeout(timer);
  }, [draft, ref, commit]);

  const lookup = useLabelIntake(ref);
  const data = lookup.data && lookup.data.ref === ref ? lookup.data : null;
  const order = data?.order ?? null;

  return (
    <ModeRegion
      mode="triage"
      className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-mode-canvas"
      data-testid="label-intake"
    >
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex min-h-mode-hit shrink-0 items-center border-b border-mode-divide bg-mode-bar pl-4">
          <h1 className={cn(RECORD_LABEL_CLASS, 'flex-1 text-mode-ink')}>Add shipping label</h1>
        </div>

        <IntakeRow label="Order #" testId="label-intake-order">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit(draft);
              }}
              onBlur={() => commit(draft)}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              aria-label="Order number"
              placeholder="Order number"
              className={cn(EVIDENCE_CONTROL_CLASS, RECORD_ID_CLASS, 'w-72 shrink-0')}
              data-testid="label-intake-order-input"
            />
            {!ref ? null : lookup.isLoading || (lookup.isFetching && !data) ? (
              <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Looking up…</span>
            ) : order ? (
              <span className="flex min-w-0 items-center gap-2" data-testid="label-intake-paired">
                <span className={cn(RECORD_LABEL_CLASS, 'bg-mode-ink px-1.5 py-0.5 text-mode-bar')}>Paired</span>
                <span className={RECORD_ID_CLASS}>#{order.id}</span>
                <span className="truncate text-role-data text-mode-muted">
                  {[order.customerName, order.platform].filter(Boolean).join(' · ')}
                </span>
              </span>
            ) : data ? (
              <span className="flex items-center gap-2" data-testid="label-intake-reference">
                <span className={cn(RECORD_LABEL_CLASS, 'border border-mode-control px-1.5 py-0.5 text-mode-warn')}>
                  Reference only
                </span>
                <span className="text-role-data text-mode-muted">Not in the system — the label is recorded under this number.</span>
              </span>
            ) : null}
          </div>
        </IntakeRow>

        {!ref ? (
          <p className="px-4 py-3 text-role-data text-mode-muted">
            Type the order number. An order in the system pairs to it; any other number is kept as the reference the
            label is bought and recorded under.
          </p>
        ) : lookup.isError ? (
          <p role="alert" className="px-4 py-3 text-role-data text-mode-warn">
            {lookup.error.message}
          </p>
        ) : data ? (
          <IntakeWorkbench key={`${data.ref}:${order?.id ?? 'ref'}`} lookup={data} />
        ) : null}
      </div>

      <aside
        className={cn(DESK_TRIAGE_RAIL_CLASS, 'overflow-y-auto overscroll-contain border-l border-mode-divide')}
        aria-label="Labels on this order"
      >
        <LabelIntakeLabels lookup={data} />
      </aside>
    </ModeRegion>
  );
}

// ─── Workbench ───────────────────────────────────────────────────────────────

function IntakeWorkbench({ lookup }: { lookup: IntakeLookup }) {
  const queryClient = useQueryClient();
  const order = lookup.order;
  // `?purpose=return|replacement` — the order record's Return / Replacement label verbs.
  const purposeParam = useSearchParams().get('purpose');
  const [purpose, setPurpose] = useState<IntakePurpose>(purposeParam === 'return' ? 'return' : 'replacement');
  const [address, setAddress] = useState<AddressDraft>(() => addressDraftFrom(lookup.shipTo));
  const [parcel, setParcel] = useState<ParcelDraft>(() => ({
    weightOz: lookup.parcel?.weightOz != null ? String(lookup.parcel.weightOz) : '',
    lengthIn: lookup.parcel?.lengthIn != null ? String(lookup.parcel.lengthIn) : '',
    widthIn: lookup.parcel?.widthIn != null ? String(lookup.parcel.widthIn) : '',
    heightIn: lookup.parcel?.heightIn != null ? String(lookup.parcel.heightIn) : '',
  }));
  const [selectedRateId, setSelectedRateId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [ratedSignature, setRatedSignature] = useState<string | null>(null);
  const [bought, setBought] = useState<Partial<Record<IntakePurpose, IntakePurchase>>>({});
  // One idempotency key per INTENDED purchase, per purpose: it survives a
  // re-rate and a retry, so a retry can only replay what the server recorded.
  const keys = useRef<Partial<Record<IntakePurpose, string>>>({});

  // A paired order ships to the address on the order; a reference number
  // ships to the address typed here.
  const shipTo = order ? lookup.shipTo : addressFromDraft(address);
  const weightOz = positive(parcel.weightOz);
  const length = positive(parcel.lengthIn);
  const width = positive(parcel.widthIn);
  const height = positive(parcel.heightIn);
  const shipment: IntakeShipment | null =
    shipTo && weightOz != null
      ? {
          purpose,
          orderId: order?.id ?? null,
          ref: lookup.ref,
          shipTo,
          weightOz,
          dimensions: length && width && height ? { length, width, height, unit: 'inch' } : null,
        }
      : null;
  const signature = shipment ? JSON.stringify(shipment) : null;

  const rates = useMutation({
    mutationFn: (s: IntakeShipment) => fetchIntakeRates(s),
    onSuccess: (result, s) => {
      setRatedSignature(JSON.stringify(s));
      setSelectedRateId(distinctRates(result.rates)[0]?.rateId ?? null);
      setConfirming(false);
    },
  });
  const options = useMemo(() => distinctRates(rates.data?.rates ?? []), [rates.data]);
  const stale = rates.data != null && ratedSignature !== signature;
  const selectedRate = stale ? null : (options.find((r) => r.rateId === selectedRateId) ?? null);

  const purchase = useMutation({
    mutationFn: ({ s, rateId }: { s: IntakeShipment; rateId: string }) => {
      const rate = options.find((r) => r.rateId === rateId);
      if (!rate) throw new Error('Pick a rate first.');
      keys.current[s.purpose] ??= safeRandomUUID();
      return purchaseIntakeLabel(s, rate, keys.current[s.purpose] as string);
    },
    onSuccess: (result, { s }) => {
      setBought((prev) => ({ ...prev, [s.purpose]: result }));
      keys.current[s.purpose] = undefined;
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: labelIntakeKey(lookup.ref) });
      if (order) void queryClient.invalidateQueries({ queryKey: orderLabelSummaryKey(order.id) });
    },
  });

  const choosePurpose = (next: IntakePurpose) => {
    if (next === purpose) return;
    setPurpose(next);
    setSelectedRateId(null);
    setConfirming(false);
    setRatedSignature(null);
    rates.reset();
    purchase.reset();
  };

  const recorded = lookup.labels.some((l) => l.purpose === purpose && l.status === 'purchased');
  const other: IntakePurpose = purpose === 'replacement' ? 'return' : 'replacement';
  const otherDone = bought[other] != null || lookup.labels.some((l) => l.purpose === other && l.status === 'purchased');
  const current = bought[purpose] ?? null;

  const setAddr = (key: keyof AddressDraft) => (e: ChangeEvent<HTMLInputElement>) =>
    setAddress((prev) => ({ ...prev, [key]: e.target.value }));
  const setDim = (key: keyof ParcelDraft) => (e: ChangeEvent<HTMLInputElement>) =>
    setParcel((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <>
      {order ? (
        <IntakeRow label="Item" testId="label-intake-item">
          <div className="flex min-h-mode-hit items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-role-body font-bold text-mode-ink">{order.title ?? '—'}</span>
            {order.sku ? <span className={cn(RECORD_ID_CLASS, 'shrink-0')}>SKU {order.sku}</span> : null}
            {order.quantity != null ? <span className={cn(RECORD_ID_CLASS, 'shrink-0')}>Qty {order.quantity}</span> : null}
          </div>
        </IntakeRow>
      ) : null}

      <IntakeRow label="Label" testId="label-intake-purpose">
        <div role="radiogroup" aria-label="Label" className="flex w-fit border border-mode-control">
          {PURPOSES.map((p, i) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={purpose === p}
              disabled={purchase.isPending}
              onClick={() => choosePurpose(p)}
              className={cn(DESK_BAR_SEGMENT_CLASS, 'w-52 justify-center whitespace-nowrap', i > 0 && 'border-l border-mode-control', deskBarSegmentTone(purpose === p))}
            >
              {LABEL_PURPOSE_FACE[p].code} · {LABEL_PURPOSE_FACE[p].label}
              {bought[p] ? ' ✓' : ''}
            </button>
          ))}
        </div>
      </IntakeRow>

      <IntakeRow label={purpose === 'return' ? 'Ship from' : 'Ship to'} testId="label-intake-address">
        {order ? (
          lookup.shipTo ? (
            <div className="py-1 text-role-data text-mode-ink">
              <p className="font-bold">{lookup.shipTo.name}</p>
              <p>{[lookup.shipTo.addressLine1, lookup.shipTo.addressLine2].filter(Boolean).join(', ')}</p>
              <p>
                {lookup.shipTo.cityLocality}, {lookup.shipTo.stateProvince} {lookup.shipTo.postalCode} ·{' '}
                {lookup.shipTo.countryCode}
                {lookup.shipTo.phone ? ` · ${lookup.shipTo.phone}` : ''}
              </p>
              <p className={cn(RECORD_LABEL_CLASS, 'mt-1 text-mode-muted')}>From order #{order.id}</p>
            </div>
          ) : (
            <p className="py-1 text-role-data text-mode-warn">
              Order #{order.id} has no ship-to address, so no label can be rated against it.
            </p>
          )
        ) : (
          <div className="flex flex-col gap-2 py-1">
            <div className="flex flex-wrap gap-2">
              <Field label="Name" className="w-72">
                <input value={address.name} onChange={setAddr('name')} className={EVIDENCE_CONTROL_CLASS} autoComplete="off" />
              </Field>
              <Field label="Phone" className="w-44">
                <input value={address.phone} onChange={setAddr('phone')} className={EVIDENCE_CONTROL_CLASS} autoComplete="off" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Field label="Address" className="w-[26rem]">
                <input value={address.addressLine1} onChange={setAddr('addressLine1')} className={EVIDENCE_CONTROL_CLASS} autoComplete="off" />
              </Field>
              <Field label="Apt / suite" className="w-44">
                <input value={address.addressLine2} onChange={setAddr('addressLine2')} className={EVIDENCE_CONTROL_CLASS} autoComplete="off" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Field label="City" className="w-56">
                <input value={address.cityLocality} onChange={setAddr('cityLocality')} className={EVIDENCE_CONTROL_CLASS} autoComplete="off" />
              </Field>
              <Field label="State" className="w-20">
                <input value={address.stateProvince} onChange={setAddr('stateProvince')} className={EVIDENCE_CONTROL_CLASS} maxLength={3} autoComplete="off" />
              </Field>
              <Field label="ZIP" className="w-28">
                <input value={address.postalCode} onChange={setAddr('postalCode')} className={cn(EVIDENCE_CONTROL_CLASS, RECORD_ID_CLASS)} autoComplete="off" />
              </Field>
              <Field label="Country" className="w-20">
                <input value={address.countryCode} onChange={setAddr('countryCode')} className={EVIDENCE_CONTROL_CLASS} maxLength={2} autoComplete="off" />
              </Field>
            </div>
            {purpose === 'return' ? (
              <p className="text-role-micro text-mode-muted">The customer ships from here to the warehouse.</p>
            ) : null}
          </div>
        )}
      </IntakeRow>

      <IntakeRow label="Parcel" testId="label-intake-parcel">
        <div className="flex flex-wrap items-end gap-2 py-1">
          <Field label="Weight oz" className="w-24">
            <input value={parcel.weightOz} onChange={setDim('weightOz')} inputMode="decimal" className={cn(EVIDENCE_CONTROL_CLASS, RECORD_ID_CLASS)} aria-label="Weight in ounces" />
          </Field>
          <Field label="L in" className="w-20">
            <input value={parcel.lengthIn} onChange={setDim('lengthIn')} inputMode="decimal" className={cn(EVIDENCE_CONTROL_CLASS, RECORD_ID_CLASS)} aria-label="Length in inches" />
          </Field>
          <Field label="W in" className="w-20">
            <input value={parcel.widthIn} onChange={setDim('widthIn')} inputMode="decimal" className={cn(EVIDENCE_CONTROL_CLASS, RECORD_ID_CLASS)} aria-label="Width in inches" />
          </Field>
          <Field label="H in" className="w-20">
            <input value={parcel.heightIn} onChange={setDim('heightIn')} inputMode="decimal" className={cn(EVIDENCE_CONTROL_CLASS, RECORD_ID_CLASS)} aria-label="Height in inches" />
          </Field>
          <button
            type="button"
            className={cn(evidenceVerbClass(!rates.data || stale), 'ml-auto')}
            disabled={!shipment || rates.isPending || purchase.isPending}
            onClick={() => shipment && rates.mutate(shipment)}
            data-testid="label-intake-get-rates"
          >
            {rates.isPending ? 'Rating…' : rates.data && !stale ? 'Refresh rates' : 'Get rates'}
          </button>
        </div>
        {!shipment ? (
          <p className="pb-1 text-role-micro text-mode-muted">
            {weightOz == null ? 'Enter the parcel weight' : 'Complete the address'} to get rates.
          </p>
        ) : null}
      </IntakeRow>

      <IntakeRow label="Rate" testId="label-intake-rate">
        {rates.isError ? (
          <p role="alert" className="py-1 text-role-data text-mode-warn">
            {rates.error.message}
          </p>
        ) : rates.data ? (
          stale ? (
            <p className="py-1 text-role-data text-mode-warn">Address or parcel changed — refresh rates.</p>
          ) : (
            <LabelIntakeRateLedger
              rates={options}
              selectedRateId={selectedRateId}
              onSelect={(id) => {
                setSelectedRateId(id);
                setConfirming(false);
              }}
              invalidCount={rates.data.invalidRates.length}
            />
          )
        ) : (
          <p className="py-1 text-role-data text-mode-muted">No rates yet.</p>
        )}
      </IntakeRow>

      <IntakeRow label="Buy" testId="label-intake-buy-row">
        <div className="flex flex-col gap-1 py-1">
          {recorded && !current ? (
            <p className="text-role-micro text-mode-warn">
              A {LABEL_PURPOSE_FACE[purpose].label.toLowerCase()} label is already recorded on {lookup.ref}; buying
              again adds a second one.
            </p>
          ) : null}
          <LabelIntakeBuyBar
            purpose={purpose}
            orderRef={lookup.ref}
            rate={selectedRate}
            confirming={confirming}
            onConfirming={setConfirming}
            buying={purchase.isPending}
            error={purchase.isError ? purchase.error.message : null}
            onBuy={() => shipment && selectedRate && purchase.mutate({ s: shipment, rateId: selectedRate.rateId })}
            bought={current}
            onPrint={current?.purchaseId ? () => printDocument(intakeLabelPdfSrc(current.purchaseId as number)) : null}
            onNext={
              current && !otherDone
                ? { label: `Buy ${LABEL_PURPOSE_FACE[other].label.toLowerCase()} label`, run: () => choosePurpose(other) }
                : null
            }
          />
        </div>
      </IntakeRow>
    </>
  );
}
