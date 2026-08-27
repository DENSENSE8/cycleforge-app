'use client';

/**
 * Unified kiosk customer intake — ONE identity form for every channel.
 *
 * @domain-job Capture the person a kiosk transaction belongs to.
 * @hardware-target Station (counter tablet)
 * @density floor
 * @justification Repair, Retail/Counter, Buyback and Pickup each hand-rolled
 *   their own phone/name/email trio with different labels, different phone
 *   formatting (or none), and different autocomplete hints — so the same
 *   customer typed a differently-shaped form depending on which command the
 *   operator happened to be in. This is that one form; channels contribute
 *   their own fields through `lead` / `extras`,
 *   never by forking the contact block.
 *
 * Session-bound by default (`kioskSessionStore` — the cart IS the session
 * root, so the customer belongs to the cart, not to a pane). Panes that still
 * own a local draft pass `value` + `onChange` and stay controlled.
 */

import type { ReactNode } from 'react';
import { TextField } from '@/design-system/primitives';
import { KIOSK_SECTION_LABEL_ROW } from '@/app/kiosk/kiosk-chrome';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';

type KioskCustomerField = 'phone' | 'name' | 'email';

/** Every channel asks in this order — phone leads (it is the lookup key). */
export const KIOSK_CUSTOMER_FIELDS: readonly KioskCustomerField[] = [
  'phone',
  'name',
  'email',
];

interface KioskCustomerValue {
  phone: string;
  name: string;
  email: string;
}

/**
 * One phone shape across the kiosk — `555-867-5309`. Formatting on the way in
 * means every channel writes the same string, so a lookup by phone matches
 * whichever command took the customer's details.
 */
export function formatKioskPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length > 6) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length > 3) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return digits;
}

interface KioskCustomerIntakeProps {
  /** Which contact fields this channel asks for. Default: all three. */
  fields?: readonly KioskCustomerField[];
  /** Section label. `null` renders the fields bare (cart ledger header block). */
  heading?: string | null;
  /** Controlled value — omit to bind straight to the kiosk session. */
  value?: KioskCustomerValue;
  /** Required with `value`. */
  onChange?: (next: KioskCustomerValue) => void;
  /** Channel fields rendered ABOVE the contact block (pickup: order number). */
  lead?: ReactNode;
  /** Channel fields rendered BELOW (repair: serial / price / notes). */
  extras?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

export function KioskCustomerIntake({
  fields = KIOSK_CUSTOMER_FIELDS,
  heading = 'Customer',
  value,
  onChange,
  lead,
  extras,
  className,
  'data-testid': dataTestId = 'kiosk-customer-intake',
}: KioskCustomerIntakeProps) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();

  const controlled = value !== undefined;
  const current: KioskCustomerValue = controlled
    ? value
    : {
        phone: session.customerPhone,
        name: session.customerName,
        email: session.customerEmail,
      };

  const patch = (next: Partial<KioskCustomerValue>) => {
    if (controlled) {
      onChange?.({ ...current, ...next });
      return;
    }
    actions.setCustomer(next);
  };

  const show = (field: KioskCustomerField) => fields.includes(field);

  return (
    <section className={className} data-testid={dataTestId}>
      {heading !== null && (
        <h3 className={KIOSK_SECTION_LABEL_ROW}>
          {heading}
        </h3>
      )}
      <div className="space-y-3 px-4 py-4">
        {lead}
        {show('phone') && (
          <TextField
            label="Phone number"
            value={current.phone}
            onChange={(v) => patch({ phone: formatKioskPhoneInput(v) })}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            maxLength={12}
            inputClassName="rounded-none"
            data-testid="kiosk-customer-phone"
          />
        )}
        {show('name') && (
          <TextField
            label="Name"
            value={current.name}
            onChange={(v) => patch({ name: v })}
            autoComplete="name"
            inputClassName="rounded-none"
            data-testid="kiosk-customer-name"
          />
        )}
        {show('email') && (
          <TextField
            label="Email (optional)"
            value={current.email}
            onChange={(v) => patch({ email: v })}
            type="email"
            inputMode="email"
            autoComplete="email"
            inputClassName="rounded-none lowercase"
            data-testid="kiosk-customer-email"
          />
        )}
        {extras}
      </div>
    </section>
  );
}
