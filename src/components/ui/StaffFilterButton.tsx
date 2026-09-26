'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, User } from '@/components/Icons';
import { ToolbarButton } from '@/components/ui/ToolbarButton';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { STAFF_FILTER_PARAM, useStaffFilter } from '@/hooks/useStaffFilter';
import {
  FilterMenuGroupLabel,
  FilterMenuRow,
} from '@/components/ui/FilterMenu';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



/** `StaffFilterButton` — the ONE shared all-staff ↔ single-staff header control (P1-WORK-02). */
export function StaffFilterButton({
  iconOnly = false,
  align = 'end',
  allLabel = 'All staff',
  allToken,
  meLabel,
  density = 'toolbar',
  className,
}: {
  /** Square icon-only trigger for tight bands (label lives in the tooltip). */
  iconOnly?: boolean;
  /**
   * Popover edge alignment. Default `end` = open left (workbench SoT).
   * Only use `start` when the trigger sits on the far left of a band.
   */
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
  /** `toolbar` (default) — {@link ToolbarButton} densified to ops chrome `h-7` for Band 3 / View-topic clusters. */
  density?: 'toolbar' | 'field';
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

  const fieldActive = active || (!!token && !isExplicitAll);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {density === 'field' ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`Filter by staff: ${label}`}
            // Keep focus in the search field when opening the menu.
            onMouseDown={(e) => e.preventDefault()}
            className={`ds-raw-button relative inline-flex h-6 w-6 shrink-0 items-center justify-center transition-colors duration-100 ease-out active:scale-95 ${
              open || fieldActive ? 'text-blue-600' : 'text-text-faint hover:text-blue-600'
            } ${className ?? ''}`}
          >
            <HoverTooltip label={`Staff filter — ${label}`} focusable={false} asChild>
              <span className="relative inline-flex h-3.5 w-3.5 items-center justify-center leading-none">
                <User className="h-3.5 w-3.5" />
                {fieldActive ? (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-blue-500 ring-1 ring-surface-card"
                    aria-hidden
                  />
                ) : null}
              </span>
            </HoverTooltip>
          </button>
        ) : iconOnly ? (
          <ToolbarButton
            active={fieldActive}
            iconOnly
            aria-label={`Filter by staff: ${label}`}
            className={cn('h-7 w-7', className)}
          >
            <HoverTooltip label={`Staff filter — ${label}`} focusable={false}>
              <User className="h-3.5 w-3.5 shrink-0" />
            </HoverTooltip>
          </ToolbarButton>
        ) : (
          <ToolbarButton
            active={fieldActive}
            aria-label={`Filter by staff: ${label}`}
            className={cn('h-7 max-w-[160px]', className)}
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
          className={cn(
            'z-dropdown max-h-[60vh] w-52 overflow-y-auto border border-border-soft bg-surface-card p-1 shadow-lg ring-1 ring-black/5',
            DROPDOWN_SHELL_CORNER,
            focusRing('field', 'accent'),
          )}
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

/** The staff facet as MENU ROWS, for hosting inside the find field's one {@link FilterMenu} — no trigger, no glyph, no popover of its own. */
export function StaffFilterRows({
  allLabel = 'All staff',
  allToken,
  groupLabel = 'Staff',
  onPick,
}: {
  allLabel?: string;
  allToken?: string;
  /** Eyebrow above the rows — e.g. "Technician" on Testing. */
  groupLabel?: string;
  /** Called after a pick so the host funnel can close itself. */
  onPick?: () => void;
}) {
  const { staffId, options, setStaff } = useStaffFilter(allToken ? { allToken } : undefined);
  const searchParams = useSearchParams();
  const token = allToken?.trim().toLowerCase() || null;
  const rawStaff = searchParams.get(STAFF_FILTER_PARAM);
  const isExplicitAll = token != null && String(rawStaff || '').trim().toLowerCase() === token;
  const active = staffId != null;

  const pick = (id: number | null) => {
    setStaff(id);
    onPick?.();
  };

  return (
    <>
      <FilterMenuGroupLabel>{groupLabel}</FilterMenuGroupLabel>
      <FilterMenuRow
        label={allLabel}
        active={token ? isExplicitAll : !active}
        onClick={() => pick(null)}
      />
      {options.map((option) => (
        <FilterMenuRow
          key={option.id}
          label={option.name}
          active={option.id === staffId}
          onClick={() => pick(option.id)}
        />
      ))}
    </>
  );
}
