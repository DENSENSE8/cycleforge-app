'use client';

/**
 * Support context perspective switcher — industrial {@link TabDisplay} segment
 * (child layer under a Displays leaf / hub). Soft `rounded-full` pills are
 * banned on Station Displays nested grammar.
 */

import { TabDisplay } from '@/design-system/components';

export type SupportContextSegment = 'customer' | 'team' | 'activity';

const SEGMENTS: ReadonlyArray<{ id: SupportContextSegment; label: string }> = [
  { id: 'customer', label: 'Customer' },
  { id: 'team', label: 'Team' },
  { id: 'activity', label: 'Activity' },
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
  /** @deprecated Density is owned by TabDisplay nested — kept for call-site compat. */
  dense?: boolean;
  hideCustomer?: boolean;
}) {
  const items = hideCustomer ? SEGMENTS.filter((s) => s.id !== 'customer') : SEGMENTS;
  return (
    <TabDisplay
      tabs={[...items]}
      activeTab={value}
      onTabChange={(id) => onChange(id as SupportContextSegment)}
      density="nested"
      fit="fill"
      appearance="segment"
      aria-label="Support context"
    />
  );
}
