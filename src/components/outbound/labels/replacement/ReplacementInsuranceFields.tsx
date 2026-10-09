'use client';

/**
 * Insurance + Get rates, under the parcel row. Get rates stays greyed with a
 * quiet hint of what is missing — never an error on press; once quoted, an
 * edit marks the quote stale and the button becomes Refresh rates.
 */

import { RefreshCw, Truck } from '@/components/Icons';
import { Button, Switch, TextField } from '@/design-system/primitives';

export function ReplacementQuoteBar({
  insure,
  onInsureChange,
  declared,
  onDeclaredChange,
  currency,
  missing,
  stale,
  quoted,
  loading,
  disabled,
  onGetRates,
}: {
  insure: boolean;
  onInsureChange: (next: boolean) => void;
  declared: string;
  onDeclaredChange: (next: string) => void;
  currency: string;
  /** What still blocks a quote, e.g. "Enter weight and L × W × H"; null when ready. */
  missing: string | null;
  stale: boolean;
  quoted: boolean;
  loading: boolean;
  /** A buy is in flight or done — no re-quote under it. */
  disabled: boolean;
  onGetRates: () => void;
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
      <div className="ml-auto flex items-center gap-2">
        {missing ? (
          <span className="text-role-caption text-text-faint" data-testid="send-replacement-rates-hint">
            {missing}
          </span>
        ) : stale ? (
          <span className="text-role-caption text-text-warning">Changed since the quote — rates are out of date</span>
        ) : null}
        <Button
          variant={!quoted || stale ? 'primary' : 'secondary'}
          icon={quoted ? <RefreshCw /> : <Truck />}
          loading={loading}
          disabled={missing != null || disabled}
          onClick={onGetRates}
          data-testid="send-replacement-get-rates"
        >
          {quoted ? 'Refresh rates' : 'Get rates'}
        </Button>
      </div>
    </div>
  );
}
