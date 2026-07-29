'use client';

import { cn } from '@/utils/_cn';

export type SupportContextSegment = 'customer' | 'team' | 'activity';

const SEGMENTS: ReadonlyArray<{ id: SupportContextSegment; label: string }> = [
  { id: 'customer', label: 'Customer' },
  { id: 'team', label: 'Team' },
  { id: 'activity', label: 'Activity' },
];

export function SupportContextSegments({
  value,
  onChange,
  dense = false,
  /** Hide Customer when the host already shows the Zendesk thread. */
  hideCustomer = false,
}: {
  value: SupportContextSegment;
  onChange: (next: SupportContextSegment) => void;
  dense?: boolean;
  hideCustomer?: boolean;
}) {
  const items = hideCustomer ? SEGMENTS.filter((s) => s.id !== 'customer') : SEGMENTS;
  return (
    <div
      role="tablist"
      aria-label="Support context"
      className={cn(
        'inline-flex items-center rounded-full bg-surface-sunken p-0.5 ring-1 ring-inset ring-border-soft',
        dense ? 'gap-0' : 'gap-0.5',
      )}
    >
      {items.map((s) => {
        const active = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(s.id)}
            className={cn(
              'ds-raw-button rounded-full px-2.5 py-1 text-role-eyebrow uppercase tracking-widest transition-colors',
              active
                ? 'bg-surface-card text-text-default shadow-sm'
                : 'text-text-soft hover:text-text-muted',
            )}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
