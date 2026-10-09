'use client';

/**
 * The visit's SHIPPING ADDRESS, closed until it is needed — one row that names
 * what is on file, and opens in place to the full postal fields (street,
 * unit, city, state, ZIP). Operator 2026-10-09: "address behind JIT Shipping?
 * drop down button with full address fields" — most walk-ins pick up, so the
 * five fields stay out of the way until a repair has to ship back.
 *
 * Value is the session's ONE `address` string; the fields travel through it
 * via `encodeShipToAddress` / `decodeShipToAddress`.
 */

import { useId, useState } from 'react';
import { ChevronDown, MapPin, Truck } from '@/components/Icons';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { Button, TextField } from '@/design-system/primitives';
import { counterCorner } from '@/app/kiosk/kiosk-counter-surface';
import { KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import {
  decodeShipToAddress,
  encodeShipToAddress,
  formatShipToOneLine,
  type ShipToAddress,
} from '@/lib/customers/ship-to-address';
import { cn } from '@/utils/_cn';

interface ShipToFieldSpec {
  field: keyof ShipToAddress;
  name: string;
  autoComplete: string;
  maxLength: number;
  inputMode?: 'text' | 'numeric';
}

const STREET: ShipToFieldSpec = { field: 'address1', name: 'Street address', autoComplete: 'address-line1', maxLength: 100 };
const UNIT: ShipToFieldSpec = { field: 'address2', name: 'Apt, suite (optional)', autoComplete: 'address-line2', maxLength: 60 };
const CITY: ShipToFieldSpec = { field: 'city', name: 'City', autoComplete: 'address-level2', maxLength: 60 };
const STATE: ShipToFieldSpec = { field: 'state', name: 'State', autoComplete: 'address-level1', maxLength: 30 };
const ZIP: ShipToFieldSpec = { field: 'postalCode', name: 'ZIP', autoComplete: 'postal-code', maxLength: 10, inputMode: 'numeric' };

export function KioskShipToDisclosure({
  value,
  onChange,
  entry,
  onEnter,
}: {
  /** The session `address` string. */
  value: string;
  onChange: (next: string) => void;
  /** `entry` = the kiosk step face ({@link KioskEntryField}); otherwise TextField. */
  entry: boolean;
  onEnter?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const address = decodeShipToAddress(value);
  const summary = formatShipToOneLine(address);

  const field = (spec: ShipToFieldSpec, autoFocus = false) => {
    const set = (next: string) => onChange(encodeShipToAddress({ ...address, [spec.field]: next }));
    const testId = `kiosk-customer-ship-${spec.field}`;
    return entry ? (
      <KioskEntryField
        name={spec.name}
        value={address[spec.field]}
        onChange={set}
        autoComplete={`shipping ${spec.autoComplete}`}
        maxLength={spec.maxLength}
        inputMode={spec.inputMode}
        idScope="ship-to"
        icon={spec === STREET ? <MapPin className="h-4 w-4" /> : undefined}
        iconTone="neutral"
        testId={testId}
        onEnter={onEnter}
        autoFocus={autoFocus}
      />
    ) : (
      <TextField
        label={spec.name}
        value={address[spec.field]}
        onChange={set}
        autoComplete={`shipping ${spec.autoComplete}`}
        maxLength={spec.maxLength}
        inputMode={spec.inputMode}
        inputClassName={cn(counterCorner('field'))}
        data-testid={testId}
      />
    );
  };

  return (
    <div className="space-y-3" data-testid="kiosk-customer-ship-to">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full justify-start text-left"
        icon={<Truck className="h-4 w-4" />}
        iconRight={
          <ChevronDown
            className={cn('h-4 w-4 transition-transform duration-150', open && 'rotate-180')}
          />
        }
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((next) => !next)}
        data-testid="kiosk-customer-ship-to-toggle"
      >
        <span className="flex min-w-0 flex-1 flex-col items-start">
          <span>Shipping address</span>
          <span className={cn('max-w-full truncate', KIOSK_META)} data-testid="kiosk-customer-ship-to-summary">
            {summary || 'Only if the repair ships back'}
          </span>
        </span>
      </Button>
      {open ? (
        <div id={panelId} className="space-y-3" data-testid="kiosk-customer-ship-to-fields">
          {field(STREET, entry)}
          {field(UNIT)}
          {field(CITY)}
          <div className="grid grid-cols-2 gap-3">
            {field(STATE)}
            {field(ZIP)}
          </div>
        </div>
      ) : null}
    </div>
  );
}
