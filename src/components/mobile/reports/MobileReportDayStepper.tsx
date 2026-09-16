'use client';

/**
 * The day control for `/m/reports` — shared by every report tab.
 *
 * A STEPPER, not a picker, for the reason the checklist report already
 * documents: a manager reads yesterday, then the day before, and a walk
 * backwards is two taps at any distance while a calendar is a modal and a
 * keyboard. Forward is DISABLED on today rather than hidden, so the control
 * keeps its shape as the operator walks back and the thumb lands in the same
 * place every time.
 *
 * Extracted when the Packing tab landed: both tabs must read the SAME day, and
 * two steppers would be two days on one screen.
 */

import { ChevronLeft, ChevronRight } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { addDaysToDateKey, formatDateKeyMedium } from '@/utils/date';

export function MobileReportDayStepper({
  dateKey,
  today,
  onDateKey,
}: {
  dateKey: string;
  today: string;
  onDateKey: (next: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pb-3">
      <IconButton
        onClick={() => onDateKey(addDaysToDateKey(dateKey, -1))}
        ariaLabel="Previous day"
        size="touch"
        icon={<ChevronLeft aria-hidden className="h-5 w-5" />}
      />
      <p className="min-w-0 flex-1 truncate text-center text-role-caption font-semibold text-text-default">
        {dateKey === today ? 'Today' : formatDateKeyMedium(dateKey, { weekday: 'short' })}
      </p>
      <IconButton
        onClick={() => onDateKey(addDaysToDateKey(dateKey, 1))}
        ariaLabel="Next day"
        size="touch"
        disabled={dateKey >= today}
        icon={<ChevronRight aria-hidden className="h-5 w-5" />}
      />
    </div>
  );
}
