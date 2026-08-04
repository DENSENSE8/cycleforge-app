'use client';

/**
 * Landscape Order Pickup pane — two-key lookup (order/RS# + phone) then collect.
 * No left catalog rail; never mounts staff LCPU / PickupWorkspace.
 */

import { useCallback, useState } from 'react';
import { Button, TextField } from '@/design-system/primitives';
import { Check, Loader2 } from '@/components/Icons';
import type { KioskPickupSummary } from '@/lib/kiosk/order-pickup';

interface KioskPickupPaneProps {
  onReset?: () => void;
}

export function KioskPickupPane({ onReset }: KioskPickupPaneProps) {
  const [orderNumber, setOrderNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [summary, setSummary] = useState<KioskPickupSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collected, setCollected] = useState(false);

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
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-5 px-6 py-12 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <Check className="h-8 w-8" />
        </span>
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Ready to hand over</h2>
          <p className="font-semibold text-text-soft">
            {summary.productTitle?.trim() || `RS-${summary.repairId}`} is marked collected.
          </p>
        </div>
        <Button size="lg" onClick={reset}>
          Next Customer
        </Button>
      </div>
    );
  }

  const SECTION_LABEL = 'text-role-micro uppercase tracking-[0.16em] text-text-soft';

  return (
    <div className="mx-auto w-full max-w-2xl space-y-10">
      <section className="space-y-4">
        <h3 className={SECTION_LABEL}>Find your order</h3>
        <div className="space-y-4 rounded-xl border border-border-soft bg-surface-card p-5">
          <TextField
            label="Order or repair number"
            value={orderNumber}
            onChange={setOrderNumber}
            autoComplete="off"
          />
          <TextField
            label="Phone number on the order"
            value={phone}
            onChange={setPhone}
            inputMode="tel"
            autoComplete="tel"
          />
          <Button
            size="lg"
            className="w-full"
            disabled={busy || orderNumber.trim().length < 1 || phone.replace(/\D/g, '').length < 7}
            onClick={() => void lookup()}
          >
            {busy && !summary ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Looking up…
              </>
            ) : (
              'Look up order'
            )}
          </Button>
        </div>
      </section>

      {summary && (
        <section className="space-y-4">
          <h3 className={SECTION_LABEL}>Order ready</h3>
          <div className="space-y-3 rounded-xl border border-border-soft bg-surface-card p-5">
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
            {summary.collectible && (
              <Button
                size="lg"
                className="w-full"
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
            )}
          </div>
        </section>
      )}

      {error && (
        <p className="text-center font-semibold text-text-danger">{error}</p>
      )}
    </div>
  );
}
