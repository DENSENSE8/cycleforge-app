'use client';

/**
 * `DateRangePickerField variant="range"` for a plain GET `<form>` on a server
 * page: the house field paints the face, two hidden inputs carry the civil
 * keys (`YYYY-MM-DD`) under the form's own field names so the server loader
 * reads them exactly as it read the pair of native `input type=date` this
 * replaces. No presets — an admin filter form already states its period.
 */

import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { dateKeyToLocalDate, localDateToDateKey } from '@/utils/date';

interface DateRangeFormFieldsProps {
  /** Hidden input name for the range start (e.g. `since`). */
  fromName: string;
  /** Hidden input name for the range end (e.g. `until`). */
  toName: string;
  /** `YYYY-MM-DD` seeds from the current URL, if any. */
  defaultFrom?: string | null;
  defaultTo?: string | null;
  placeholder?: string;
  className?: string;
}

export function DateRangeFormFields({
  fromName,
  toName,
  defaultFrom,
  defaultTo,
  placeholder,
  className,
}: DateRangeFormFieldsProps) {
  const [range, setRange] = useState<DateRange | undefined>(() => {
    const from = defaultFrom ? dateKeyToLocalDate(defaultFrom) : undefined;
    const to = defaultTo ? dateKeyToLocalDate(defaultTo) : undefined;
    return from || to ? { from, to } : undefined;
  });

  return (
    <>
      <DateRangePickerField
        variant="range"
        presets={[]}
        value={range}
        onChange={setRange}
        placeholder={placeholder}
        className={className}
      />
      <input type="hidden" name={fromName} value={localDateToDateKey(range?.from) ?? ''} />
      <input type="hidden" name={toName} value={localDateToDateKey(range?.to) ?? ''} />
    </>
  );
}
