'use client';

/** Support context perspective switcher — the house child-mode combobox ({@link SearchableSelectField} `appearance="flush"`, the ticket… */

import { SearchableSelectField } from '@/design-system/components';

export type SupportContextSegment = 'customer' | 'team' | 'activity';

const SEGMENTS: ReadonlyArray<{
  value: SupportContextSegment;
  label: string;
}> = [
  { value: 'customer', label: 'Customer' },
  { value: 'team', label: 'Team' },
  { value: 'activity', label: 'Activity' },
];

export function SupportContextSegments({
  value,
  onChange,
  dense: _dense = false,
  /** Hide Customer when the host already shows the Zendesk thread. */
  hideCustomer = false,
}: {
  value: SupportContextSegment;
  onChange: (next: SupportContextSegment) => void;
  /** @deprecated Density is owned by the flush select — kept for call-site compat. */
  dense?: boolean;
  hideCustomer?: boolean;
}) {
  const items = hideCustomer
    ? SEGMENTS.filter((s) => s.value !== 'customer')
    : SEGMENTS;
  return (
    <SearchableSelectField
      appearance="flush"
      value={value}
      onChange={(next) => {
        if (next == null) return;
        onChange(next as SupportContextSegment);
      }}
      options={[...items]}
      placeholder="Pick a context…"
      searchPlaceholder="Type to filter…"
      emptyMessage="No contexts match"
      ariaLabel="Support context"
    />
  );
}
