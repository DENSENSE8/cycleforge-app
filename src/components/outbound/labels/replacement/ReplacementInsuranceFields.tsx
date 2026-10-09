'use client';

/**
 * Insurance on the label-buy Parcel step: the switch and the declared value
 * (prefilled from the order total). Get rates is the step's footer verb.
 */

import { Switch, TextField } from '@/design-system/primitives';

export function ReplacementInsuranceFields({
  insure,
  onInsureChange,
  declared,
  onDeclaredChange,
  currency,
}: {
  insure: boolean;
  onInsureChange: (next: boolean) => void;
  declared: string;
  onDeclaredChange: (next: string) => void;
  currency: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex shrink-0 items-center gap-2 text-role-caption font-semibold text-text-default">
        <Switch checked={insure} onCheckedChange={onInsureChange} data-testid="send-replacement-insure" />
        Insure shipment
      </label>
      <TextField
        label={`Declared value (${currency})`}
        value={declared}
        onChange={(next) => onDeclaredChange(next.replace(/[^0-9.]/g, ''))}
        inputMode="decimal"
        disabled={!insure}
        className="w-48"
        data-testid="send-replacement-declared-value"
      />
    </div>
  );
}
