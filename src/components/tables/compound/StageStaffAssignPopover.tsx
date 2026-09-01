'use client';

/**
 * Single-lane staff assign combobox for a compound stage cell (Pick or Packed).
 *
 * Full active roster (no present-today / role filter): StaffAvatar left, name,
 * check on the selected row. No WorkOrder / StaffButtonGrid chrome and no
 * lane eyebrow in the panel — the column header already names the lane.
 * Persist is the caller's job (`useOrderAssignment`, optimistic).
 */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Command } from 'cmdk';
import { Check, Search } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity';
import { Popover } from '@/design-system/primitives/Popover';
import { cn } from '@/utils/_cn';
import { getActiveStaff } from '@/lib/staffCache';
import type { CompoundStageAssignRole } from './compound-row-model';

export type StageStaffAssignPopoverProps = {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Accessible name only — never painted as a panel eyebrow. */
  label: string;
  /** Which lane the host commits — does not filter the roster. */
  role: CompoundStageAssignRole;
  selectedStaffId: number | null;
  onCommit: (staffId: number | null, staffName: string | null) => void;
};

type StaffRow = { id: number; name: string };

export function StageStaffAssignPopover({
  open,
  onClose,
  anchorRef,
  label,
  selectedStaffId,
  onCommit,
}: StageStaffAssignPopoverProps) {
  const [options, setOptions] = useState<StaffRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const loadedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (loadedRef.current && options.length > 0) return;
    let cancelled = false;
    setLoading(true);
    getActiveStaff()
      .then((members) => {
        if (cancelled) return;
        const list = Array.isArray(members) ? members : [];
        setOptions(
          list
            .map((m) => ({ id: Number(m.id), name: m.name }))
            .filter((m) => Number.isFinite(m.id) && m.id > 0 && m.name.trim())
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        loadedRef.current = true;
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, options.length]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  const pick = (row: StaffRow) => {
    const next = selectedStaffId === row.id ? null : row.id;
    const name = next == null ? null : row.name;
    onCommit(next, name);
    onClose();
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-start"
      gap={4}
      role="listbox"
      aria-label={`Assign ${label}`}
      padded={false}
      className="w-[260px]"
      data-testid="stage-staff-assign-popover"
    >
      <Command
        shouldFilter={false}
        className="rounded-none bg-surface-card"
        onKeyDown={onListKeyDown}
        id={listId}
      >
        <div
          className="flex items-center gap-2 border-b border-border-hairline px-2.5 py-2"
          cmdk-input-wrapper=""
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="Search staff…"
            className="w-full bg-transparent text-role-micro text-text-default outline-none placeholder:text-text-faint"
          />
        </div>

        <Command.List className="max-h-56 overflow-y-auto py-1">
          {loading ? (
            <div className="px-3 py-3 text-center text-role-micro text-text-faint">
              Loading…
            </div>
          ) : (
            <Command.Empty className="px-3 py-4 text-center text-role-eyebrow uppercase tracking-wider text-text-faint">
              {options.length === 0 ? 'No staff' : 'No matches'}
            </Command.Empty>
          )}

          {filtered.map((row) => {
            const active = selectedStaffId === row.id;
            return (
              <Command.Item
                key={row.id}
                value={`${row.name} ${row.id}`}
                onSelect={() => pick(row)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 px-2.5 py-1.5 text-left outline-none transition-colors',
                  'data-[selected=true]:bg-surface-hover',
                  active ? 'bg-blue-50 text-blue-700' : 'text-text-default',
                )}
              >
                <StaffAvatar staffId={row.id} name={row.name} size="sm" colorRing alt="" />
                <span className="min-w-0 flex-1 truncate text-role-micro font-medium">
                  {row.name}
                </span>
                <Check
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    active ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden
                />
              </Command.Item>
            );
          })}
        </Command.List>
      </Command>
    </Popover>
  );
}
