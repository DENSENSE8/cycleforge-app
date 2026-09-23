'use client';

/**
 * Pinless staff sign-in on the counter tablet.
 *
 * Callers: `KioskHistoryPane`. API: GET `/api/kiosk/staff-for-stepup?scope=signin`.
 * Schemas: none.
 * User 2026-09-22: *"Staff PIN — History no need, just staff sign in text at the
 * top. Remove the pin, use the same pinless sign in for the switching staff —
 * this is dogfood."*
 *
 * The roster IS `StaffPickerList`, the component `/signin` and the desktop
 * `SwitchStaffSheet` mount; the desk switch has been PIN-less since
 * 2026-09-15 and this is the same act on the tablet: name who is standing
 * there, so a reprint or an edit has a real actor on its audit row.
 *
 * It is NOT a step-up and must never gate money — {@link KioskPaymentStepUpSheet}
 * keeps the PIN pad for payment, which is the one act where a claim is not
 * good enough.
 */

import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  StaffPickerList,
  type StaffPickerRow,
} from '@/components/auth/StaffPickerList';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';

export function KioskStaffSignInSheet({
  open,
  onClose,
  onPick,
  blurb,
}: {
  open: boolean;
  onClose: () => void;
  /** The staffer who is now working this tablet. */
  onPick: (staff: StaffPickerRow) => void;
  /** What signing in opens, in the words of the surface that mounts this. */
  blurb?: string;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} title="Staff sign in" maxWidth="28rem">
      <div className="space-y-4" data-testid="kiosk-staff-signin">
        {blurb ? (
          <p className="text-center text-role-caption text-text-soft">{blurb}</p>
        ) : null}
        {/* The roster SCROLLS inside the sheet. `StaffPickerList` renders the
            whole org and carries no height of its own (on `/signin` the page
            is the scroller), so on a tablet the fifth row lands below the
            viewport and cannot be tapped — the same bound `SwitchStaffSheet`
            puts on it. */}
        <div className="max-h-[55vh] min-h-0 overflow-y-auto overscroll-contain p-0.5">
          {/* `flat`: the sheet IS the card, so the picker's Panel would be a
              second outline. Keyed on `open` so re-opening re-reads the roster
              rather than painting a stale one. */}
          <StaffPickerList
            key={open ? 'open' : 'closed'}
            endpoint="/api/kiosk/staff-for-stepup?scope=signin"
            fetcher={kioskFetchHealed}
            emptyMessage="No active staff. Ask a manager."
            pickVerb="Continue as"
            flat
            onPick={onPick}
          />
        </div>
      </div>
    </BottomSheet>
  );
}
