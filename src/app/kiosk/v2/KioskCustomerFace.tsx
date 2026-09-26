'use client';

/** Customer face — same kiosk session, stripped of operational data. */

import { useEffect, useMemo, useState } from 'react';
import { SignaturePad, type SignatureData } from '@/components/ui/SignaturePad';
import {
  computeKioskCartTotals,
  cartHasRepairLine,
  isLinkedRepairLine,
  isRepairPayload,
} from '@/lib/kiosk/cart-line';
import { useKioskSession, useKioskSessionActions } from '@/lib/kiosk/kiosk-session-store';
import { KioskCartLineCard } from '@/components/kiosk/KioskCartLineCard';
import { KIOSK_CUSTOMER_FACE, KIOSK_SECTION_LABEL_ROW } from '@/app/kiosk/kiosk-chrome';

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * A linked repair was signed for when its ticket was written — asking the
 * customer to sign for it again would be a second agreement for one device.
 */
function needsUnsignedRepair(sessionLines: ReturnType<typeof useKioskSession>['lines']): boolean {
  return sessionLines.some(
    (line) =>
      line.type === 'REPAIR' &&
      isRepairPayload(line.payload) &&
      !isLinkedRepairLine(line) &&
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

  // Esc returns to Work — manual override so orientation won't flip back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        actions.setConsultStance('work', { manual: true });
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
    const repairLine = session.lines.find((l) => l.type === 'REPAIR' && !isLinkedRepairLine(l));
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
      {/* The customer sees the SAME line card the staff face shows (Phase 2):
          one card family, so the two screens cannot describe a line
          differently. Read-only here — the customer taps nothing. */}
      <ul
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
        aria-label="Your order"
      >
        {session.lines.length === 0 ? (
          <li className="px-6 py-12 text-center text-base font-semibold text-text-soft">
            No items yet.
          </li>
        ) : (
          session.lines.map((line) => (
            <li key={line.id}>
              <KioskCartLineCard line={line} readOnly />
            </li>
          ))
        )}
      </ul>

      {hasRepair && unsigned && (
        <section className="shrink-0 border-t border-border-soft">
          <h3 className={KIOSK_SECTION_LABEL_ROW}>
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
