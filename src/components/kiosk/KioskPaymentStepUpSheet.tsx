'use client';

/**
 * Device-authed PIN step-up on the counter tablet — Pay-at-register, and the
 * History face's door.
 *
 * ## One picker, every surface
 *
 * The roster is `StaffPickerList`, the SAME component `/signin` and the
 * desktop `SwitchStaffSheet` mount (operator 2026-09-22: *"for the staff id for
 * history reuse the same component for the switching staff on desktop"*). Only
 * its inputs differ: the endpoint is the device-authed
 * `/api/kiosk/staff-for-stepup` (org from the device row, PIN-holders only) and
 * the transport is `kioskFetchHealed`, so a tablet that lost its `cf_kiosk`
 * cookie re-binds instead of showing an empty roster. The bespoke row list that
 * used to live here — its own fetch, its own avatar row, its own error copy —
 * is deleted: it was a second staff picker that could drift from the one every
 * other surface shows.
 *
 * Card data never enters this sheet — a PIN authorizes an ACT, and the act is
 * named by {@link KioskPaymentStepUpSheetProps.blurb}.
 */

import { useCallback, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { StaffPinPad } from '@/components/auth/StaffPinPad';
import {
  StaffPickerList,
  type StaffPickerRow,
} from '@/components/auth/StaffPickerList';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';

export type KioskPaymentStepUpResult = {
  staffId: number;
  pin: string;
};

interface KioskPaymentStepUpSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called after PIN entry. Resolve `{ ok: true }` to close, or
   * `{ ok: false; error }` to keep the pad open with an oracle-safe message.
   */
  onAuthorized: (
    creds: KioskPaymentStepUpResult,
  ) => Promise<{ ok: true } | { ok: false; error?: string }>;
  title?: string;
  /**
   * The sentence under the roster. It defaults to the payment wording this
   * sheet was born with, and every other caller MUST pass its own: the sheet
   * now gates History as well, and telling a staffer their PIN "authorizes
   * payment at the register" when it is about to open the customer book is a
   * consent prompt that names the wrong act.
   */
  blurb?: string;
}

export function KioskPaymentStepUpSheet({
  open,
  onClose,
  onAuthorized,
  title = 'Authorize payment',
  blurb = 'A manager PIN authorizes payment at the register. Card details stay off this tablet.',
}: KioskPaymentStepUpSheetProps) {
  const [picked, setPicked] = useState<StaffPickerRow | null>(null);

  const submitPin = useCallback(
    async (pin: string) => {
      if (!picked) return { ok: false as const, error: 'Pick a staff member first.' };
      return onAuthorized({ staffId: picked.id, pin });
    },
    [picked, onAuthorized],
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={picked ? undefined : title}
      maxWidth="28rem"
    >
      {picked ? (
        <StaffPinPad
          staff={picked}
          onSubmit={submitPin}
          onBack={() => setPicked(null)}
          submitLabel="Authorize"
        />
      ) : (
        <div className="space-y-4" data-testid="kiosk-stepup-roster">
          <p className="text-center text-role-caption text-text-soft">{blurb}</p>
          {/* Bounded + scrollable: the picker carries no height of its own, so
              on a tablet a long roster pushes rows below the viewport where
              they cannot be tapped. */}
          <div className="max-h-[55vh] min-h-0 overflow-y-auto overscroll-contain p-0.5">
            {/* `flat`: the sheet IS the card, so the picker's Panel would be a
                second outline. `open` keys the list so re-opening the sheet
                re-reads the roster rather than painting a stale one. */}
            <StaffPickerList
              key={open ? 'open' : 'closed'}
              endpoint="/api/kiosk/staff-for-stepup"
              fetcher={kioskFetchHealed}
              emptyMessage="No staff with a PIN are available. Ask a manager."
              pickVerb="Continue as"
              flat
              onPick={setPicked}
            />
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
