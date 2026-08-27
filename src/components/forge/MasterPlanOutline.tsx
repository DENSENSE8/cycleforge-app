'use client';

/**
 * Plans Live left TOC — sections from {@link buildMasterPlanOutline} (## headings).
 * Selection is URL `?ticket=`; the parent list stays on screen (D6).
 */

import { useMemo } from 'react';
import { buildMasterPlanOutline } from '@/lib/master-plan/outline';
import { cn } from '@/utils/_cn';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-amber-500',
  'in-progress': 'bg-blue-500',
  deployed: 'bg-emerald-500',
};

export function MasterPlanOutline({
  mdx,
  selectedTicketId,
  onSelect,
}: {
  mdx: string;
  selectedTicketId: string | null;
  onSelect: (ticketId: string) => void;
}) {
  const sections = useMemo(() => buildMasterPlanOutline(mdx), [mdx]);

  if (sections.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-role-caption text-text-muted">
        No tickets in the plan yet.
      </div>
    );
  }

  return (
    <nav aria-label="Master plan tickets" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {sections.map((sec) => (
        <div key={sec.heading} className="border-b border-border-hairline last:border-b-0">
          <p className="sticky top-0 z-10 truncate bg-surface-card px-3 py-1.5 text-role-eyebrow uppercase tracking-[0.18em] text-text-faint">
            {sec.heading}
            <span className="ml-1.5 tabular-nums text-text-soft">{sec.tickets.length}</span>
          </p>
          <ul className="pb-1">
            {sec.tickets.map((t) => {
              const selected = t.ticketId === selectedTicketId;
              const dot = t.status ? STATUS_DOT[t.status] : 'bg-rose-500';
              const label = t.status ?? 'invalid';
              return (
                <li key={t.ticketId}>
                  {/* ds-raw-button: full-row TOC selector, not a standalone Button action */}
                  <button
                    type="button"
                    onClick={() => onSelect(t.ticketId)}
                    aria-current={selected ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors',
                      selected
                        ? 'bg-surface-sunken ring-1 ring-inset ring-border-focus'
                        : 'hover:bg-surface-sunken/60',
                    )}
                  >
                    <HoverTooltip label={label} focusable={false}>
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} />
                    </HoverTooltip>
                    <span className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default">
                      {t.ticketId}
                    </span>
                    <span className="shrink-0 text-role-micro uppercase tracking-widest text-text-faint">
                      {label === 'in-progress' ? 'active' : label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
