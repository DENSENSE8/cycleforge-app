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
 *
 * ## Square's phone-first contact step (operator 2026-09-24)
 *
 * - The phone is typed on a glass keypad ({@link KioskPhoneKeypad}), never the
 *   OS keyboard: an iPad has no phone pad, and its full keyboard covered the
 *   step's Continue key. The input stays (`inputMode="none"`) so a desk
 *   keyboard still types into it.
 * - The tenth digit asks whether the number is on file
 *   ({@link useKioskCustomerMatch}); a match fills an empty Name, so a repeat
 *   customer is one keypad entry and Continue.
 * - Return in any field is the step's Continue (`onSubmit`), so the keyboard
 *   that Name / Email raise never has to be dismissed to find the key.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { KioskPhoneKeypad, type PhoneKeypadPress } from '@/components/kiosk/KioskAmountKeypad';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { useKioskCustomerMatch, type KioskCustomerMatch } from '@/components/kiosk/useKioskCustomerMatch';
import { TextField } from '@/design-system/primitives';
import { KIOSK_SECTION_LABEL_ROW } from '@/app/kiosk/kiosk-chrome';
import { counterCorner } from '@/app/kiosk/kiosk-counter-surface';
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
  /** The step's Continue — Return in any field runs it. */
  onSubmit?: () => void;
}

const PHONE_DIGITS = 10;

/** One glass key → the next phone string, in the one kiosk phone shape. */
function pressPhone(phone: string, key: PhoneKeypadPress): string {
  const digits = phone.replace(/\D/g, '');
  if (key === 'C') return '';
  if (key === 'back') return formatKioskPhoneInput(digits.slice(0, -1));
  return digits.length >= PHONE_DIGITS ? phone : formatKioskPhoneInput(digits + key);
}

/** The line under the phone: who this number is, before anyone asks a name. */
function CustomerMatchLine({ match }: { match: KioskCustomerMatch }) {
  // Always one line tall, so a lookup landing never shifts the keys under a thumb.
  return (
    <p
      className="min-h-5 px-1 text-sm font-semibold text-text-soft"
      aria-live="polite"
      data-testid="kiosk-customer-match"
      data-match={match.status}
    >
      {match.status === 'looking' && 'Looking up…'}
      {match.status === 'found' && (
        <>
          On file · <span className="text-text-default">{match.name || 'no name on file'}</span>
        </>
      )}
      {match.status === 'new' && 'New customer · add their name'}
    </p>
  );
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
  onSubmit,
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

  // Two glass taps inside one React batch must both land: press against the
  // number the LAST press produced, not the one this render painted.
  const latest = useRef({ current, patch });
  latest.current = { current, patch };
  const pressKey = (key: PhoneKeypadPress) => {
    const phone = pressPhone(latest.current.current.phone, key);
    latest.current.current = { ...latest.current.current, phone };
    latest.current.patch({ phone });
  };

  const match = useKioskCustomerMatch(show('phone') ? current.phone : '');
  const matchedName = match.status === 'found' ? match.name : null;
  // The name WE wrote. Only that name is ours to replace or take back — a name
  // the staffer typed is never overwritten by a lookup.
  const filledName = useRef<string | null>(null);
  useEffect(() => {
    if (match.status === 'looking') return;
    const { current: now, patch: write } = latest.current;
    const next = matchedName ?? '';
    if (now.name === next) {
      // Already what the lookup says (a resumed visit, a reload): that name is
      // the lookup's to take back if the number changes.
      if (next) filledName.current = next;
      return;
    }
    const typedByStaff = now.name.trim() !== '' && now.name !== filledName.current;
    if (typedByStaff) return;
    filledName.current = next || null;
    write({ name: next });
  }, [match.status, matchedName]);

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
            <div className="space-y-2">
              <KioskEntryField
                name="Phone number"
                value={current.phone}
                onChange={(v) => patch({ phone: formatKioskPhoneInput(v) })}
                type="tel"
                inputMode="none"
                autoComplete="tel"
                maxLength={12}
                testId="kiosk-customer-phone"
                onEnter={onSubmit}
              />
              <CustomerMatchLine match={match} />
              <KioskPhoneKeypad onPress={pressKey} />
            </div>
          ) : (
            <div className="space-y-2">
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
              <CustomerMatchLine match={match} />
            </div>
          ))}
        {show('name') &&
          (entry ? (
            <KioskEntryField
              name="Name"
              value={current.name}
              onChange={(v) => patch({ name: v })}
              autoComplete="name"
              testId="kiosk-customer-name"
              onEnter={onSubmit}
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
              onEnter={onSubmit}
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
              onEnter={onSubmit}
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
