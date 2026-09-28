'use client';

/**
 * Shipping: the parcel, then how the order leaves —
 * **Buy with ShipStation** (the existing `BuyLabelSection` rate-shop; it rates
 * the saved order — with `onEnsureSaved`, "Open ShipStation" saves the held
 * draft itself, so the operator never saves first), **Bought elsewhere** (a tracking
 * number, carrier read off its shape, and the label PDF / image, uploaded on
 * save), or **Pickup / walk-in** (handed over at the counter: no parcel, no
 * label, no tracking — the order saves with `fulfillment: 'pickup'`).
 */

import { useRef, useState } from 'react';
import { FileText, Truck, X } from '@/components/Icons';
import { BuyLabelSection } from '@/components/outbound/labels/BuyLabelSection';
import { IconButton } from '@/design-system/primitives';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { detectCarrierFromTracking, toDisplayCarrier } from '@/utils/carrier-patterns';
import { cn } from '@/utils/_cn';
import type { IntakeShippingMode, IntakeState } from '@/lib/orders/intake/intake-model';
import { parcelFromText } from '@/hooks/orders/useOrderTriage';

const MODES: ReadonlyArray<{ value: IntakeShippingMode; label: string }> = [
  { value: 'elsewhere', label: 'Bought elsewhere' },
  { value: 'buy', label: 'Buy with ShipStation' },
  { value: 'pickup', label: 'Pickup / walk-in' },
];

export function IntakeShippingFields({
  state,
  onChange,
  labelFile,
  onLabelFile,
  bound,
  onEnsureSaved,
}: {
  state: IntakeState;
  onChange: (patch: Partial<IntakeState>) => void;
  labelFile: File | null;
  onLabelFile: (file: File | null) => void;
  /** The saved order — Buy needs it; `null` before save. */
  bound: { orderId: number; orderRef: string; onLabelChanged: () => void } | null;
  /** Save the order as a held draft (returns its number) — lets Buy rate before a manual save. */
  onEnsureSaved?: () => Promise<string | null>;
}) {
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tracking = state.trackingNumber.trim();
  const carrier = tracking ? detectCarrierFromTracking(tracking) : null;
  const parcel = parcelFromText(state.parcel);
  const setParcel = (key: keyof IntakeState['parcel']) => (value: string) =>
    onChange({ parcel: { ...state.parcel, [key]: value } });

  return (
    <div className="space-y-3" data-testid="intake-shipping">
      {state.shippingMode === 'pickup' ? null : (
        <div className="grid grid-cols-4 gap-3">
          <TextField label="Weight oz" value={state.parcel.weightOz} onChange={setParcel('weightOz')} inputMode="decimal" data-testid="intake-weight" />
          <TextField label="Length in" value={state.parcel.lengthIn} onChange={setParcel('lengthIn')} inputMode="decimal" />
          <TextField label="Width in" value={state.parcel.widthIn} onChange={setParcel('widthIn')} inputMode="decimal" />
          <TextField label="Height in" value={state.parcel.heightIn} onChange={setParcel('heightIn')} inputMode="decimal" />
        </div>
      )}

      <div
        role="radiogroup"
        aria-label="Label"
        className="inline-flex w-full items-center gap-0.5 rounded-mode-control bg-surface-sunken p-0.5"
        data-testid="intake-shipping-mode"
      >
        {MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={state.shippingMode === mode.value}
            onClick={() => onChange({ shippingMode: mode.value })}
            data-testid={`intake-shipping-${mode.value}`}
            className={cn(
              'inline-flex h-8 flex-1 items-center justify-center rounded-mode-control px-3 text-role-caption font-medium transition-colors',
              state.shippingMode === mode.value
                ? 'bg-surface-card text-text-default shadow-elev-soft'
                : 'text-text-muted hover:text-text-default',
              focusRing('control'),
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {state.shippingMode === 'elsewhere' ? (
        <div className="space-y-3">
          <TextField
            label="Tracking number"
            value={state.trackingNumber}
            onChange={(v) => onChange({ trackingNumber: v.trim() })}
            mono
            autoComplete="off"
            trailing={
              carrier ? (
                <span className="rounded-mode-pill bg-surface-sunken px-2 py-0.5 text-role-micro font-medium text-text-muted" data-testid="intake-tracking-carrier">
                  {toDisplayCarrier(carrier)}
                </span>
              ) : null
            }
            data-testid="intake-tracking"
          />
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => onLabelFile(e.target.files?.[0] ?? null)}
              data-testid="intake-label-file"
            />
            {labelFile ? (
              <span className="inline-flex min-w-0 items-center gap-2 rounded-mode-control bg-surface-sunken py-1 pl-3 pr-1 text-role-caption text-text-default">
                <FileText className="size-4 shrink-0 text-text-muted" aria-hidden />
                <span className="truncate" data-testid="intake-label-file-name">{labelFile.name}</span>
                <IconButton
                  icon={<X className="size-3.5" />}
                  ariaLabel="Remove the label file"
                  radius="control"
                  size="sm"
                  onClick={() => {
                    onLabelFile(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                />
              </span>
            ) : (
              <Button variant="secondary" size="sm" icon={<FileText className="size-4" />} onClick={() => fileRef.current?.click()}>
                Attach label PDF or image
              </Button>
            )}
          </div>
        </div>
      ) : state.shippingMode === 'pickup' ? (
        <p className="text-role-caption text-text-muted" data-testid="intake-pickup-note">
          The customer collects it at the counter — no label, no tracking. The floor still picks and packs it.
        </p>
      ) : bound ? (
        <div className="rounded-mode-control border border-border-hairline p-3" data-testid="intake-label-buy">
          <BuyLabelSection
            orderId={bound.orderId}
            orderRef={bound.orderRef}
            weightOz={parcel.weightOz}
            dimensions={
              parcel.lengthIn != null && parcel.widthIn != null && parcel.heightIn != null
                ? { length: parcel.lengthIn, width: parcel.widthIn, height: parcel.heightIn, unit: 'inch' }
                : null
            }
            onChange={bound.onLabelChanged}
          />
        </div>
      ) : onEnsureSaved ? (
        <div className="flex items-center gap-3 rounded-mode-control border border-border-hairline p-3" data-testid="intake-label-rate">
          <p className="min-w-0 flex-1 text-role-caption text-text-muted">
            ShipStation rates this parcel to the ship-to above — the order is held as a draft first, no Save needed.
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon={<Truck className="size-4" />}
            loading={saving}
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onEnsureSaved();
              } finally {
                setSaving(false);
              }
            }}
            data-testid="intake-label-get-rates"
          >
            Open ShipStation
          </Button>
        </div>
      ) : (
        <p className="text-role-caption text-text-muted">
          Save the draft first — ShipStation rates the saved order with this parcel and the ship-to above.
        </p>
      )}
    </div>
  );
}
