'use client';

/**
 * Phone face of the new sales order's Shipping step (desk twin:
 * `IntakeShippingFields`). How the order leaves, picked as big touch rows:
 * **Pickup / walk-in** (handed over at the counter — no parcel, no label, no
 * tracking), **Bought elsewhere** (a tracking number with its carrier read off
 * its shape, the parcel, and the label as a PDF or a photo of it, uploaded on
 * save), or **Buy with ShipStation** — the rate-shop is desk-only today, so
 * the phone takes the parcel and says so.
 */

import { useRef } from 'react';
import { Camera, FileText, X } from '@/components/Icons';
import { MobileFormHeading } from './MobileFormHeading';
import { MobileChoiceRows, type MobileChoiceOption } from '@/components/mobile/orders/new/MobileChoice';
import { IconButton } from '@/design-system/primitives';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { parcelFromText } from '@/hooks/orders/useOrderTriage';
import type { IntakeShippingMode, IntakeState } from '@/lib/orders/intake/intake-model';
import { detectCarrierFromTracking, toDisplayCarrier } from '@/utils/carrier-patterns';

const MODES: ReadonlyArray<MobileChoiceOption<IntakeShippingMode>> = [
  { value: 'pickup', label: 'Pickup / walk-in', hint: 'Handed over at the counter' },
  { value: 'elsewhere', label: 'Bought elsewhere', hint: 'Tracking number and the label you already have' },
  { value: 'buy', label: 'Buy with ShipStation', hint: 'Rate-shop the label for this parcel' },
];

/** Same contract as the desk's `IntakeShippingFields`. */
export interface MobileShippingStepProps {
  state: IntakeState;
  onChange: (patch: Partial<IntakeState>) => void;
  labelFile: File | null;
  onLabelFile: (file: File | null) => void;
  /** The saved order — Buy needs it; `null` before save. */
  bound: { orderId: number; orderRef: string; onLabelChanged: () => void } | null;
}

export function MobileShippingStep({ state, onChange, labelFile, onLabelFile, bound }: MobileShippingStepProps) {
  const mode = state.shippingMode;
  const setParcel = (key: keyof IntakeState['parcel']) => (value: string) =>
    onChange({ parcel: { ...state.parcel, [key]: value } });

  return (
    <div className="flex flex-col divide-y divide-mode-rule" data-testid="m-order-shipping">
      <MobileChoiceRows
        label="How it leaves"
        options={MODES}
        value={mode}
        onChange={(value) => onChange({ shippingMode: value })}
        testId="m-order-shipping-mode"
      />

      {mode === 'pickup' ? (
        <p className="px-mode-page py-3 text-role-caption text-mode-muted" data-testid="m-order-pickup-note">
          The customer collects it at the counter — no label, no tracking. The floor still picks and packs it.
        </p>
      ) : (
        <>
          {mode === 'elsewhere' ? <ElsewhereLabel state={state} onChange={onChange} labelFile={labelFile} onLabelFile={onLabelFile} /> : null}
          <section aria-labelledby="m-order-parcel">
            <MobileFormHeading id="m-order-parcel">Parcel</MobileFormHeading>
            <div className="grid grid-cols-2 gap-3 px-mode-page py-3">
              <TextField label="Weight oz" value={state.parcel.weightOz} onChange={setParcel('weightOz')} inputMode="decimal" data-testid="m-order-weight" />
              <TextField label="Length in" value={state.parcel.lengthIn} onChange={setParcel('lengthIn')} inputMode="decimal" />
              <TextField label="Width in" value={state.parcel.widthIn} onChange={setParcel('widthIn')} inputMode="decimal" />
              <TextField label="Height in" value={state.parcel.heightIn} onChange={setParcel('heightIn')} inputMode="decimal" />
            </div>
          </section>
          {mode === 'buy' ? <BuyOnDesk bound={bound} weightKnown={parcelFromText(state.parcel).weightOz != null} /> : null}
        </>
      )}
    </div>
  );
}

function ElsewhereLabel({
  state,
  onChange,
  labelFile,
  onLabelFile,
}: Omit<MobileShippingStepProps, 'bound'>) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tracking = state.trackingNumber.trim();
  const carrier = tracking ? detectCarrierFromTracking(tracking) : null;

  return (
    <section aria-labelledby="m-order-label">
      <MobileFormHeading id="m-order-label">Label</MobileFormHeading>
      <div className="space-y-3 px-mode-page py-3">
        <TextField
          label="Tracking number"
          value={state.trackingNumber}
          onChange={(v) => onChange({ trackingNumber: v.trim() })}
          mono
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          trailing={
            carrier ? (
              <span className="bg-mode-well px-2 py-0.5 text-role-micro font-medium text-mode-muted" data-testid="m-order-tracking-carrier">
                {toDisplayCarrier(carrier)}
              </span>
            ) : null
          }
          data-testid="m-order-tracking"
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onLabelFile(e.target.files?.[0] ?? null)}
          data-testid="m-order-label-photo"
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => onLabelFile(e.target.files?.[0] ?? null)}
          data-testid="m-order-label-file"
        />
        {labelFile ? (
          <div className="flex min-h-mode-hit items-center gap-2 bg-mode-well pl-3 text-role-caption text-mode-ink">
            <FileText className="size-4 shrink-0 text-mode-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate" data-testid="m-order-label-file-name">{labelFile.name}</span>
            <IconButton
              icon={<X className="size-4" />}
              ariaLabel="Remove the label file"
              size="touch"
              onClick={() => {
                onLabelFile(null);
                if (cameraRef.current) cameraRef.current.value = '';
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" icon={<Camera className="size-4" />} onClick={() => cameraRef.current?.click()}>
              Photo of label
            </Button>
            <Button variant="secondary" icon={<FileText className="size-4" />} onClick={() => fileRef.current?.click()}>
              Attach PDF
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/** ShipStation's rate-shop (`BuyLabelSection`) is a desk component; the phone has no label purchase yet. */
function BuyOnDesk({ bound, weightKnown }: { bound: MobileShippingStepProps['bound']; weightKnown: boolean }) {
  return (
    <p className="px-mode-page py-3 text-role-caption text-mode-muted" data-testid="m-order-label-buy-desk">
      {bound
        ? `Buy the label at a desk on order ${bound.orderRef} — phone label purchase isn't built yet.`
        : "Buy the label at a desk after saving — phone label purchase isn't built yet."}
      {weightKnown ? null : ' Enter the weight so the desk can rate it.'}
    </p>
  );
}
