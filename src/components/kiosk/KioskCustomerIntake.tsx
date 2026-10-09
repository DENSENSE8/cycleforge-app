'use client';

/**
 * Unified kiosk customer intake — ONE identity form for every channel.
 * ## Square's phone-first contact step (operator 2026-09-24)
 * keypad is NOT part of the form (operator 2026-09-25): tapping the phone
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PhoneKeypadPress } from '@/components/kiosk/KioskAmountKeypad';
import { KioskFloatingPhoneKeypad } from '@/components/kiosk/KioskFloatingPhoneKeypad';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { KioskShipToDisclosure } from '@/components/kiosk/KioskShipToDisclosure';
import { Mail, Phone, User } from '@/components/Icons';
import { useKioskCustomerMatch, type KioskCustomerMatch } from '@/components/kiosk/useKioskCustomerMatch';
import { Button, TextField } from '@/design-system/primitives';
import { KIOSK_TEST_CUSTOMER } from '@/lib/kiosk/test-customer';
import { KIOSK_SECTION_LABEL_ROW } from '@/app/kiosk/kiosk-chrome';
import { counterCorner } from '@/app/kiosk/kiosk-counter-surface';
import { cn } from '@/utils/_cn';
import { formatKioskPhoneInput } from '@/lib/kiosk/phone';
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

/** One phone shape across every intake — see {@link formatKioskPhoneInput}. */
export { formatKioskPhoneInput };

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
  /** `entry` renders the placeholder-in-box mobile-native treatment ({@link KioskEntryField}): */
  entry?: boolean;
  /** Controlled mode — panes that own a local draft. */
  value?: KioskCustomerValue;
  onChange?: (next: KioskCustomerValue) => void;
  /** The step's Continue — Return in any field runs it. */
  onSubmit?: () => void;
}

const PHONE_DIGITS = 10;

/** The "Test customer" key — a dev/audit aid, never on a production tablet. */
const OFFER_TEST_CUSTOMER = process.env.NODE_ENV !== 'production';

/** One glass key → the next phone string, in the one kiosk phone shape. */
function pressPhone(phone: string, key: PhoneKeypadPress): string {
  const digits = phone.replace(/\D/g, '');
  if (key === 'C') return '';
  if (key === 'back') return formatKioskPhoneInput(digits.slice(0, -1));
  return digits.length >= PHONE_DIGITS ? phone : formatKioskPhoneInput(digits + key);
}

/** The line under the phone: who this number is, before anyone asks a name. */
function CustomerMatchLine({ match }: { match: KioskCustomerMatch }) {
  // Always one line tall, so a lookup landing never shifts the fields below it.
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

  // The floating keypad: mounted by a tap on (or focus into) the phone field.
  const [padOpen, setPadOpen] = useState(false);
  const phoneAnchor = useRef<HTMLDivElement>(null);

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
        {OFFER_TEST_CUSTOMER && show('phone') ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="md"
              icon={<User className="h-4 w-4" />}
              onClick={() =>
                patch({
                  phone: KIOSK_TEST_CUSTOMER.phone,
                  ...(show('name') ? { name: KIOSK_TEST_CUSTOMER.name } : {}),
                  ...(show('email') ? { email: KIOSK_TEST_CUSTOMER.email } : {}),
                  ...(show('address') ? { address: KIOSK_TEST_CUSTOMER.address } : {}),
                })
              }
              data-testid="kiosk-customer-fill-test"
            >
              Test customer
            </Button>
          </div>
        ) : null}
        {show('phone') &&
          (entry ? (
            <div className="space-y-2">
              <div ref={phoneAnchor} onFocus={() => setPadOpen(true)} onClick={() => setPadOpen(true)}>
                <KioskEntryField
                  name="Phone number"
                  value={current.phone}
                  onChange={(v) => patch({ phone: formatKioskPhoneInput(v) })}
                  type="tel"
                  inputMode="none"
                  autoComplete="tel"
                  maxLength={12}
                  icon={<Phone className="h-4 w-4" />}
                  iconTone="neutral"
                  testId="kiosk-customer-phone"
                  onEnter={onSubmit}
                />
              </div>
              <CustomerMatchLine match={match} />
              <KioskFloatingPhoneKeypad
                open={padOpen}
                phone={current.phone}
                onPress={pressKey}
                onClose={() => setPadOpen(false)}
                anchorRef={phoneAnchor}
              />
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
              icon={<User className="h-4 w-4" />}
                iconTone="neutral"
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
              icon={<Mail className="h-4 w-4" />}
                iconTone="neutral"
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
        {show('address') && (
          <KioskShipToDisclosure
            entry={entry}
            value={current.address ?? ''}
            onChange={(address) => patch({ address })}
            onEnter={onSubmit}
          />
        )}
        {extras}
      </div>
    </section>
  );
}
