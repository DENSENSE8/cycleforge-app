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
 *
 * Two renders, ONE trio: the default is the house floating-label field;
 * `entry` is the mobile-native step path (placeholder-in-box via
 * {@link KioskEntryField}, no floating label, no divider, the kiosk's one
 * corner radius). The trio itself never forks — only its paint does.
 */

import type { ReactNode } from 'react';
import { TextField } from '@/design-system/primitives';
import { KIOSK_SECTION_LABEL_ROW } from '@/app/kiosk/kiosk-chrome';
import { counterCorner } from '@/app/kiosk/kiosk-counter-surface';
import {
  KIOSK_POS_ENTRY,
  KIOSK_POS_ENTRY_AREA,
  KIOSK_POS_ENTRY_ICON,
  KIOSK_POS_ENTRY_ICON_HOST,
  KIOSK_POS_ENTRY_ICON_INSET,
} from '@/app/kiosk/kiosk-pos-surface';
import { cn } from '@/utils/_cn';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';

type KioskCustomerField = 'phone' | 'name' | 'email' | 'address';

/** Every channel asks in this order — phone leads (it is the lookup key). Callers: KioskCartLedger + panes. User: "intake their information like name, email address, phone number, address". */
export const KIOSK_CUSTOMER_FIELDS: readonly KioskCustomerField[] = [
  'phone',
  'name',
  'email',
  'address',
];

interface KioskCustomerValue {
  phone: string;
  name: string;
  email: string;
  address?: string;
}

/**
 * One phone shape across the kiosk — `555-867-5309`. Formatting on the way in
 * means every channel writes the same string, so a lookup by phone matches
 * whichever command took the customer's details.
 */
export function formatKioskPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * One entry field for the kiosk step path — shared by the contact trio and
 * any channel `extras`, so every input on every channel answers to ONE token
 * ({@link KIOSK_POS_ENTRY}). Lives HERE (not in a pane) so the trio can never
 * fork again; exported for pane extras that must match. Accessibility rides
 * an sr-only `<label>` element — visible prompt is the placeholder.
 */
export function KioskEntryField({
  name,
  value,
  onChange,
  type = 'text',
  inputMode,
  autoComplete,
  maxLength,
  multiline = false,
  icon,
  testId,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: 'text' | 'tel' | 'email' | 'decimal' | 'numeric';
  autoComplete?: string;
  maxLength?: number;
  multiline?: boolean;
  /**
   * Leading glyph inside the field — states the field's KIND before anyone
   * reads the placeholder. Mount the house glyph (money is `Receipt`); the
   * slot supplies position and inset via `KIOSK_POS_ENTRY_ICON*`, so a caller
   * never hand-positions one. Single-line only: a textarea's first line is not
   * where a mark belongs.
   */
  icon?: ReactNode;
  testId?: string;
}) {
  const id = `kiosk-entry-${name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
  const withIcon = Boolean(icon) && !multiline;
  return (
    <div className={withIcon ? KIOSK_POS_ENTRY_ICON_HOST : undefined}>
      <label htmlFor={id} className="sr-only">
        {name}
      </label>
      {multiline ? (
        <textarea
          id={id}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={name}
          autoComplete={autoComplete}
          maxLength={maxLength}
          inputMode={inputMode}
          data-testid={testId}
          className={KIOSK_POS_ENTRY_AREA}
        />
      ) : (
        <>
          {withIcon ? (
            <span className={KIOSK_POS_ENTRY_ICON} aria-hidden>
              {icon}
            </span>
          ) : null}
          <input
            id={id}
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={name}
            autoComplete={autoComplete}
            maxLength={maxLength}
            inputMode={inputMode}
            data-testid={testId}
            className={cn(KIOSK_POS_ENTRY, withIcon && KIOSK_POS_ENTRY_ICON_INSET)}
          />
        </>
      )}
    </div>
  );
}

interface KioskCustomerIntakeProps {
  /** Which contact fields this channel asks for. Default: all three. */
  fields?: readonly KioskCustomerField[];
  /** Section label. `null` renders the fields bare (cart ledger header block). */
  heading?: string | null;
  /** Channel fields rendered ABOVE the contact block (pickup: order number). */
  lead?: ReactNode;
  /** Channel fields rendered BELOW (repair: serial / price / notes). */
  extras?: ReactNode;
  className?: string;
  'data-testid'?: string;
  /**
   * `entry` renders the placeholder-in-box mobile-native treatment
   * ({@link KioskEntryField}): no floating label, no divider — the prompt is
   * the placeholder. Default keeps the house floating-label fields for panes
   * not yet on the step path.
   */
  entry?: boolean;
  /** Controlled mode — panes that own a local draft. */
  value?: KioskCustomerValue;
  onChange?: (next: KioskCustomerValue) => void;
}

export function KioskCustomerIntake({
  fields = KIOSK_CUSTOMER_FIELDS,
  heading = 'Customer',
  value,
  onChange,
  lead,
  extras,
  className,
  entry = false,
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
        address: session.customerAddress,
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
        {show('phone') &&
          (entry ? (
            <KioskEntryField
              name="Phone number"
              value={current.phone}
              onChange={(v) => patch({ phone: formatKioskPhoneInput(v) })}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={12}
              testId="kiosk-customer-phone"
            />
          ) : (
            <TextField
              label="Phone number"
              value={current.phone}
              onChange={(v) => patch({ phone: formatKioskPhoneInput(v) })}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={12}
              inputClassName={cn(counterCorner('field'))}
              data-testid="kiosk-customer-phone"
            />
          ))}
        {show('name') &&
          (entry ? (
            <KioskEntryField
              name="Name"
              value={current.name}
              onChange={(v) => patch({ name: v })}
              autoComplete="name"
              testId="kiosk-customer-name"
            />
          ) : (
            <TextField
              label="Name"
              value={current.name}
              onChange={(v) => patch({ name: v })}
              autoComplete="name"
              inputClassName={cn(counterCorner('field'))}
              data-testid="kiosk-customer-name"
            />
          ))}
        {show('email') &&
          (entry ? (
            <KioskEntryField
              name="Email (optional)"
              value={current.email}
              onChange={(v) => patch({ email: v })}
              type="email"
              inputMode="email"
              autoComplete="email"
              testId="kiosk-customer-email"
            />
          ) : (
            <TextField
              label="Email (optional)"
              value={current.email}
              onChange={(v) => patch({ email: v })}
              type="email"
              inputMode="email"
              autoComplete="email"
              inputClassName={cn(counterCorner('field'), 'lowercase')}
              data-testid="kiosk-customer-email"
            />
          ))}
        {show('address') &&
          (entry ? (
            <KioskEntryField
              name="Address"
              value={current.address ?? ''}
              onChange={(v) => patch({ address: v })}
              autoComplete="street-address"
              testId="kiosk-customer-address"
            />
          ) : (
            <TextField
              label="Address"
              value={current.address ?? ''}
              onChange={(v) => patch({ address: v })}
              autoComplete="street-address"
              inputClassName={cn(counterCorner('field'))}
              data-testid="kiosk-customer-address"
            />
          ))}
        {extras}
      </div>
    </section>
  );
}
