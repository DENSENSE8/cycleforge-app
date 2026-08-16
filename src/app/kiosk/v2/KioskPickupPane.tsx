'use client';

/**
 * Landscape Order Pickup pane — two-key lookup (order/RS# + phone) then collect.
 * Command (not a cart-clearing mode); never mounts staff LCPU / PickupWorkspace.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button, TextField } from '@/design-system/primitives';
import { Check, Loader2 } from '@/components/Icons';
import type { KioskPickupSummary } from '@/lib/kiosk/order-pickup';
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
  KIOSK_SECTION_LABEL,
} from '@/app/kiosk/kiosk-chrome';

interface KioskPickupPaneProps {
  onReset?: () => void;
}

export function KioskPickupPane({ onReset }: KioskPickupPaneProps) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState(() => session.customerPhone);
  const [summary, setSummary] = useState<KioskPickupSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collected, setCollected] = useState(false);

  useEffect(() => {
    if (session.pickupPrefill) {
      setOrderNumber(session.pickupPrefill);
      actions.setPickupPrefill(null);
    }
  }, [session.pickupPrefill, actions]);

  useEffect(() => {
    if (session.customerPhone && !phone) setPhone(session.customerPhone);
  }, [session.customerPhone, phone]);

  const reset = useCallback(() => {
    setOrderNumber('');
    setPhone('');
    setSummary(null);
    setError(null);
    setCollected(false);
    onReset?.();
  }, [onReset]);

  const lookup = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await fetch('/api/kiosk/pickup/lookup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderNumber, phone }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        summary?: KioskPickupSummary;
        error?: string;
      };
      if (res.status === 409 || body.error === 'ALREADY_COLLECTED') {
        throw new Error('This order was already collected.');
      }
      if (!res.ok || !body.summary) {
        throw new Error('No matching order found. Check the order number and phone.');
      }
      setSummary(body.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed.');
    } finally {
      setBusy(false);
    }
  };

  const collect = async () => {
    if (busy || !summary) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/kiosk/pickup/collect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          repairId: summary.repairId,
          phone,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        summary?: KioskPickupSummary;
        error?: string;
      };
      if (res.status === 409 || body.error === 'ALREADY_COLLECTED') {
        throw new Error('This order was already collected.');
      }
      if (!res.ok || !body.summary) {
        throw new Error('Could not mark this order collected. Try again.');
      }
      setSummary(body.summary);
      setCollected(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Collect failed.');
    } finally {
      setBusy(false);
    }
  };

  if (collected && summary) {
    return (
      <div className="flex h-full flex-col" data-testid="kiosk-pickup-pane">
        <div className={KIOSK_PANE_HEADER_BAND}>
          <h2 className={KIOSK_PANE_HEADER_TITLE}>Pickup</h2>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <span
            className={cn(
              'flex h-16 w-16 items-center justify-center bg-emerald-50 text-emerald-600',
              cornerClass('flush'),
            )}
          >
            <Check className="h-8 w-8" />
          </span>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Ready to hand over</h2>
            <p className="font-semibold text-text-soft">
              {summary.productTitle?.trim() || `RS-${summary.repairId}`} is marked collected.
            </p>
          </div>
        </div>
        <div className={KIOSK_PANE_FOOTER_BAND}>
          <Button
            size="lg"
            className={cn('h-full min-h-0 w-full flex-1 rounded-none', cornerClass('flush'))}
            onClick={reset}
          >
            Next customer
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="kiosk-pickup-pane">
      <div className={KIOSK_PANE_HEADER_BAND}>
        <h2 className={KIOSK_PANE_HEADER_TITLE}>Pickup</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col divide-y divide-border-hairline">
          <section>
            <h3 className={cn('border-b border-border-hairline px-4 py-2', KIOSK_SECTION_LABEL)}>
              Find your order
            </h3>
            <div className="space-y-3 px-4 py-4">
              <TextField
                label="Order or repair number"
                value={orderNumber}
                onChange={setOrderNumber}
                autoComplete="off"
                inputClassName="rounded-none"
                data-testid="kiosk-pickup-order"
              />
              <TextField
                label="Phone number on the order"
                value={phone}
                onChange={(v) => {
                  setPhone(v);
                  actions.setCustomer({ phone: v });
                }}
                inputMode="tel"
                autoComplete="tel"
                inputClassName="rounded-none"
              />
              {error && (
                <p className="text-center font-semibold text-text-danger">{error}</p>
              )}
            </div>
          </section>

          {summary && (
            <section>
              <h3 className={cn('border-b border-border-hairline px-4 py-2', KIOSK_SECTION_LABEL)}>
                Order ready
              </h3>
              <div className="space-y-3 px-4 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">
                    {summary.productTitle?.trim() || 'Repair order'}
                  </span>
                  <span className="text-role-caption font-semibold uppercase tracking-widest text-text-soft">
                    {summary.status}
                  </span>
                </div>
                <p className="text-sm font-semibold text-text-soft">
                  {summary.ticketNumber?.trim()
                    ? `Ticket ${summary.ticketNumber}`
                    : `RS-${summary.repairId}`}
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
      <div className={KIOSK_PANE_FOOTER_BAND}>
        {summary?.collectible ? (
          <Button
            size="lg"
            className={cn('h-full min-h-0 w-full flex-1 rounded-none', cornerClass('flush'))}
            disabled={busy}
            onClick={() => void collect()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Collecting…
              </>
            ) : (
              'Mark collected'
            )}
          </Button>
        ) : (
          <Button
            size="lg"
            className={cn('h-full min-h-0 w-full flex-1 rounded-none', cornerClass('flush'))}
            disabled={
              busy || orderNumber.trim().length < 1 || phone.replace(/\D/g, '').length < 7
            }
            onClick={() => void lookup()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Looking up…
              </>
            ) : (
              'Look up order'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
