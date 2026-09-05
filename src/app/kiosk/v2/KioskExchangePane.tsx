'use client';

/**
 * Landscape Exchange pane — in-store channel exchange, customer side.
 *
 * The customer bought on the online store, walked in with the item, and wants
 * to return it and pick a replacement. This pane does exactly ONE half of that:
 * it establishes WHICH online order, using the two-key check (order # + the
 * identity phone). The replacement is an ordinary RETAIL line added from the
 * catalog like any other sale — there is no second cart here, and no channel
 * return line type (plan X3).
 *
 * ## What this pane deliberately does not show
 *
 * No buyer name, no address, no line items, no candidate list. The tablet is
 * unattended-capable, so it gets a yes/no and the order's own public number —
 * `/api/kiosk/exchange/confirm` is scoped to exactly that. The matched detail
 * appears on the DESK, where a staff member is authenticated (plan §8).
 *
 * ## And does not do
 *
 * No refund. Money is staff-attended (plan X6, and D4: the kiosk stages and
 * never charges). The confirmed reference rides the submit; the counter's
 * staff-authed write path is what touches the channel.
 *
 * Cloned from `KioskPickupPane` — the other two-key command — rather than
 * forked: same header/footer bands, same `KioskCustomerIntake` lead field,
 * same single full-width footer action.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, TextField } from '@/design-system/primitives';
import { KioskCustomerIntake } from '@/components/kiosk/KioskCustomerIntake';
import { Check, Loader2 } from '@/components/Icons';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import {
  KIOSK_PANE_FOOTER_BAND,
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
  KIOSK_SECTION_LABEL_ROW,
} from '@/app/kiosk/kiosk-chrome';

interface KioskExchangePaneProps {
  onReset?: () => void;
  /**
   * Hand off to the counter cart with the confirmed order carried across.
   *
   * Present on the portrait `/kiosk` welcome flow, where each command is a
   * full-screen form and the replacement is bought in a SIBLING one. Absent on
   * the landscape shell, where the cart is already on screen beside this pane
   * and there is nowhere to go.
   */
  onContinue?: () => void;
}

export function KioskExchangePane({ onReset, onContinue }: KioskExchangePaneProps) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [orderNumber, setOrderNumber] = useState(() => session.exchangeOrderNumber);
  const [phone, setPhone] = useState(() => session.customerPhone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmedRef = session.exchangeConfirmedRef;

  useEffect(() => {
    if (session.customerPhone && !phone) setPhone(session.customerPhone);
  }, [session.customerPhone, phone]);

  const reset = useCallback(() => {
    setOrderNumber('');
    setPhone('');
    setError(null);
    actions.setExchangeOrder({ orderNumber: '', confirmedRef: '' });
    onReset?.();
  }, [actions, onReset]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/kiosk/exchange/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderNumber, phone }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        confirmedRef?: string;
        error?: string;
      };
      if (!res.ok || !body.confirmedRef) {
        // The route cannot tell a wrong number from a wrong phone from an
        // unreachable store, and neither can this copy. It says the one true
        // thing and hands the customer to a person.
        throw new Error(
          'We could not match that order number and phone. A team member can look it up.',
        );
      }
      // Only a SERVER-confirmed reference is stored — the typed value never
      // becomes the visit's prior order on its own.
      actions.setExchangeOrder({ orderNumber, confirmedRef: body.confirmedRef });
      actions.setCustomer({ phone });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not confirm that order.');
    } finally {
      setBusy(false);
    }
  };

  if (confirmedRef) {
    return (
      <div className="flex h-full flex-col" data-testid="kiosk-exchange-pane">
        <div className={KIOSK_PANE_HEADER_BAND}>
          <h2 className={KIOSK_PANE_HEADER_TITLE}>Return &amp; replace</h2>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <span
            className={cn(
              'flex h-16 w-16 items-center justify-center bg-surface-success text-text-success',
              cornerClass('flush'),
            )}
          >
            <Check className="h-8 w-8" />
          </span>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Order found</h2>
            {/* "Online order", never the connector's name (plan X10). */}
            <p className="font-semibold text-text-soft">
              Online order {confirmedRef} is attached to this visit.
            </p>
          </div>
          <p className="max-w-sm text-sm text-text-soft">
            {onContinue
              ? 'Pick the replacement next. A team member finishes the return and the refund at the counter.'
              : 'Add the replacement from the catalog. A team member finishes the return and the refund at the counter.'}
          </p>
        </div>
        <div className={KIOSK_PANE_FOOTER_BAND}>
          <Button
            size="lg"
            variant="secondary"
            className={cn('h-full min-h-0 flex-1 rounded-none', cornerClass('flush'))}
            onClick={reset}
          >
            Use a different order
          </Button>
          {onContinue && (
            <Button
              size="lg"
              className={cn('h-full min-h-0 flex-1 rounded-none', cornerClass('flush'))}
              onClick={onContinue}
            >
              Add replacement
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="kiosk-exchange-pane">
      <div className={KIOSK_PANE_HEADER_BAND}>
        <h2 className={KIOSK_PANE_HEADER_TITLE}>Return &amp; replace</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col divide-y divide-border-hairline">
          <KioskCustomerIntake
            heading="Find your online order"
            fields={['phone']}
            value={{ phone, name: '', email: '' }}
            onChange={(next) => {
              setPhone(next.phone);
              actions.setCustomer({ phone: next.phone });
            }}
            lead={
              <TextField
                label="Online order number"
                value={orderNumber}
                onChange={(v) => {
                  setOrderNumber(v);
                  // Re-typing clears any earlier confirmation — see
                  // setExchangeOrder for why a stale one must not survive.
                  actions.setExchangeOrder({ orderNumber: v });
                }}
                autoComplete="off"
                inputClassName="rounded-none"
                data-testid="kiosk-exchange-order"
              />
            }
            extras={
              error ? (
                <p className="text-center font-semibold text-text-danger">{error}</p>
              ) : null
            }
          />

          <section>
            <h3 className={KIOSK_SECTION_LABEL_ROW}>What happens next</h3>
            <div className="space-y-2 px-4 py-4 text-sm text-text-soft">
              <p>
                We match your order with the phone number you used, then a team
                member checks the item in and picks your replacement with you.
              </p>
              <p>
                Your refund goes back to the card you paid with online. Nothing
                is charged or refunded on this tablet.
              </p>
            </div>
          </section>
        </div>
      </div>
      <div className={KIOSK_PANE_FOOTER_BAND}>
        <Button
          size="lg"
          className={cn('h-full min-h-0 w-full flex-1 rounded-none', cornerClass('flush'))}
          disabled={busy || orderNumber.trim().length < 1 || phone.replace(/\D/g, '').length < 7}
          onClick={() => void confirm()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Checking…
            </>
          ) : (
            'Find my order'
          )}
        </Button>
      </div>
    </div>
  );
}
