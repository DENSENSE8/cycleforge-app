'use client';

/**
 * The PIN step-up for a line's money verbs — a price adjustment, a custom amount, a comp.
 * line never comes here: it is a plain delete (operator 2026-09-24: "no need
 */

import { useCallback } from 'react';
import {
  KioskPaymentStepUpSheet,
  type KioskPaymentStepUpResult,
} from '@/components/kiosk/KioskPaymentStepUpSheet';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';
import type { PriceAdjustKind } from '@/lib/counter/counter-transaction-types';

/** What the staffer is asked to authorize. */
export interface KioskPriceApprovalRequest {
  kind: PriceAdjustKind;
  fromCents: number | null;
  toCents: number;
  reason: string;
}

export interface KioskPriceApproval {
  approval: string;
  staffId: number;
  staffName: string;
}

const TITLE: Record<PriceAdjustKind, string> = {
  adjust: 'Authorize price adjustment',
  custom: 'Authorize custom amount',
  comp: 'Authorize comp',
};

const BLURB: Record<PriceAdjustKind, string> = {
  adjust: 'A manager PIN approves this price. The original price stays on the record.',
  custom: 'A manager PIN approves an amount the catalog did not set.',
  comp: 'A manager PIN keeps this item on the bill at $0, with the reason.',
};

export function KioskPriceApprovalSheet({
  request,
  onClose,
  onApproved,
}: {
  /** Open while non-null. */
  request: KioskPriceApprovalRequest | null;
  onClose: () => void;
  onApproved: (approval: KioskPriceApproval) => void;
}) {
  const authorize = useCallback(
    async (creds: KioskPaymentStepUpResult) => {
      if (!request) return { ok: false as const, error: 'Nothing to authorize.' };
      const res = await kioskFetchHealed('/api/kiosk/price-approval', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ staffId: creds.staffId, pin: creds.pin, ...request }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        approval?: string;
        staffId?: number;
        error?: string;
      };
      if (res.status === 403) return { ok: false as const, error: 'PIN incorrect. Try again.' };
      if (!res.ok || !body.approval || !body.staffId) {
        return { ok: false as const, error: 'Could not authorize. Try again.' };
      }
      onApproved({ approval: body.approval, staffId: body.staffId, staffName: creds.staffName });
      return { ok: true as const };
    },
    [request, onApproved],
  );

  return (
    <KioskPaymentStepUpSheet
      open={request !== null}
      onClose={onClose}
      onAuthorized={authorize}
      scope="adjust_price"
      title={request ? TITLE[request.kind] : undefined}
      blurb={request ? BLURB[request.kind] : undefined}
    />
  );
}
