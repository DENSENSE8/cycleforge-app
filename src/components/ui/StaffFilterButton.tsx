'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, User } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { STAFF_FILTER_PARAM, useStaffFilter } from '@/hooks/useStaffFilter';

/**
 * `StaffFilterButton` — the ONE shared all-staff ↔ single-staff header control
 * (P1-WORK-02). A {@link ToolbarButton} pill that opens a body-portal popover of
 * active staff and writes the canonical `?staff=` URL param via
 * {@link useStaffFilter}. Absent param = ALL staff (every surface's default);
 * picking the active staff again clears back to ALL — unless {@link allToken}
 * is set (absent = Me default for the caller; token = explicit all).
 */
export function StaffFilterButton({
  iconOnly = false,
  align = 'end',
  allLabel = 'All staff',
  allToken,
  meLabel,
  className,
}: {
  /** Square icon-only trigger for tight bands (label lives in the tooltip). */
  iconOnly?: boolean;
  align?: 'start' | 'end';
  /** Trigger + reset-row label when All is selected. */
  allLabel?: string;
  /**
   * When set (e.g. `'all'`), "All" writes `?staff=<token>` and absent param
   * means the caller's Me default — pass {@link meLabel} for the absent-state
   * trigger text.
   */
  allToken?: string;
  /** Trigger label when param is absent and {@link allToken} is set (Me default). */
  meLabel?: string;
  className?: string;
}) {
  const { staffId, options, selectedName, setStaff } = useStaffFilter(
    allToken ? { allToken } : undefined,
  );
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const token = allToken?.trim().toLowerCase() || null;
  const rawStaff = searchParams.get(STAFF_FILTER_PARAM);
  const isExplicitAll =
    token != null && String(rawStaff || '').trim().toLowerCase() === token;
  const active = staffId != null;
  const label = active
    ? selectedName || `#${staffId}`
    : isExplicitAll || !token
      ? allLabel
      : (meLabel ?? allLabel);

  const Row = ({ id, name }: { id: number | null; name: string }) => {
    const isActive =
      id === staffId || (id == null && (token ? isExplicitAll : !active));
    return (
      <button
        type="button"
        onClick={() => {
          setStaff(id);
          setOpen(false);
        }}
        className={`ds-raw-button flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-role-caption font-semibold transition-colors ${
          isActive ? 'bg-surface-accent text-text-accent' : 'text-text-muted hover:bg-surface-hover'
        }`}
      >
        <span className="truncate">{name}</span>
        {isActive ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
      </button>
    );
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {iconOnly ? (
          <ToolbarButton
            active={active || (!!token && !isExplicitAll)}
            iconOnly
            aria-label={`Filter by staff: ${label}`}
            className={className}
          >
            <HoverTooltip label={`Staff filter — ${label}`} focusable={false}>
              <User className="h-3.5 w-3.5 shrink-0" />
            </HoverTooltip>
          </ToolbarButton>
        ) : (
          <ToolbarButton
            active={active || (!!token && !isExplicitAll)}
            aria-label={`Filter by staff: ${label}`}
            className={`max-w-[160px] ${className ?? ''}`}
          >
            <User className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="min-w-0 truncate">{label}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </ToolbarButton>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={6}
          className="z-dropdown max-h-[60vh] w-52 overflow-y-auto rounded-lg border border-border-soft bg-surface-card p-1 shadow-lg ring-1 ring-black/5 focus:outline-none"
        >
          <Row id={null} name={allLabel} />
          {options.length > 0 ? <div className="my-1 h-px bg-surface-sunken" /> : null}
          {options.map((o) => (
            <Row key={o.id} id={o.id} name={o.name} />
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
