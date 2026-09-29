'use client';

/**
 * Device-authed PIN step-up on the counter tablet — Pay-at-register, and the History face's door.
 * desktop `SwitchStaffSheet` mount (operator 2026-09-22: *"for the staff id for
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
  /** The picked staffer's display name — what an approval's "by …" line prints. */
  staffName: string;
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
  /** The sentence under the roster. */
  blurb?: string;
  /** Which roster the pad offers: */
  scope?: 'payment' | 'adjust_price' | 'receiving' | 'printing';
}

export function KioskPaymentStepUpSheet({
  open,
  onClose,
  onAuthorized,
  title = 'Authorize payment',
  blurb = 'A manager PIN authorizes payment at the register. Card details stay off this tablet.',
  scope = 'payment',
}: KioskPaymentStepUpSheetProps) {
  const [picked, setPicked] = useState<StaffPickerRow | null>(null);

  const submitPin = useCallback(
    async (pin: string) => {
      if (!picked) return { ok: false as const, error: 'Pick a staff member first.' };
      return onAuthorized({ staffId: picked.id, staffName: picked.name, pin });
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
              endpoint={`/api/kiosk/staff-for-stepup?scope=${scope}`}
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
