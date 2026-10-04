'use client';

/** Pinless staff sign-in on the counter tablet. */

import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>Staff sign in</SheetTitle>
        </SheetHeader>
        <SheetBody>
          <div className="space-y-4" data-testid="kiosk-staff-signin">
            {blurb ? (
              <p className="text-center text-role-caption text-text-soft">{blurb}</p>
            ) : null}
            {/* The roster SCROLLS inside the sheet. */}
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
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
