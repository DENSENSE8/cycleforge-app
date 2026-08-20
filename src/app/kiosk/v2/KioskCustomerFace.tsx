'use client';

/**
 * Customer face — same kiosk session, stripped of operational data.
 *
 * Hides void / discount / cost notes. Read-only ledger + signature if a REPAIR
 * line needs one + calm Terminal wait (decaying timestamp, no bounce/glow).
 */

import { useEffect, useMemo, useState } from 'react';
import { SignaturePad, type SignatureData } from '@/components/repair/SignaturePad';
import { cn } from '@/utils/_cn';
import {
  computeKioskCartTotals,
  cartHasRepairLine,
  isRepairPayload,
} from '@/lib/kiosk/cart-line';
import {
  useKioskSession,
  useKioskSessionActions,
  lineTypeLabel,
} from '@/lib/kiosk/kiosk-session-store';
import {
  KIOSK_CART_LINE_ROW,
  KIOSK_CUSTOMER_FACE,
  KIOSK_META,
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
  KIOSK_SECTION_LABEL,
} from '@/app/kiosk/kiosk-chrome';

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function needsUnsignedRepair(sessionLines: ReturnType<typeof useKioskSession>['lines']): boolean {
  return sessionLines.some(
    (line) =>
      line.type === 'REPAIR' &&
      isRepairPayload(line.payload) &&
      !line.payload.signatureDataUrl,
  );
}

export function KioskCustomerFace() {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const totals = useMemo(
    () => computeKioskCartTotals(session.lines),
    [session.lines],
  );

  const unsigned = needsUnsignedRepair(session.lines);
  const hasRepair = cartHasRepairLine(session.lines);

  useEffect(() => {
    if (session.awaitingCardSinceMs == null) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session.awaitingCardSinceMs]);

  // Esc returns to staff — manual override so orientation won't flip back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        actions.setFace('staff', { manual: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  const awaitingAgoSec =
    session.awaitingCardSinceMs != null
      ? Math.max(0, Math.floor((nowMs - session.awaitingCardSinceMs) / 1000))
      : null;

  const onSignature = (data: SignatureData | null) => {
    const repairLine = session.lines.find((l) => l.type === 'REPAIR');
    if (!repairLine || !isRepairPayload(repairLine.payload)) return;
    actions.updateRepairLine(repairLine.id, {
      payload: {
        ...repairLine.payload,
        signatureDataUrl: data?.dataUrl ?? null,
        signatureStrokes: data?.strokes ?? null,
      },
    });
  };

  return (
    <div className={KIOSK_CUSTOMER_FACE} data-testid="kiosk-customer-face">
      <div className={KIOSK_PANE_HEADER_BAND}>
        <h2 className={KIOSK_PANE_HEADER_TITLE}>Your order</h2>
      </div>

      <ul className="min-h-0 flex-1 divide-y divide-border-hairline overflow-y-auto">
        {session.lines.length === 0 ? (
          <li className="px-6 py-12 text-center text-base font-semibold text-text-soft">
            No items yet.
          </li>
        ) : (
          session.lines.map((line) => (
            <li key={line.id} className={cn(KIOSK_CART_LINE_ROW, 'px-6 py-4')}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold">{line.title}</p>
                <p className={cn('uppercase tracking-widest', KIOSK_META)}>
                  {lineTypeLabel(line.type)}
                </p>
              </div>
              <span className="shrink-0 text-base font-semibold tabular-nums">
                {formatCents(line.unitAmountCents * line.quantity)}
              </span>
            </li>
          ))
        )}
      </ul>

      {hasRepair && unsigned && (
        <section className="shrink-0 border-t border-border-soft">
          <h3 className={cn('border-b border-border-hairline px-6 py-2', KIOSK_SECTION_LABEL)}>
            Sign to authorize service
          </h3>
          <div className="px-6 py-4">
            <SignaturePad
              variant="dropoff"
              label="Sign to authorize the service"
              allowFullscreen
              onSignatureChange={onSignature}
            />
          </div>
        </section>
      )}

      <div className="shrink-0 border-t border-border-soft px-6 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-text-soft">Total</span>
          <span className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatCents(totals.totalCents)}
          </span>
        </div>
        {awaitingAgoSec != null && (
          <p className="mt-3 text-center text-sm font-semibold text-text-soft" aria-live="polite">
            Waiting for card · {awaitingAgoSec}s ago
          </p>
        )}
        {awaitingAgoSec == null && !unsigned && session.lines.length > 0 && (
          <p className="mt-3 text-center text-sm font-semibold text-text-soft">
            Hand the tablet back when you are ready to pay at the terminal.
          </p>
        )}
      </div>

    </div>
  );
}
