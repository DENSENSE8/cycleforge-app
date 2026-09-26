'use client';

import { ChevronDown } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';

export const FILTER_DROPDOWN_SELECT_CLASS =
  cn(
    'h-9 w-full cursor-pointer appearance-none border border-border-soft bg-surface-card pl-2.5 pr-7 text-role-caption font-semibold text-text-default hover:border-border-emphasis',
    cornerClass('field'),
    focusRing('field', 'accent'),
  );

export const FILTER_DROPDOWN_LABEL_CLASS =
  'mb-1 block text-role-eyebrow uppercase tracking-wider text-text-soft';

interface FilterDropdownSelectOption {
  value: string | number;
  label: string;
}

interface FilterDropdownSelectProps {
  label: string;
  value: string | number | null;
  onChange: (value: string) => void;
  options: FilterDropdownSelectOption[];
  emptyOption: { value: string; label: string };
  ariaLabel?: string;
}

/** Shared native select row for FilterRefinementBar dropdown panels. */
export function FilterDropdownSelect({
  label,
  value,
  onChange,
  options,
  emptyOption,
  ariaLabel,
}: FilterDropdownSelectProps) {
  return (
    <label className="block">
      <span className={FILTER_DROPDOWN_LABEL_CLASS}>{label}</span>
      <div className="relative">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={FILTER_DROPDOWN_SELECT_CLASS}
          aria-label={ariaLabel ?? label}
        >
          <option value={emptyOption.value}>{emptyOption.label}</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
      </div>
    </label>
  );
}
